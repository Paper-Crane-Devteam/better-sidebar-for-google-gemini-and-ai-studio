// Zero new npm dependencies: exercise OOXML fixtures and optional independently generated PPTX.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp = await mkdtemp(join(tmpdir(), 'pptx-test-'));
try {
  await build({ stdin: { contents: 'export * from "./src/shared/documents/pptx/index.ts"; export * from "./src/shared/documents/pptx/model.ts";', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: join(temp, 'pptx.mjs') });
  const { pptxHandler: h, openDeck, notesName, relationships, resolve } = await import(pathToFileURL(join(temp, 'pptx.mjs')));
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const rel = (id, kind, target, extra = '') => `<Relationship Id="${id}" Type="${R}/${kind}" Target="${target}" ${extra}/>`;
  const rels = (...r) => `<Relationships xmlns="${REL}">${r.join('')}</Relationships>`;
  const textShape = (id, text, ph = '') => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p>${text}</a:p></p:txBody></p:sp>`;
  const run = (text, props = '') => `<a:r>${props}<a:t>${text}</a:t></a:r>`;
  const slide = body => `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree>${body}</p:spTree></p:cSld></p:sld>`;
  const note = `<p:notes xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree>${textShape(1, run('Original notes'), 'body')}${textShape(2, run('42'), 'sldNum')}</p:spTree></p:cSld></p:notes>`;
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="bin" ContentType="application/octet-stream"/>' + ['presentation.xml','slides/slide1.xml','slides/slide2.xml','slides/slide3.xml','notesSlides/notes1.xml','charts/chart1.xml'].map(n => `<Override PartName="/ppt/${n}" ContentType="application/xml"/>`).join('') + '</Types>',
    '_rels/.rels': rels(rel('main', 'officeDocument', 'ppt/presentation.xml')),
    'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s2"/><p:sldId id="257" r:id="s1"/><p:sldId id="258" r:id="s3"/></p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(...[1,2,3].map(i => rel(`s${i}`, 'slide', `slides/slide${i}.xml`))),
    'ppt/slides/slide1.xml': slide(textShape(1, run('Second'), 'title')),
    'ppt/slides/slide2.xml': slide(textShape(1, run('Title one'), 'title') + textShape(2, run('前缀 Hello', '<a:rPr b="1"/>') + run(' world 后缀', '<a:rPr i="1"/>')) + textShape(3, run('repeat repeat')) + textShape(4, run('before') + '<a:fld id="field" type="slidenum"><a:t>1</a:t></a:fld>' + run('after'))),
    'ppt/slides/slide3.xml': slide(textShape(1, run('Third'), 'title')),
    'ppt/slides/_rels/slide2.xml.rels': rels(rel('n','notesSlide','../notesSlides/notes1.xml'), rel('c','chart','../charts/chart1.xml'), rel('img','image','../media/image.bin'), rel('link','hyperlink','https://example.com/','TargetMode="External"')),
    'ppt/notesSlides/notes1.xml': note,
    'ppt/notesSlides/_rels/notes1.xml.rels': rels(rel('s','slide','../slides/slide2.xml')),
    'ppt/charts/chart1.xml': '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>',
    'ppt/charts/_rels/chart1.xml.rels': rels(rel('b','package','../embeddings/book.bin')),
    'ppt/embeddings/book.bin': new Uint8Array([8,4,2]), 'ppt/media/image.bin': new Uint8Array([1,2,3]),
  };
  const pack = f => zipSync(Object.fromEntries(Object.entries(f).map(([n, v]) => [n, typeof v === 'string' ? strToU8(v) : v])));
  const doc = bytes => ({ bytes, path: 'test.pptx', size: bytes.length, modified: 0 });
  const original = doc(pack(files));
  const change = (d, ops) => h.edit(d, { kind: 'edit', path: d.path, ops });
  const read = (d, range = '1', more = {}) => h.read(d, { kind: 'read', path: d.path, mode: 'range', range, ...more });
  h.verify(original.bytes);
  assert.equal(h.outline(original).sections[0].label, 'Title one');
  assert.match(read(original).text, /前缀 Hello world 后缀/);
  assert.match(read(original).text, /Original notes/);
  assert.equal(read(original, '2', { mode: 'search', query: 'Second' }).text.includes('Second'), true);
  const full = read(original, '1-3').text;
  let range = '1-3', collected = '';
  do { const r = read(original, range, { maxChars: 43 }); collected += r.text; range = r.nextRange; } while (range);
  assert.equal(collected, full);
  const same = change(original, [{ op: 'replace_text', slide: 1, old_text: 'Hello', new_text: 'Hello' }]);
  assert.equal(same.bytes, original.bytes);
  const changed = change(original, [{ op: 'replace_text', slide: 1, shape: 2, old_text: 'Hello world', new_text: '你好 & <朋友>' }]);
  h.verify(changed.bytes);
  const changedFiles = unzipSync(changed.bytes);
  const xml = strFromU8(changedFiles['ppt/slides/slide2.xml']);
  assert.match(xml, /<a:rPr b="1"\/>/); assert.match(xml, /<a:rPr i="1"\/>/);
  assert.match(read(doc(changed.bytes)).text, /前缀 你好 & <朋友> 后缀/);
  for (const [name, bytes] of Object.entries(unzipSync(original.bytes))) if (name !== 'ppt/slides/slide2.xml') assert.deepEqual(changedFiles[name], bytes, `Untouched part ${name}`);
  for (const old_text of ['repeat', 'beforeafter', 'missing']) assert.throws(() => change(original, [{ op: 'replace_text', slide: 1, old_text, new_text: 'x' }]), /matched/);
  assert.throws(() => change(original, [{ op: 'replace_text', slide: 1, old_text: 'Hello', new_text: 'bad\u0001' }]), /invalid XML/);
  assert.throws(() => change(original, [{ op: 'set_notes', slide: 1, text: '\uFFFF' }]), /invalid XML/);
  const noted = change(original, [{ op: 'set_notes', slide: 1, text: '新备注\n第二行' }, { op: 'set_notes', slide: 2, text: 'Created notes' }]);
  h.verify(noted.bytes);
  assert.match(read(doc(noted.bytes)).text, /新备注\n第二行/);
  assert.match(read(doc(noted.bytes), '2').text, /Created notes/);
  assert.match(strFromU8(unzipSync(noted.bytes)['ppt/notesSlides/notes1.xml']), />42</);
  const copied = change(original, [{ op: 'duplicate_slide', slide: 1 }, { op: 'set_notes', slide: 2, text: 'Copy only' }, { op: 'replace_text', slide: 2, old_text: 'Hello', new_text: 'Copy' }]);
  h.verify(copied.bytes);
  const d = openDeck(copied.bytes);
  assert.equal(d.slides.length, 4);
  assert.notEqual(notesName(d, d.slides[0]), notesName(d, d.slides[1]));
  assert.match(read(doc(copied.bytes), '1').text, /Original notes/);
  assert.match(read(doc(copied.bytes), '2').text, /Copy only/);
  const copyRels = relationships(d.archive, d.slides[1].name);
  const copyChart = resolve(d.slides[1].name, copyRels.find(r => r.type.endsWith('/chart')).target);
  assert.notEqual(copyChart, 'ppt/charts/chart1.xml');
  const copyBook = resolve(copyChart, relationships(d.archive, copyChart)[0].target);
  assert.notEqual(copyBook, 'ppt/embeddings/book.bin');
  assert.deepEqual(d.archive.bytes(copyBook), files['ppt/embeddings/book.bin']);
  assert.equal(resolve(d.slides[1].name, copyRels.find(r => r.type.endsWith('/image')).target), 'ppt/media/image.bin');
  const copyNote = notesName(d, d.slides[1]);
  assert.equal(resolve(copyNote, relationships(d.archive, copyNote).find(r => r.type.endsWith('/slide')).target), d.slides[1].name);
  const ordered = change(original, [{ op: 'reorder_slides', order: [3,1,2] }, { op: 'delete_slides', slides: [2] }]);
  h.verify(ordered.bytes);
  assert.deepEqual(h.outline(doc(ordered.bytes)).sections.map(s => s.label), ['Third','Second']);
  assert.throws(() => change(original, [{ op: 'delete_slides', slides: [1,2,3] }]), /leave/);
  assert.throws(() => change(original, [{ op: 'reorder_slides', order: [1,1,3] }]), /duplicate/);
  assert.throws(() => change(original, [{ op: 'set_notes', slide: 1, text: 'not saved' }, { op: 'unknown' }]), /Unsupported/);
  assert.match(read(original).text, /Original notes/);
  assert.throws(() => h.verify(pack({ ...files, 'ppt/slides/slide3.xml': files['ppt/slides/slide3.xml'].replace('</p:cSld>', '</wrong>') })), /XML/);
  assert.throws(() => h.verify(pack({ ...files, 'ppt/charts/_rels/chart1.xml.rels': rels(rel('b','package','missing.bin')) })), /Missing relationship/);
  assert.throws(() => change(doc(pack({ ...files, 'ppt/presentation.xml': files['ppt/presentation.xml'].replace('</p:presentation>', '<p:custShowLst/></p:presentation>') })), [{ op: 'duplicate_slide', slide: 1 }]), /custom shows/);
  const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="10" name="Group"/></p:nvGrpSpPr><p:grpSpPr/>${textShape(11,run('Group child'))}</p:grpSp>`;
  const table = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="12" name="Table"/></p:nvGraphicFramePr><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>' + run('Table cell') + '</a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  const complex = doc(pack({...files, 'ppt/slides/slide3.xml': slide(group + table)}));
  assert.equal(read(complex,'3').text.split('Group child').length - 1, 2); // title fallback + one child, not repeated by group
  const tableEdit = change(complex,[{op:'replace_text',slide:3,shape:12,old_text:'Table cell',new_text:'Updated cell'}]);
  assert.match(read(doc(tableEdit.bytes),'3').text,/Updated cell/);
  h.verify(tableEdit.bytes);
  const unsupported = doc(pack({...files, 'ppt/slides/_rels/slide2.xml.rels': rels(rel('x','comments','../charts/chart1.xml'))}));
  assert.throws(() => change(unsupported,[{op:'duplicate_slide',slide:1}]),/not supported/);
  const signed = doc(pack({...files, '_xmlsignatures/sig1.xml':'<Signature/>'}));
  assert.throws(() => change(signed,[{op:'set_notes',slide:1,text:'no'}]),/Signed/);
  const cleared = change(original,[{op:'set_notes',slide:1,text:''}]);
  assert.doesNotMatch(read(doc(cleared.bytes)).text,/Original notes/);
  assert.equal(change(original,[{op:'reorder_slides',order:[1,2,3]}]).bytes,original.bytes);
  const searchAll = read(original,'1-3',{mode:'search',query:'e'}).text;
  let searchRange='1-3', searchText='';
  do { const result=read(original,searchRange,{mode:'search',query:'e',maxChars:20});searchText+=result.text;searchRange=result.nextRange; } while(searchRange);
  assert.equal(searchText,searchAll);
  console.log('PPTX fixtures passed: range continuation, runs/formatting, notes, dependency cloning, ordering, no-op, rollback and malformed packages.');
  if (process.env.PPTX_FIXTURE) {
    const real = doc(new Uint8Array(await readFile(process.env.PPTX_FIXTURE)));
    h.verify(real.bytes);
    const result = change(real, [{ op: 'replace_text', slide: 1, old_text: 'Hello world', new_text: '你好世界' }, { op: 'duplicate_slide', slide: 1 }, { op: 'set_notes', slide: 2, text: 'Independent copy notes' }, { op: 'set_notes', slide: 3, text: 'Created notes' }]);
    h.verify(result.bytes);
    await writeFile(`${process.env.PPTX_FIXTURE}.edited.pptx`, result.bytes);
    console.log('Independent producer fixture edited and verified.');
  }
} finally { await rm(temp, { recursive: true, force: true }); }
