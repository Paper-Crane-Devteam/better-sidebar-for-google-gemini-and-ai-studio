/** Small OPC mutations. Shared masters/media stay shared; mutable slide dependencies are cloned. */
import { applyEdits, attr, element, elements, escapeXml, tokenize, type ElementRange, type XmlPart } from '../ooxml/xml-cursor';
import { DocumentError } from '../types';
import type { Archive } from '../zip';
import { REL, relationships, relsName, resolve } from './model';
export function outer(p: XmlPart, e: ElementRange) { return p.source.slice(e.outerStart, e.outerEnd); }
export function setAttr(xml: string, name: string, value: string): string {
  const pattern = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*')`);
  if (!pattern.test(xml)) throw new DocumentError(`Missing ${name} attribute.`);
  return xml.replace(pattern, (_all, lead) => `${lead}"${escapeXml(value)}"`);
}
export function append(xml: string, rootName: string, child: string): string {
  const part = tokenize(xml), root = element(part, rootName);
  if (!root) throw new DocumentError(`Missing ${rootName}.`);
  if (root.selfClosing) return applyEdits(xml, [{ start: root.outerStart, end: root.outerEnd,
    text: outer(part, root).replace(/\/>$/, `>${child}</${rootName}>`) }]);
  return applyEdits(xml, [{ start: root.innerEnd, end: root.innerEnd, text: child }]);
}
export function addRel(archive: Archive, source: string, type: string, target: string): string {
  const name = relsName(source), current = archive.textOrNull(name) || `<Relationships xmlns="${REL}"/>`;
  const ids = new Set(relationships(archive, source).map(r => r.id));
  let n = 1; while (ids.has(`rId${n}`)) n++;
  const id = `rId${n}`;
  archive.setText(name, append(current, 'Relationships', `<Relationship Id="${id}" Type="${escapeXml(type)}" Target="/${escapeXml(target)}"/>`));
  return id;
}
export function addType(archive: Archive, name: string, type: string) {
  archive.setText('[Content_Types].xml', append(archive.text('[Content_Types].xml'), 'Types',
    `<Override PartName="/${escapeXml(name)}" ContentType="${escapeXml(type)}"/>`));
}
export function freshName(archive: Archive, source: string): string {
  const dot = source.lastIndexOf('.');
  let i = 1, name: string;
  do { name = `${source.slice(0, dot)}_copy${i++}${source.slice(dot)}`; } while (archive.has(name));
  return name;
}
export function cloneSlide(archive: Archive, source: string): string {
  const copies = new Map<string, string>();
  const types = tokenize(archive.text('[Content_Types].xml'));
  function clone(name: string): string {
    const known = copies.get(name); if (known) return known;
    const fresh = freshName(archive, name); copies.set(name, fresh);
    archive.setBytes(fresh, archive.bytes(name));
    const override = elements(types, 'Override').find(e => attr(types, e, 'PartName') === `/${name}`);
    if (override) addType(archive, fresh, attr(types, override, 'ContentType')!);
    const relXml = archive.textOrNull(relsName(name));
    if (relXml) {
      const p = tokenize(relXml);
      const edits = relationships(archive, name).filter(r => !r.external).map(r => {
        const target = resolve(name, r.target), kind = r.type.slice(r.type.lastIndexOf('/') + 1);
        const shared = ['slideLayout', 'slideMaster', 'notesMaster', 'theme', 'image', 'audio', 'video', 'media', 'font', 'hyperlink'];
        let dest: string;
        if (copies.has(target)) dest = copies.get(target)!;
        else if (shared.includes(kind) || kind === 'slide') dest = target;
        else if (['notesSlide', 'chart', 'package', 'chartStyle', 'chartColorStyle', 'diagramData', 'diagramLayout', 'diagramQuickStyle', 'diagramColors', 'diagramDrawing'].includes(kind)) dest = clone(target);
        else throw new DocumentError(`Copying a slide with ${kind} relationships is not supported.`);
        return { start: r.el.outerStart, end: r.el.outerEnd, text: setAttr(outer(p, r.el), 'Target', `/${dest}`) };
      });
      archive.setText(relsName(fresh), applyEdits(relXml, edits));
    }
    return fresh;
  }
  return clone(source);
}
