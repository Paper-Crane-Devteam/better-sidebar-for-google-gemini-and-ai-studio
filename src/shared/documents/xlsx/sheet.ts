/**
 * Walking one worksheet part into rows and cells.
 *
 * ## One pass, and a window
 *
 * `sheetData` is the whole sheet, and a real research workbook can hold hundreds of
 * thousands of cells. Building an object per cell for all of them would cost more memory
 * than the rest of the engine put together, for data no caller ever looks at — a read is
 * always a rectangle, and an outline only wants the first few rows.
 *
 * So rows are always recorded (one small object each, which is what makes the used range
 * and the row count cheap) and **cells are only materialised for rows inside the window**.
 * A caller that needs `A1:F200` asks for rows 1–200 and pays for 1200 cells.
 *
 * ## Offsets, again
 *
 * Every row and cell keeps its `ElementRange`, because editing a workbook is the same
 * splice-into-the-original operation as editing a document: replace one `<c>` and every
 * other byte of the sheet — the charts' cached values, the conditional formats, the pivot
 * ranges, somebody's careful column widths — is untouched because it is never regenerated.
 */

import {
  type ElementRange,
  type XmlPart,
  childElements,
  element,
  elements,
} from '../ooxml/xml-cursor';
import { extend, parseRangeRef, type GridRange } from './refs';

/** One `<c>` in the sheet, as written. */
export interface SheetCell {
  /** `C2`, from the element's own `r` attribute. */
  ref: string;
  row: number;
  column: number;
  el: ElementRange;
  /** The `s` attribute — an index into `cellXfs`. Null when the cell has no style. */
  styleIndex: number | null;
  /** The `t` attribute: `s`, `inlineStr`, `str`, `b`, `e`, `n`, or null for the default. */
  type: string | null;
  /** `<f>` body without the leading `=`, or null. */
  formula: string | null;
  /** A shared formula's bookkeeping, when this cell is part of one. */
  shared: SharedFormula | null;
  /** The raw `<v>` text, undecoded. Null when the cell has no value element. */
  value: string | null;
  /** `<is>` text for an inline string. */
  inline: string | null;
}

/**
 * A shared formula.
 *
 * Excel writes a formula down a column once — `<f t="shared" ref="C2:C99" si="0">A2*B2</f>`
 * on the host cell — and the other 97 cells carry only `<f t="shared" si="0"/>`.
 *
 * ⚠️ Which makes the host cell load-bearing for cells that do not mention it. Overwriting
 * `C2` deletes the only copy of the formula, and Excel then shows 97 empty cells where a
 * calculated column used to be. `edit.ts` refuses that rather than silently doing it.
 */
export interface SharedFormula {
  si: string;
  /** The range the host declares. Only the host has it. */
  ref: string | null;
  isHost: boolean;
}

export interface SheetRow {
  row: number;
  el: ElementRange;
  /** Column number → cell. Empty when the row is outside the parse window. */
  cells: Map<number, SheetCell>;
  /** Whether this row's cells were materialised. */
  loaded: boolean;
  /** The `spans` attribute, which becomes wrong when a cell is added outside it. */
  spans: string | null;
}

export interface ParsedSheet {
  xml: XmlPart;
  /** The `<worksheet>` root. */
  root: ElementRange;
  /** `<sheetData>`, or null in the rare sheet that has none. */
  sheetData: ElementRange | null;
  rows: Map<number, SheetRow>;
  /** Row numbers in ascending order. */
  rowNumbers: number[];
  /** `<dimension ref="…">` as declared by the producer. Often the fastest truth available. */
  declaredRange: GridRange | null;
  /** What the parsed content actually covers. Null when nothing was in the window. */
  observedRange: GridRange | null;
  /** Rows whose cells were skipped because they fell outside the window. */
  windowed: boolean;
}

export interface ParseWindow {
  fromRow: number;
  toRow: number;
}

/**
 * Read a worksheet.
 *
 * `window` limits which rows get their cells built. Omit it to load everything, which is
 * right for a small sheet and for any write path — a write has to see the cell it is
 * replacing.
 */
export function parseSheet(xml: XmlPart, window?: ParseWindow): ParsedSheet {
  const root = element(xml, 'worksheet');
  if (!root) {
    throw new Error('the part has no <worksheet> root');
  }

  const sheetData = element(xml, 'sheetData', root);
  const rows = new Map<number, SheetRow>();
  const rowNumbers: number[] = [];
  let observedRange: GridRange | null = null;
  let windowed = false;

  if (sheetData && !sheetData.selfClosing) {
    // `r` is optional on `<row>`: a producer may omit it, in which case the row number is its
    // position. Tracking a fallback counter keeps such a sheet readable instead of collapsing
    // every row onto row 0.
    let implicitRow = 0;

    for (const rowEl of childElements(xml, sheetData, 'row')) {
      const attrs = tagAttributes(xml.source, rowEl);
      const declared = Number(attrs.r);
      const row = Number.isFinite(declared) && declared > 0 ? declared : implicitRow + 1;
      implicitRow = row;

      const inWindow = !window || (row >= window.fromRow && row <= window.toRow);
      if (!inWindow) windowed = true;

      const cells = new Map<number, SheetCell>();
      if (inWindow && !rowEl.selfClosing) {
        for (const cellEl of childElements(xml, rowEl, 'c')) {
          const cell = readCell(xml, cellEl, row, cells.size);
          cells.set(cell.column, cell);
          observedRange = extend(observedRange, cell.row, cell.column);
        }
      }

      const entry: SheetRow = {
        row,
        el: rowEl,
        cells,
        loaded: inWindow,
        spans: attrs.spans ?? null,
      };
      rows.set(row, entry);
      rowNumbers.push(row);
    }
  }

  return {
    xml,
    root,
    sheetData,
    rows,
    // Sorted rather than assumed: rows are in order in every file Excel writes, but a
    // generated one can put them anywhere, and every consumer here reads this as "the rows,
    // in order".
    rowNumbers: rowNumbers.sort((a, b) => a - b),
    declaredRange: readDimension(xml, root),
    observedRange,
    windowed,
  };
}

/** `<dimension ref="A1:F2000"/>`, when the producer wrote a usable one. */
function readDimension(xml: XmlPart, root: ElementRange): GridRange | null {
  const el = element(xml, 'dimension', root);
  if (!el) return null;
  const ref = tagAttributes(xml.source, el).ref;
  if (!ref) return null;
  try {
    return parseRangeRef(ref, null);
  } catch {
    // A malformed dimension is a hint we can do without — the observed range replaces it.
    return null;
  }
}

/**
 * Build one cell.
 *
 * `fallbackColumn` covers a `<c>` with no `r` attribute, which is legal and means "the next
 * column". Rare, but a sheet written by a code generator often looks like that, and without
 * the fallback every cell in such a row would land in column 0 and overwrite each other.
 */
function readCell(
  xml: XmlPart,
  el: ElementRange,
  row: number,
  fallbackColumn: number,
): SheetCell {
  const attrs = tagAttributes(xml.source, el);
  const position = attrs.r ? splitCellRef(attrs.r) : null;
  const column = position?.column ?? fallbackColumn + 1;
  const styleIndex = attrs.s !== undefined ? Number(attrs.s) : null;

  let formula: string | null = null;
  let shared: SharedFormula | null = null;
  let value: string | null = null;
  let inline: string | null = null;

  if (!el.selfClosing) {
    for (const child of childElements(xml, el)) {
      if (child.name === 'f') {
        formula = child.selfClosing
          ? ''
          : xml.source.slice(child.innerStart, child.innerEnd);
        const fAttrs = tagAttributes(xml.source, child);
        if (fAttrs.t === 'shared') {
          shared = {
            si: fAttrs.si ?? '',
            ref: fAttrs.ref ?? null,
            isHost: fAttrs.ref !== undefined,
          };
        }
      } else if (child.name === 'v') {
        value = child.selfClosing ? '' : xml.source.slice(child.innerStart, child.innerEnd);
      } else if (child.name === 'is') {
        // An inline string's text may be split across several `<r>` runs, exactly as in a
        // document, so every `<t>` under `<is>` is concatenated.
        inline = elements(xml, 't', child)
          .map((t) => (t.selfClosing ? '' : xml.source.slice(t.innerStart, t.innerEnd)))
          .join('');
      }
    }
  }

  return {
    ref: attrs.r ?? `${column}:${row}`,
    row,
    column,
    el,
    styleIndex: styleIndex !== null && Number.isFinite(styleIndex) ? styleIndex : null,
    type: attrs.t ?? null,
    formula,
    shared,
    value,
    inline,
  };
}

/** `C2` → its column and row, without the error handling `parseRef` does. */
function splitCellRef(ref: string): { row: number; column: number } | null {
  let i = 0;
  let column = 0;
  while (i < ref.length) {
    const code = ref.charCodeAt(i) & ~32;
    if (code < 65 || code > 90) break;
    column = column * 26 + (code - 64);
    i++;
  }
  const row = Number(ref.slice(i));
  if (column === 0 || !Number.isFinite(row) || row < 1) return null;
  return { row, column };
}

/**
 * Every attribute on one start tag, in a single scan.
 *
 * ⚠️ Not `attr()` from the cursor. That runs a freshly-built `RegExp` per lookup, which is
 * fine for the handful of attributes a document read asks about and is not fine here: a
 * 200k-cell sheet would build and execute six hundred thousand regexes. One pass over a
 * short tag is the same answer for a fraction of the cost.
 *
 * Values are returned raw. Cell references, style indices and formula ids contain no
 * entities, and the two places that do need unescaping (`<t>` text, formula bodies) go
 * through `unescapeXml` at the point of use.
 */
export function tagAttributes(
  source: string,
  el: ElementRange,
): Record<string, string> {
  const tag = source.slice(el.outerStart, el.selfClosing ? el.outerEnd : el.innerStart);
  const out: Record<string, string> = {};

  let i = 0;
  // Skip `<name`.
  while (i < tag.length && !isSpace(tag.charCodeAt(i))) i++;

  while (i < tag.length) {
    while (i < tag.length && isSpace(tag.charCodeAt(i))) i++;
    if (i >= tag.length) break;

    const nameStart = i;
    while (i < tag.length) {
      const c = tag.charCodeAt(i);
      if (c === 61 || c === 62 || c === 47 || isSpace(c)) break; // '=' '>' '/'
      i++;
    }
    const name = tag.slice(nameStart, i);
    if (name === '') {
      i++;
      continue;
    }

    while (i < tag.length && isSpace(tag.charCodeAt(i))) i++;
    if (tag.charCodeAt(i) !== 61) continue; // no '=' — a bare attribute, skip it
    i++;
    while (i < tag.length && isSpace(tag.charCodeAt(i))) i++;

    const quote = tag.charCodeAt(i);
    if (quote !== 34 && quote !== 39) continue;
    i++;
    const valueStart = i;
    while (i < tag.length && tag.charCodeAt(i) !== quote) i++;
    out[name] = tag.slice(valueStart, i);
    i++;
  }

  return out;
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}
