/**
 * Which XML parts of a docx hold text the user can see.
 *
 * Until now the model opened `word/document.xml` and stopped there, which meant a page
 * header, a footer and every footnote body were invisible: not readable, not searchable,
 * not editable, and — worst — not even mentioned, so the agent would confidently report
 * that a date it had been asked to change did not exist in the document.
 *
 * A Word package keeps that text in sibling parts, one per header/footer and one shared
 * part for footnotes and endnotes. They use the same `w:p` / `w:tbl` vocabulary as the
 * body, so once a part is opened the whole editing stack works on it unchanged. The only
 * thing that has to be invented is an **address space**, because `p12` in the body and
 * `p12` in a header are different paragraphs.
 *
 * ## Addresses
 *
 * The body keeps bare ids (`p12`, `t3`) — it is the overwhelmingly common case and
 * lengthening it would tax every read. Everything else carries a part prefix:
 *
 *     hd1:p1     first header part, first paragraph
 *     ft2:t1     second footer part, its first table
 *     fn:p4      footnotes part, fourth paragraph
 *     en:p1      endnotes part
 *
 * ⚠️ Header and footer numbering follows the **part file name**, not the order the
 * relationships happen to be listed in. `word/header2.xml` is always `hd2`, so an id the
 * agent read in one call still means the same part in the next one, and two reads of the
 * same file never disagree.
 */

import type { Archive } from '../zip';
import {
  type ElementRange,
  type XmlPart,
  attr,
  element,
  elements,
  tokenize,
} from '../ooxml/xml-cursor';

export type PartKind = 'body' | 'header' | 'footer' | 'footnotes' | 'endnotes';

export interface DocPart {
  kind: PartKind;
  /** Zip entry name, e.g. `word/header2.xml`. */
  name: string;
  /** Address prefix without the colon: `''` for the body, `hd1`, `ft2`, `fn`, `en`. */
  id: string;
  /** How to name it in prose: "the first-page header", "footnotes". */
  label: string;
  xml: XmlPart;
  /** The element whose children are numbered: `w:body`, `w:hdr`, `w:footnotes`… */
  root: ElementRange;
}

/** Root element expected in each kind of part. */
const ROOT_ELEMENT: Record<PartKind, string> = {
  body: 'w:body',
  header: 'w:hdr',
  footer: 'w:ftr',
  footnotes: 'w:footnotes',
  endnotes: 'w:endnotes',
};

const HEADER_REL = '/header';
const FOOTER_REL = '/footer';

/**
 * Prefix an id with its part, or leave a body id bare.
 *
 * One function so the format is stated once. Every place that builds an address and every
 * place that parses one goes through here or through `splitAddress`.
 */
export function addressIn(part: DocPart, localId: string): string {
  return part.kind === 'body' ? localId : `${part.id}:${localId}`;
}

/** `hd1:p3` → `{ partId: 'hd1', localId: 'p3' }`; `p3` → `{ partId: '', localId: 'p3' }`. */
export function splitAddress(address: string): { partId: string; localId: string } {
  const colon = address.indexOf(':');
  if (colon === -1) return { partId: '', localId: address };
  return {
    partId: address.slice(0, colon),
    localId: address.slice(colon + 1),
  };
}

/**
 * Open every part of the package that holds visible text, body first.
 *
 * A part that cannot be tokenised is **skipped rather than fatal**. A damaged header is
 * not a reason to refuse to read someone's thesis, and the alternative — throwing — turns
 * one unusual footer into "this file is not a Word document".
 */
export function openParts(
  archive: Archive,
  mainName: string,
  main: XmlPart,
  bodyRoot: ElementRange,
): DocPart[] {
  const parts: DocPart[] = [
    {
      kind: 'body',
      name: mainName,
      id: 'body',
      label: 'the document body',
      xml: main,
      root: bodyRoot,
    },
  ];

  const labels = headerFooterLabels(main);

  for (const entry of headerFooterParts(archive, mainName)) {
    const opened = openPart(archive, entry.name, entry.kind, entry.id, entry.label(labels));
    if (opened) parts.push(opened);
  }

  const notes = openPart(
    archive,
    siblingOf(mainName, 'footnotes.xml'),
    'footnotes',
    'fn',
    'footnotes',
  );
  if (notes) parts.push(notes);

  const endnotes = openPart(
    archive,
    siblingOf(mainName, 'endnotes.xml'),
    'endnotes',
    'en',
    'endnotes',
  );
  if (endnotes) parts.push(endnotes);

  return parts;
}

function openPart(
  archive: Archive,
  name: string,
  kind: PartKind,
  id: string,
  label: string,
): DocPart | null {
  const source = archive.textOrNull(name);
  if (source === null) return null;

  try {
    const xml = tokenize(source);
    const root = element(xml, ROOT_ELEMENT[kind]);
    if (!root || root.selfClosing) return null;
    return { kind, name, id, label, xml, root };
  } catch {
    return null;
  }
}

interface HeaderFooterEntry {
  name: string;
  kind: 'header' | 'footer';
  id: string;
  label(labels: Map<string, string>): string;
}

/**
 * Header and footer parts, numbered by file name.
 *
 * Found through the main part's relationships rather than by globbing the zip, because a
 * package can carry an orphaned `header4.xml` that no section references — editing that
 * would be work the user never sees.
 */
function headerFooterParts(archive: Archive, mainName: string): HeaderFooterEntry[] {
  const relsSource = archive.textOrNull(relsNameFor(mainName));
  if (!relsSource) return [];

  let rels: XmlPart;
  try {
    rels = tokenize(relsSource);
  } catch {
    return [];
  }

  const dir = directoryOf(mainName);
  const found: Array<{ name: string; kind: 'header' | 'footer'; relId: string }> = [];

  for (const rel of elements(rels, 'Relationship')) {
    const type = attr(rels, rel, 'Type') ?? '';
    const kind = type.endsWith(HEADER_REL)
      ? ('header' as const)
      : type.endsWith(FOOTER_REL)
        ? ('footer' as const)
        : null;
    if (!kind) continue;

    const target = attr(rels, rel, 'Target') ?? '';
    // External or absolute targets are not ours to edit.
    if (target === '' || /^[a-z]+:\/\//i.test(target)) continue;

    const name = target.startsWith('/')
      ? target.replace(/^\/+/, '')
      : `${dir}${target.replace(/^\.\//, '')}`;
    if (!archive.has(name)) continue;

    found.push({ name, kind, relId: attr(rels, rel, 'Id') ?? '' });
  }

  // Sorted by the trailing number in the file name so `hd1` is always `header1.xml`.
  // Deterministic ids across reads are the whole point; relationship order is not.
  const ordered = (kind: 'header' | 'footer') =>
    found
      .filter((f) => f.kind === kind)
      .sort((a, b) => numberIn(a.name) - numberIn(b.name) || a.name.localeCompare(b.name));

  const entries: HeaderFooterEntry[] = [];

  for (const [kind, prefix] of [
    ['header', 'hd'],
    ['footer', 'ft'],
  ] as const) {
    ordered(kind).forEach((f, index) => {
      entries.push({
        name: f.name,
        kind,
        id: `${prefix}${index + 1}`,
        label: (labels) => describeHeaderFooter(kind, labels.get(f.relId)),
      });
    });
  }

  return entries;
}

/**
 * Which section slot each header/footer relationship fills.
 *
 * `w:sectPr` references them by relationship id with a `w:type` of `default`, `first` or
 * `even`. Surfacing that is what makes the outline actionable: "the date is in the
 * first-page header" tells the agent which of three near-identical parts to open, where a
 * bare `hd1 / hd2 / hd3` would leave it guessing or reading all three.
 */
function headerFooterLabels(main: XmlPart): Map<string, string> {
  const labels = new Map<string, string>();

  for (const name of ['w:headerReference', 'w:footerReference'] as const) {
    for (const ref of elements(main, name)) {
      const relId = attr(main, ref, 'r:id');
      if (!relId || labels.has(relId)) continue;
      labels.set(relId, attr(main, ref, 'w:type') ?? 'default');
    }
  }

  return labels;
}

function describeHeaderFooter(kind: 'header' | 'footer', type: string | undefined): string {
  const slot =
    type === 'first'
      ? 'first-page '
      : type === 'even'
        ? 'even-page '
        : type === 'default'
          ? ''
          : '';
  return `the ${slot}${kind}`;
}

/** The digits in `word/header12.xml`, or a large number when there are none. */
function numberIn(name: string): number {
  const match = /(\d+)\.xml$/i.exec(name);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** `word/document.xml` → `word/`. */
export function directoryOf(partName: string): string {
  const slash = partName.lastIndexOf('/');
  return slash === -1 ? '' : partName.slice(0, slash + 1);
}

/** `word/document.xml` + `footnotes.xml` → `word/footnotes.xml`. */
export function siblingOf(partName: string, fileName: string): string {
  return `${directoryOf(partName)}${fileName}`;
}

/** `word/document.xml` → `word/_rels/document.xml.rels`. */
export function relsNameFor(partName: string): string {
  const dir = directoryOf(partName);
  return `${dir}_rels/${partName.slice(dir.length)}.rels`;
}
