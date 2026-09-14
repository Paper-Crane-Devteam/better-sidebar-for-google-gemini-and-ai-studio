import { registerHandler, type FormatHandler } from '../registry';
import { DocumentError } from '../types';
import { attr, element, elements, tokenize } from '../ooxml/xml-cursor';
import { openDeck, drawingPart, notesName, relationships, resolve } from './model';
import { edit } from './edit';
import { outline, read } from './read';

export function verify(bytes: Uint8Array): void {
  const d = openDeck(bytes), archive = d.archive;
  const types = tokenize(archive.text('[Content_Types].xml'));
  if (!element(types, 'Types')) throw new DocumentError('Content types root is missing.');
  for (const e of elements(types, 'Override')) {
    const name = (attr(types, e, 'PartName') || '').replace(/^\//, '');
    if (!archive.has(name)) throw new DocumentError(`Content type refers to missing part ${name}.`);
  }
  if (!d.slides.length || new Set(d.slides.map(s => s.id)).size !== d.slides.length || new Set(d.slides.map(s => s.rid)).size !== d.slides.length) {
    throw new DocumentError('Presentation must have slides with unique IDs and relationships.');
  }
  // The shared tokenizer preserves offsets; add nesting validation for saved package XML.
  for (const name of archive.names.filter(n => /\.(xml|rels)$/.test(n))) {
    const part = tokenize(archive.text(name)), stack: string[] = [];
    let roots = 0;
    for (const t of part.tokens) {
      if (t.kind === 'open' || t.kind === 'self') {
        if (!stack.length) roots++;
        if (t.kind === 'open') stack.push(t.name);
      } else if (t.kind === 'close' && stack.pop() !== t.name) throw new DocumentError(`Unbalanced XML in ${name}.`);
    }
    if (stack.length || roots !== 1) throw new DocumentError(`Invalid XML root/nesting in ${name}.`);
    if (name.endsWith('.rels')) {
      const source = name === '_rels/.rels' ? '' : name.replace(/(^|\/)\_rels\//, '$1').replace(/\.rels$/, '');
      const ids = new Set<string>();
      for (const r of relationships(archive, source)) {
        if (!r.id || ids.has(r.id)) throw new DocumentError(`Duplicate relationship in ${name}.`);
        ids.add(r.id);
        // URI fragments identify an element inside a part; percent escapes belong to OPC URIs.
        if (!r.external) {
          const target = resolve(source, decodeURI(r.target.split('#')[0]));
          if (!archive.has(target)) throw new DocumentError(`Missing relationship target ${target}.`);
        }
      }
    }
  }
  for (const s of d.slides) {
    drawingPart(archive.text(s.name), 'p:sld');
    const note = notesName(d, s); if (note) drawingPart(archive.text(note), 'p:notes');
  }
}
export const pptxHandler: FormatHandler = { format: 'pptx', extensions: ['pptx'], outline, read, edit, verify };
registerHandler(pptxHandler);
