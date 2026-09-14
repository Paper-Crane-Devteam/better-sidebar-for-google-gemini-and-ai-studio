/** PPTX package navigation. Slide order comes from presentation.xml, never filenames. */
import { openArchive, type Archive } from '../zip';
import { DocumentError } from '../types';
import { attr, element, elementAt, elements, tokenize, textOf, type XmlPart, type ElementRange } from '../ooxml/xml-cursor';

export const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
export const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
export function relsName(name: string): string {
  const slash = name.lastIndexOf('/');
  return `${name.slice(0, slash + 1)}_rels/${name.slice(slash + 1)}.rels`;
}
export function resolve(source: string, target: string): string {
  const path = target.startsWith('/') ? target.slice(1) : source.slice(0, source.lastIndexOf('/') + 1) + target;
  const result: string[] = [];
  for (const bit of path.split('/')) {
    if (bit === '..') { if (!result.length) throw new DocumentError('Relationship escapes package root.'); result.pop(); }
    else if (bit && bit !== '.') result.push(bit);
  }
  return result.join('/');
}
export interface Relationship { id: string; type: string; target: string; external: boolean; el: ElementRange }
export function relationships(archive: Archive, source: string): Relationship[] {
  const xml = archive.textOrNull(source ? relsName(source) : '_rels/.rels');
  if (!xml) return [];
  const part = tokenize(xml);
  return elements(part, 'Relationship').map(el => ({ el, id: attr(part, el, 'Id') ?? '',
    type: attr(part, el, 'Type') ?? '', target: attr(part, el, 'Target') ?? '',
    external: attr(part, el, 'TargetMode') === 'External' }));
}
export interface Slide { id: string; rid: string; name: string; el: ElementRange }
export function deck(archive: Archive) {
  const rootRel = relationships(archive, '').find(r => r.type.endsWith('/officeDocument') && !r.external);
  if (!rootRel) throw new DocumentError('PPTX has no presentation relationship.');
  const name = resolve('', rootRel.target);
  const part = tokenize(archive.text(name));
  const root = element(part, 'p:presentation');
  if (!root || attr(part, root, 'xmlns:p') !== P || attr(part, root, 'xmlns:r') !== R) {
    throw new DocumentError('Only transitional PPTX with standard p/r namespaces is supported. Re-save in PowerPoint first.');
  }
  const rels = relationships(archive, name);
  const list = element(part, 'p:sldIdLst', root);
  const slides: Slide[] = (list ? elements(part, 'p:sldId', list) : []).map(el => {
    const rid = attr(part, el, 'r:id') ?? '';
    const rel = rels.find(r => r.id === rid && r.type.endsWith('/slide') && !r.external);
    if (!rel) throw new DocumentError(`Missing slide relationship ${rid}.`);
    return { id: attr(part, el, 'id') ?? '', rid, name: resolve(name, rel.target), el };
  });
  return { archive, name, part, root, list, slides };
}
export function openDeck(bytes: Uint8Array) { return deck(openArchive(bytes)); }
export type Deck = ReturnType<typeof deck>;
export function slideAt(d: Deck, value: unknown): Slide {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/^slide/, ''));
  if (!Number.isInteger(n) || n < 1 || n > d.slides.length) throw new DocumentError(`slide must be 1–${d.slides.length}.`);
  return d.slides[n - 1];
}
export function notesName(d: Deck, slide: Slide): string | undefined {
  const rel = relationships(d.archive, slide.name).find(r => r.type.endsWith('/notesSlide') && !r.external);
  return rel ? resolve(slide.name, rel.target) : undefined;
}
export function drawingPart(xml: string, rootName: string): XmlPart {
  const part = tokenize(xml), root = element(part, rootName);
  if (!root || attr(part, root, 'xmlns:p') !== P || attr(part, root, 'xmlns:a') !== A) {
    throw new DocumentError('Unsupported DrawingML namespaces; re-save in PowerPoint first.');
  }
  return part;
}
export function paragraphText(part: XmlPart, p: ElementRange): string {
  let text = '';
  for (let i = p.openIndex + 1; i < p.closeIndex; i++) {
    const t = part.tokens[i];
    if (t.kind === 'open' && t.name === 'a:t') text += textOf(part, elementAt(part, i));
    else if (t.name === 'a:br' && (t.kind === 'self' || t.kind === 'open')) text += '\n';
  }
  return text;
}
export function shapes(part: XmlPart) {
  return ['p:sp', 'p:pic', 'p:graphicFrame', 'p:cxnSp', 'p:grpSp'].flatMap(kind => elements(part, kind).map(el => {
    const nv = element(part, 'p:cNvPr', el), ph = element(part, 'p:ph', el);
    // Group containers have no text of their own; their child shapes are listed separately.
    return { el, kind: kind.slice(2), id: nv ? attr(part, nv, 'id') ?? '' : '',
      name: nv ? attr(part, nv, 'name') ?? '' : '', placeholder: ph ? attr(part, ph, 'type') ?? 'obj' : '',
      text: kind === 'p:grpSp' ? '' : elements(part, 'a:p', el).map(p => paragraphText(part, p)).join('\n') };
  })).sort((a, b) => a.el.outerStart - b.el.outerStart);
}
export function notesBody(part: XmlPart) {
  return shapes(part).filter(s => s.kind === 'sp' && s.placeholder === 'body');
}
