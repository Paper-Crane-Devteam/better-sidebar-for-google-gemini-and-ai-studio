import type { LoadedDocument } from '../storage';
import type { EditOutcome } from '../registry';
import { DocumentError, type DocEditRequest, type DocOp } from '../types';
import { applyEdits, element, elementAt, elements, escapeXml, textOf, type Edit } from '../ooxml/xml-cursor';
import { A, P, R, deck, drawingPart, notesBody, notesName, openDeck, relationships, resolve, shapes, slideAt, type Deck, type Slide } from './model';
import { addRel, addType, cloneSlide, freshName, outer, setAttr } from './package';

function string(op: DocOp, key: string, empty = false): string {
  const v = op[key];
  if (typeof v !== 'string' || (!empty && !v)) throw new DocumentError(`${key} must be ${empty ? 'a' : 'a nonempty'} string.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)) throw new DocumentError(`${key} contains invalid XML characters.`);
  return v;
}
function replaceText(d: Deck, s: Slide, op: DocOp): boolean {
  const old = string(op, 'old_text'), replacement = string(op, 'new_text', true);
  if (/[\r\n\t\uFFFC]/.test(old + replacement)) throw new DocumentError('replace_text works within one paragraph and cannot insert tabs or line breaks.');
  const p = drawingPart(d.archive.text(s.name), 'p:sld');
  if (element(p, 'mc:AlternateContent')) throw new DocumentError('Text editing slides with alternate DrawingML representations is not supported.');
  const scope = op.shape === undefined ? undefined : shapes(p).find(s => s.id === String(op.shape));
  if (op.shape !== undefined && (!scope || scope.kind === 'grpSp')) throw new DocumentError('shape must identify an individual shape from doc_read.');
  const hits: { edits: Edit[] }[] = [];
  for (const paragraph of elements(p, 'a:p', scope?.el)) {
    // Fields and explicit breaks are boundaries: never turn a slide-number field into static text.
    const runs = elements(p, 'a:r', paragraph);
    let visible = '';
    const spans: { start: number; end: number; el: ReturnType<typeof elements>[number]; value: string }[] = [];
    for (let i = paragraph.openIndex + 1; i < paragraph.closeIndex; i++) {
      const token = p.tokens[i];
      if ((token.kind === 'open' || token.kind === 'self') && ['a:fld', 'a:br', 'a:tab'].includes(token.name)) visible += '\uFFFC';
      if (token.kind !== 'open' && token.kind !== 'self') continue;
      if (token.name !== 'a:t') continue;
      const t = elementAt(p, i);
      if (!runs.some(r => t.outerStart > r.outerStart && t.outerEnd < r.outerEnd)) continue;
      const value = textOf(p, t), start = visible.length; visible += value;
      spans.push({ start, end: visible.length, el: t, value });
    }
    for (let at = visible.indexOf(old); at !== -1; at = visible.indexOf(old, at + 1)) {
      const end = at + old.length, affected = spans.filter(s => s.end > at && s.start < end);
      if (!affected.length) continue;
      const edits = affected.map((span, index) => {
        const left = Math.max(0, at - span.start), right = Math.min(span.value.length, end - span.start);
        const value = span.value.slice(0, left) + (index === 0 ? replacement : '') + span.value.slice(right);
        return { start: span.el.innerStart, end: span.el.innerEnd, text: escapeXml(value) };
      });
      hits.push({ edits });
      if (hits.length > 1) throw new DocumentError('old_text matched more than once; use a unique quote and shape ID.');
    }
  }
  if (hits.length !== 1) throw new DocumentError(`old_text matched ${hits.length} times; use a unique quote and shape ID.`);
  if (old === replacement) return false;
  d.archive.setText(s.name, applyEdits(p.source, hits[0].edits)); return true;
}
function paragraphs(text: string) {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => `<a:p><a:r><a:t>${escapeXml(line)}</a:t></a:r></a:p>`).join('');
}
function setNotes(d: Deck, s: Slide, text: string): boolean {
  const name = notesName(d, s);
  if (name) {
    const p = drawingPart(d.archive.text(name), 'p:notes'), bodies = notesBody(p);
    if (bodies.length !== 1) throw new DocumentError('Expected one speaker-notes body placeholder.');
    if (bodies[0].text === text) return false;
    const body = element(p, 'p:txBody', bodies[0].el);
    if (!body) throw new DocumentError('Speaker-notes placeholder has no text body.');
    const ps = elements(p, 'a:p', body);
    if (!ps.length) throw new DocumentError('Speaker-notes body has no paragraphs.');
    const edits = ps.map((e, i) => ({ start: e.outerStart, end: e.outerEnd, text: i === 0 ? paragraphs(text) : '' }));
    d.archive.setText(name, applyEdits(p.source, edits));
  } else {
    if (!text) return false;
    const note = freshName(d.archive, 'ppt/notesSlides/notes.xml');
    d.archive.setText(note, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs(text)}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
    addType(d.archive, note, 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml');
    addRel(d.archive, s.name, `${R}/notesSlide`, note);
    addRel(d.archive, note, `${R}/slide`, s.name);
    const master = relationships(d.archive, d.name).find(r => r.type.endsWith('/notesMaster') && !r.external);
    if (master) { addRel(d.archive, note, `${R}/notesMaster`, resolve(d.name, master.target)); }
  }
  return true;
}
function structuralGuard(d: Deck) {
  if (element(d.part, 'p:custShowLst') || d.part.tokens.some(t => /:sectionLst$/.test(t.name))) {
    throw new DocumentError('Slide structural edits with custom shows or sections are not supported.');
  }
  if (!d.list || d.list.selfClosing) throw new DocumentError('Presentation has no slide list.');
}
function setOrder(d: Deck, entries: string[]) {
  d.archive.setText(d.name, applyEdits(d.part.source, [{ start: d.list!.innerStart, end: d.list!.innerEnd, text: entries.join('') }]));
}
export function edit(doc: LoadedDocument, request: DocEditRequest): EditOutcome {
  let d = openDeck(doc.bytes);
  if (d.archive.names.some(n => n.startsWith('_xmlsignatures/'))) throw new DocumentError('Signed presentations cannot be edited.');
  const applied: string[] = [], skipped: string[] = [];
  for (const op of request.ops) {
    d = deck(d.archive); // Later operations see earlier edits, including the current slide order.
    if (op.op === 'replace_text') {
      const s = slideAt(d, op.slide);
      if (replaceText(d, s, op)) applied.push(`slide${d.slides.indexOf(s) + 1}: ${String(op.old_text).slice(0, 160)} → ${String(op.new_text).slice(0, 160)}`);
      else skipped.push('Text already matches; unchanged.');
    } else if (op.op === 'set_notes') {
      const s = slideAt(d, op.slide), text = string(op, 'text', true);
      if (setNotes(d, s, text)) applied.push(`slide${d.slides.indexOf(s) + 1}: speaker notes replaced (${text.length} chars).`);
      else skipped.push('Speaker notes unchanged.');
    } else if (op.op === 'reorder_slides') {
      structuralGuard(d);
      if (!Array.isArray(op.order) || op.order.length !== d.slides.length) throw new DocumentError('order must list every current slide exactly once.');
      const order = op.order.map(v => slideAt(d, v));
      if (new Set(order).size !== d.slides.length) throw new DocumentError('order contains duplicate slides.');
      if (order.every((s, i) => s === d.slides[i])) { skipped.push('Slide order unchanged.'); continue; }
      setOrder(d, order.map(s => outer(d.part, s.el))); applied.push(`Slide order: ${op.order.join(', ')}.`);
    } else if (op.op === 'delete_slides') {
      structuralGuard(d);
      if (!Array.isArray(op.slides) || !op.slides.length) throw new DocumentError('slides must be a nonempty array of slide numbers.');
      const removed = new Set(op.slides.map(v => slideAt(d, v)));
      if (removed.size >= d.slides.length) throw new DocumentError('Must leave at least one slide.');
      // Keep package parts/relationships so shared resources and navigation targets never dangle.
      setOrder(d, d.slides.filter(s => !removed.has(s)).map(s => outer(d.part, s.el)));
      applied.push(`Removed ${removed.size} slides from presentation order; underlying parts retained (not secure erasure).`);
    } else if (op.op === 'duplicate_slide') {
      structuralGuard(d);
      const s = slideAt(d, op.slide), after = op.after === undefined ? d.slides.indexOf(s) + 1 : op.after;
      if (typeof after !== 'number' || !Number.isInteger(after) || after < 0 || after > d.slides.length) throw new DocumentError('after must be a slide position from 0 to the slide count.');
      const copy = cloneSlide(d.archive, s.name);
      const rid = addRel(d.archive, d.name, `${R}/slide`, copy);
      const id = Math.max(255, ...d.slides.map(s => Number(s.id))) + 1;
      if (!Number.isSafeInteger(id) || id >= 2147483648) throw new DocumentError('Slide ID space exhausted.');
      const xml = setAttr(setAttr(outer(d.part, s.el), 'id', String(id)), 'r:id', rid);
      const order = d.slides.map(s => outer(d.part, s.el)); order.splice(after, 0, xml); setOrder(d, order);
      applied.push(`Duplicated slide${d.slides.indexOf(s) + 1} after position ${after}.`);
    } else throw new DocumentError(`Unsupported PPTX op "${op.op}"; activate builtin-pptx-review.`);
  }
  return { bytes: applied.length ? d.archive.save() : doc.bytes, applied, skipped };
}
