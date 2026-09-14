/**
 * The workbook model — the package, its sheets, and what a cell actually means.
 *
 * Opens `xl/workbook.xml` (found through the relationships, never by name), lists the
 * sheets with their part names, and hands out lazily-parsed worksheets. Shared strings and
 * styles are loaded once and shared, because both are whole-workbook tables that every
 * sheet reads through.
 *
 * ## Addresses are Excel's own
 *
 * A sheet is named by its name, a cell by its A1 reference, a region by `Sheet1!A1:F200`.
 * No invented ids: the user can see all three on screen, so an address the agent reports is
 * one the user can check by looking, and an address the user types is one the agent can use
 * unchanged. This is the opposite of the docx side, where `p12` had to be invented because
 * Word shows the user nothing to point at — and it means the drift problem that makes
 * paragraph ids navigation-only does not exist here. `C2` is `C2` after any edit.
 *
 * ## What is loaded, and when
 *
 * | thing | when |
 * | --- | --- |
 * | workbook.xml, its rels | on open — it is small and everything needs it |
 * | sharedStrings.xml | first time a cell of type `s` is read |
 * | styles.xml | first time a number is read (to know whether it is a date) |
 * | a worksheet part | first time that sheet is touched, cells only inside the window |
 */

import { openArchive, looksLikeZip, type Archive } from '../zip';
import { DocumentError } from '../types';
import {
  type XmlPart,
  attr,
  element,
  elements,
  tokenize,
  unescapeXml,
} from '../ooxml/xml-cursor';
import { readStyleTable, type StyleTable } from './numfmt';
import {
  parseSheet,
  tagAttributes,
  type ParseWindow,
  type ParsedSheet,
} from './sheet';
import type { GridRange } from './refs';

/** Relationship type of the main part, shared with the docx side. */
const OFFICE_DOCUMENT_REL = '/officeDocument';

/** One entry in `<sheets>`, plus where its part lives. */
export interface SheetInfo {
  /** The tab name, as the user sees it. */
  name: string;
  /** Excel's own `sheetId`. Not a position and not an address — carried for writing only. */
  sheetId: string;
  relId: string;
  /** Zip entry name, e.g. `xl/worksheets/sheet1.xml`. */
  partName: string;
  /** 1-based tab position. */
  index: number;
  /** `hidden` or `veryHidden` sheets exist and hold data the user cannot see. */
  hidden: boolean;
}

/** A sheet that has been parsed, with the window it was parsed under. */
export interface Sheet {
  info: SheetInfo;
  parsed: ParsedSheet;
  /** Declared dimension when there is one, otherwise what the parse observed. */
  used: GridRange | null;
}

export interface Workbook {
  archive: Archive;
  /** Name of the workbook part, usually `xl/workbook.xml`. */
  bookName: string;
  book: XmlPart;
  sheets: SheetInfo[];
  /** Old Mac Excel's alternative epoch. Changes every date in the file. */
  date1904: boolean;
  styles: StyleTable;
  /** Shared string table, resolved on first use. */
  sharedString(index: number): string;
  /** Parse a sheet, or return the cached parse when the window is already covered. */
  sheet(info: SheetInfo, window?: ParseWindow): Sheet;
  /** Find a sheet by name, case-insensitively, or throw with the list of names. */
  find(name: string | null): SheetInfo;
}

export function openWorkbook(bytes: Uint8Array): Workbook {
  if (!looksLikeZip(bytes)) {
    throw new DocumentError(
      'This is not an .xlsx file. A .xlsx name with no zip header is usually a legacy ' +
        '.xls saved under the wrong extension — it has to be re-saved as .xlsx in Excel ' +
        'first. A .csv should be read with read_file instead.',
    );
  }

  const archive = openArchive(bytes);
  const bookName = findWorkbookPart(archive);
  const book = tokenize(archive.text(bookName));

  const relTargets = readRelationships(archive, bookName);
  const sheets = readSheets(archive, book, bookName, relTargets);

  if (sheets.length === 0) {
    throw new DocumentError(
      'This workbook declares no worksheets. It may be a template or a macro-only file.',
    );
  }

  const date1904 = readDate1904(book);

  let sharedStrings: string[] | null = null;
  const strings = () => {
    if (!sharedStrings) sharedStrings = readSharedStrings(archive, bookName);
    return sharedStrings;
  };

  let styleTable: StyleTable | null = null;
  const cachedSheets = new Map<string, { sheet: Sheet; window?: ParseWindow }>();

  const workbook: Workbook = {
    archive,
    bookName,
    book,
    sheets,
    date1904,
    get styles() {
      if (!styleTable) {
        styleTable = readStyleTable(archive.textOrNull(sibling(bookName, 'styles.xml')));
      }
      return styleTable;
    },

    sharedString(index) {
      const table = strings();
      return table[index] ?? '';
    },

    sheet(info, window) {
      const cached = cachedSheets.get(info.partName);
      // Reuse only when the cached parse covers at least what is being asked for. A cached
      // outline read (rows 1–30) must not answer a request for rows 400–500 with empty cells.
      if (cached && covers(cached.window, window)) return cached.sheet;

      const source = archive.textOrNull(info.partName);
      if (source === null) {
        throw new DocumentError(
          `Sheet "${info.name}" points at "${info.partName}", which is not in the file.`,
        );
      }

      let parsed: ParsedSheet;
      try {
        parsed = parseSheet(tokenize(source), window);
      } catch (e) {
        throw new DocumentError(
          `Sheet "${info.name}" could not be read: ${(e as Error).message}.`,
        );
      }

      const sheet: Sheet = {
        info,
        parsed,
        used: parsed.declaredRange ?? parsed.observedRange,
      };
      cachedSheets.set(info.partName, { sheet, window });
      return sheet;
    },

    find(name) {
      if (name === null || name.trim() === '') return sheets[0];
      const wanted = name.trim().toLowerCase();
      const match = sheets.find((s) => s.name.toLowerCase() === wanted);
      if (match) return match;

      // A bare number is accepted as a tab position, because "sheet 2" is how people talk and
      // refusing it costs a round to learn a name that is already listed in the outline.
      const asIndex = Number(wanted);
      if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= sheets.length) {
        return sheets[asIndex - 1];
      }

      throw new DocumentError(
        `This workbook has no sheet called "${name}". Its sheets are: ` +
          `${sheets.map((s) => s.name).join(', ')}.`,
      );
    },
  };

  return workbook;
}

/** Whether a cached parse window contains the one being requested. */
function covers(cached: ParseWindow | undefined, wanted: ParseWindow | undefined): boolean {
  if (!cached) return true; // the whole sheet was parsed
  if (!wanted) return false; // the whole sheet is wanted, only part is cached
  return cached.fromRow <= wanted.fromRow && cached.toRow >= wanted.toRow;
}

// ─── Package plumbing ────────────────────────────────────────────────────────

function findWorkbookPart(archive: Archive): string {
  const rels = archive.textOrNull('_rels/.rels');
  if (rels) {
    const part = tokenize(rels);
    for (const rel of elements(part, 'Relationship')) {
      const type = attr(part, rel, 'Type') ?? '';
      if (!type.endsWith(OFFICE_DOCUMENT_REL)) continue;
      const target = (attr(part, rel, 'Target') ?? '').replace(/^\/+/, '');
      if (target && archive.has(target)) return target;
    }
  }

  if (archive.has('xl/workbook.xml')) return 'xl/workbook.xml';

  throw new DocumentError(
    'Could not find the workbook part. The file may be a .docx or .pptx that was renamed ' +
      'to .xlsx.',
  );
}

/** Relationship id → resolved zip entry name, for the workbook's own rels. */
function readRelationships(archive: Archive, bookName: string): Map<string, string> {
  const targets = new Map<string, string>();
  const source = archive.textOrNull(relsNameFor(bookName));
  if (!source) return targets;

  const part = tokenize(source);
  const dir = directoryOf(bookName);

  for (const rel of elements(part, 'Relationship')) {
    const id = attr(part, rel, 'Id');
    const target = attr(part, rel, 'Target') ?? '';
    if (!id || target === '' || /^[a-z]+:\/\//i.test(target)) continue;
    // `Target` is relative to the part's folder unless it starts with `/`. `../` appears in
    // real files (a sheet stored outside `xl/`), so it has to be resolved rather than
    // concatenated.
    targets.set(id, resolveTarget(dir, target));
  }

  return targets;
}

function resolveTarget(dir: string, target: string): string {
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const segments = `${dir}${target}`.split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

function readSheets(
  archive: Archive,
  book: XmlPart,
  bookName: string,
  relTargets: Map<string, string>,
): SheetInfo[] {
  const container = element(book, 'sheets');
  if (!container) return [];

  const infos: SheetInfo[] = [];
  let index = 0;

  for (const el of elements(book, 'sheet', container)) {
    index++;
    const attrs = tagAttributes(book.source, el);
    const name = unescapeXml(attrs.name ?? `Sheet${index}`);
    const relId = attrs['r:id'] ?? '';
    // The relationship is how a sheet finds its part. Falling back to the conventional name
    // keeps a file with damaged rels readable instead of reporting an empty workbook.
    const partName =
      relTargets.get(relId) ?? `${directoryOf(bookName)}worksheets/sheet${index}.xml`;
    if (!archive.has(partName)) continue;

    const state = attrs.state ?? '';
    infos.push({
      name,
      sheetId: attrs.sheetId ?? String(index),
      relId,
      partName,
      index,
      hidden: state === 'hidden' || state === 'veryHidden',
    });
  }

  return infos;
}

function readDate1904(book: XmlPart): boolean {
  const pr = element(book, 'workbookPr');
  if (!pr) return false;
  const attrs = tagAttributes(book.source, pr);
  // Both spellings occur: `date1904` is the original, `dateCompatibility` the newer one.
  return attrs.date1904 === '1' || attrs.date1904 === 'true';
}

/**
 * The shared string table.
 *
 * Read but never written. Adding a string would mean maintaining `count` and `uniqueCount`
 * and every index that references it; `write.ts` uses `t="inlineStr"` instead, which is
 * standard, self-contained, and costs a few bytes per cell.
 *
 * ⚠️ `<si>` may contain either one `<t>` or several `<r><t>` runs (a cell with mixed
 * formatting). Taking only the first `<t>` silently truncates such a string at the first
 * formatting change — so every `<t>` under the `<si>` is concatenated.
 */
function readSharedStrings(archive: Archive, bookName: string): string[] {
  const source = archive.textOrNull(sibling(bookName, 'sharedStrings.xml'));
  if (!source) return [];

  let part: XmlPart;
  try {
    part = tokenize(source);
  } catch {
    return [];
  }

  return elements(part, 'si').map((si) =>
    unescapeXml(
      elements(part, 't', si)
        .map((t) => (t.selfClosing ? '' : part.source.slice(t.innerStart, t.innerEnd)))
        .join(''),
    ),
  );
}

export function directoryOf(partName: string): string {
  const slash = partName.lastIndexOf('/');
  return slash === -1 ? '' : partName.slice(0, slash + 1);
}

export function sibling(partName: string, fileName: string): string {
  return `${directoryOf(partName)}${fileName}`;
}

export function relsNameFor(partName: string): string {
  const dir = directoryOf(partName);
  return `${dir}_rels/${partName.slice(dir.length)}.rels`;
}
