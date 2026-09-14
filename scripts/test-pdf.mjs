// Generate independent PDFs, edit, then reopen with PDF.js and pdf-lib.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const canvas = require('@napi-rs/canvas');
Object.assign(globalThis, { DOMMatrix: canvas.DOMMatrix, Path2D: canvas.Path2D, ImageData: canvas.ImageData });
const temp = await mkdtemp(join(tmpdir(), 'pdf-test-'));
try {
  await build({ stdin: { contents: 'export * from "./src/shared/documents/pdf/edit.ts"; export * from "./src/shared/documents/pdf/read.ts";', resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: join(temp, 'pdf.mjs') });
  // Resolve external packages from this checkout rather than the temporary directory.
  const { symlink } = await import('node:fs/promises');
  await symlink(join(process.cwd(), 'node_modules'), join(temp, 'node_modules'));
  const { edit, verify, read, outline } = await import(pathToFileURL(join(temp, 'pdf.mjs')));
  const { PDFDocument, StandardFonts, PDFName } = await import('@cantoo/pdf-lib');
  async function fixture(form = false) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 3; i++) pdf.addPage([400, 500]).drawText(`Page ${i} unique phrase`, { font, x: 40, y: 400 });
    if (form) {
      pdf.getForm().createTextField('name').addToPage(pdf.getPage(0));
      pdf.getForm().createCheckBox('agree').addToPage(pdf.getPage(0));
      const dropdown = pdf.getForm().createDropdown('choice'); dropdown.addOptions(['One', 'Two']); dropdown.addToPage(pdf.getPage(1));
    }
    const bytes = await pdf.save();
    return { bytes, path: 'test.pdf', size: bytes.length, modified: 0 };
  }
  const original = await fixture();
  assert.match((await outline(original)).summary, /3 pages/);
  assert.match((await read(original, { kind: 'read', path: original.path, mode: 'range', range: '2' })).text, /Page 2/);
  const annotated = await edit(original, { kind: 'edit', path: original.path, ops: [
    { op: 'comment', page: 1, text: '中文批注' }, { op: 'highlight', page: 1, text: 'u nique  phrase' },
  ] });
  await verify(annotated.bytes);
  const commentText = (await read({ ...original, bytes: annotated.bytes }, { kind: 'read', path: original.path, mode: 'range', range: 'annotations:1' })).text;
  assert.match(commentText, /中文批注/); assert.match(commentText, /Highlight/);
  const changed = await edit(original, { kind: 'edit', path: original.path, ops: [
    { op: 'rotate_pages', pages: '1', degrees: 90 }, { op: 'watermark', pages: '1-3', text: 'DRAFT' },
    { op: 'page_numbers', pages: '1-3' }, { op: 'delete_pages', pages: '2' },
  ] });
  const changedPdf = await PDFDocument.load(changed.bytes);
  assert.equal(changedPdf.getPageCount(), 2); assert.equal(changedPdf.getPage(0).getRotation().angle, 90);
  assert.match((await read({ ...original, bytes: changed.bytes }, { kind: 'read', path: original.path, mode: 'range', range: '2' })).text, /Page 3/);
  const extracted = await edit(original, { kind: 'edit', path: original.path, ops: [{ op: 'extract_pages', pages: '2' }] });
  assert.equal((await PDFDocument.load(extracted.bytes)).getPageCount(), 1);
  const merged = await edit(original, { kind: 'edit', path: original.path, ops: [{ op: 'merge', source: 'other.pdf', pages: '3' }] }, { loadSource: async () => original });
  assert.equal((await PDFDocument.load(merged.bytes)).getPageCount(), 4);
  const longPdf = await PDFDocument.create();
  const longPage = longPdf.addPage();
  for (let line = 0; line < 30; line++) longPage.drawText('x'.repeat(60), { x: 10, y: 800 - line * 20, size: 10 });
  const longDoc = { ...original, bytes: await longPdf.save() };
  const chunk1 = await read(longDoc, { kind: 'read', path: longDoc.path, mode: 'range', range: '1', maxChars: 500 });
  assert.equal(chunk1.text.length, 500); assert.ok(chunk1.nextRange.includes('@'));
  const chunk2 = await read(longDoc, { kind: 'read', path: longDoc.path, mode: 'range', range: chunk1.nextRange, maxChars: 500 });
  assert.equal(chunk2.text.length, 500); assert.notEqual(chunk1.nextRange, chunk2.nextRange);
  const form = await fixture(true);
  const filled = await edit(form, { kind: 'edit', path: form.path, ops: [
    { op: 'fill_form', name: 'name', value: 'Alice' }, { op: 'fill_form', name: 'agree', value: true }, { op: 'fill_form', name: 'choice', value: 'Two' },
  ] });
  const fields = (await PDFDocument.load(filled.bytes)).getForm();
  assert.equal(fields.getTextField('name').getText(), 'Alice'); assert.equal(fields.getCheckBox('agree').isChecked(), true);
  assert.deepEqual(fields.getDropdown('choice').getSelected(), ['Two']);
  assert.match((await read({ ...form, bytes: filled.bytes }, { kind: 'read', path: form.path, mode: 'range', range: 'fields:1' })).text, /Alice/);
  for (const ops of [[{ op: 'delete_pages', pages: '1-3' }], [{ op: 'rotate_pages', pages: '0', degrees: 90 }], [{ op: 'replace_text', text: 'x' }], [{ op: 'highlight', page: 1, text: 'absent' }], [{ op: 'watermark', pages: '1', text: '中文' }]]) {
    await assert.rejects(() => edit(original, { kind: 'edit', path: original.path, ops }), JSON.stringify(ops));
  }
  await assert.rejects(() => edit(form, { kind: 'edit', path: form.path, ops: [{ op: 'delete_pages', pages: '1' }] }));
  console.log('PDF regression checks passed: read, Unicode comments, highlight, forms, rotation, watermark, numbering, delete/extract/merge and rejection cases.');
} finally { await rm(temp, { recursive: true, force: true }); }
