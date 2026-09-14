/**
 * A1 references — the coordinate system a workbook is addressed by.
 *
 * The docx side had to invent its address space (`p12`, `t3r2c1`) because Word has none.
 * Excel has one already, the user can see it on the sheet, and it is what they will type
 * in the chat. So the whole job here is parsing and formatting it faithfully, including
 * the forms nobody documents but everybody writes: `$A$1`, `A:C`, `2:40`, `'My Sheet'!B7`.
 *
 * ⚠️ Rows and columns are **1-based everywhere in this file and everywhere downstream**.
 * Excel's own numbering is 1-based, the XML stores it 1-based (`<row r="1">`), and a
 * 0-based internal convention would mean converting at every boundary — which is exactly
 * where an off-by-one becomes "the agent wrote the value one row too high" with nothing in
 * the output looking wrong.
 */

import { DocumentError } from '../types';

/** Excel's limits since 2007. Anything past them is a typo, not a big spreadsheet. */
export const MAX_ROW = 1048576;
export const MAX_COLUMN = 16384; // XFD

export interface CellRef {
  row: number;
  column: number;
}

/** A rectangle, inclusive on all four sides. */
export interface GridRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** `1` → `A`, `27` → `AA`. */
export function columnName(column: number): string {
  let n = column;
  let name = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name || 'A';
}

/** `A` → `1`, `AA` → `27`. Throws on anything that is not letters. */
export function columnNumber(name: string): number {
  if (name === '') throw new DocumentError('An empty column letter is not a reference.');
  let n = 0;
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i) & ~32; // uppercase, ASCII only
    if (code < 65 || code > 90) {
      throw new DocumentError(`"${name}" is not a column letter.`);
    }
    n = n * 26 + (code - 64);
  }
  if (n > MAX_COLUMN) {
    throw new DocumentError(`Column "${name}" is past Excel's last column (XFD).`);
  }
  return n;
}

/** `$A$1` and `a1` both parse. The `$` are absolute markers and carry no meaning here. */
const CELL_REF = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

export function parseRef(ref: string): CellRef {
  const match = CELL_REF.exec(ref.trim());
  if (!match) {
    throw new DocumentError(
      `"${ref}" is not a cell reference. Write it like "B7" or "Sheet1!B7".`,
    );
  }
  const row = Number(match[2]);
  if (row < 1 || row > MAX_ROW) {
    throw new DocumentError(`Row ${row} is outside a worksheet (1–${MAX_ROW}).`);
  }
  return { row, column: columnNumber(match[1]) };
}

export function formatRef(row: number, column: number): string {
  return `${columnName(column)}${row}`;
}

export function formatRange(range: GridRange): string {
  return `${formatRef(range.top, range.left)}:${formatRef(range.bottom, range.right)}`;
}

/** A reference to one cell reads as itself, not as `A1:A1`. */
export function describeRange(range: GridRange): string {
  return range.top === range.bottom && range.left === range.right
    ? formatRef(range.top, range.left)
    : formatRange(range);
}

export function rangeRows(range: GridRange): number {
  return range.bottom - range.top + 1;
}

export function rangeColumns(range: GridRange): number {
  return range.right - range.left + 1;
}

export function inRange(range: GridRange, row: number, column: number): boolean {
  return (
    row >= range.top && row <= range.bottom && column >= range.left && column <= range.right
  );
}

/**
 * Split `Sheet1!A1:B2` into its sheet name and the rest.
 *
 * Quoted names (`'Q1 Data'!A1`) are unquoted here, `''` inside them collapsing to one
 * apostrophe — that is Excel's own escaping, and a sheet called `Bob's` is not unusual.
 * A reference with no `!` returns a null sheet, meaning "whichever sheet the caller
 * defaults to".
 */
export function splitSheetRef(text: string): { sheet: string | null; rest: string } {
  const raw = text.trim();

  if (raw.startsWith("'")) {
    // Scan for the closing quote, treating `''` as an escaped apostrophe.
    for (let i = 1; i < raw.length; i++) {
      if (raw[i] !== "'") continue;
      if (raw[i + 1] === "'") {
        i++;
        continue;
      }
      const name = raw.slice(1, i).replace(/''/g, "'");
      const after = raw.slice(i + 1);
      if (!after.startsWith('!')) {
        throw new DocumentError(
          `"${text}" is missing the "!" after the sheet name. Write it like 'My Sheet'!A1.`,
        );
      }
      return { sheet: name, rest: after.slice(1).trim() };
    }
    throw new DocumentError(`"${text}" has an unclosed quote around the sheet name.`);
  }

  // Last `!` rather than first: a name cannot contain `!`, but being permissive here costs
  // nothing and an external-workbook reference like `[1]Sheet1!A1` still resolves sensibly.
  const bang = raw.lastIndexOf('!');
  if (bang === -1) return { sheet: null, rest: raw };
  return { sheet: raw.slice(0, bang).trim(), rest: raw.slice(bang + 1).trim() };
}

/** Quote a sheet name for a reference, only when it needs it. */
export function quoteSheetName(name: string): string {
  return /^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_.\u4e00-\u9fff]*$/.test(name)
    ? name
    : `'${name.replace(/'/g, "''")}'`;
}

/** `Sheet1!B7` from its two halves. */
export function qualify(sheetName: string, ref: string): string {
  return `${quoteSheetName(sheetName)}!${ref}`;
}

/**
 * Parse the part of a range after the sheet name.
 *
 * Four forms, all of which a model writes without being asked to:
 *
 * | written | means |
 * | --- | --- |
 * | `B7` | one cell |
 * | `A1:F200` | a rectangle |
 * | `A:C` | whole columns, bounded by `bounds` |
 * | `2:40` | whole rows, bounded by `bounds` |
 *
 * ⚠️ The two open forms need `bounds` (the sheet's used range) to become finite. Without
 * it, `A:C` would mean a million rows, and a reader that honestly tried to return them
 * would blow the round budget by two orders of magnitude before truncating.
 */
export function parseRangeRef(text: string, bounds: GridRange | null): GridRange {
  const raw = text.trim();
  if (raw === '') {
    if (!bounds) throw new DocumentError('This sheet is empty, so there is no range to read.');
    return { ...bounds };
  }

  const colon = raw.indexOf(':');
  if (colon === -1) {
    const cell = parseRef(raw);
    return { top: cell.row, left: cell.column, bottom: cell.row, right: cell.column };
  }

  const from = raw.slice(0, colon).trim();
  const to = raw.slice(colon + 1).trim();

  // Whole columns: `A:C`.
  if (/^\$?[A-Za-z]{1,3}$/.test(from) && /^\$?[A-Za-z]{1,3}$/.test(to)) {
    const left = columnNumber(from.replace(/\$/g, ''));
    const right = columnNumber(to.replace(/\$/g, ''));
    if (!bounds) {
      throw new DocumentError(`"${raw}" names whole columns, but this sheet has no data.`);
    }
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      left: Math.min(left, right),
      right: Math.max(left, right),
    };
  }

  // Whole rows: `2:40`.
  if (/^\$?\d{1,7}$/.test(from) && /^\$?\d{1,7}$/.test(to)) {
    const first = Number(from.replace(/\$/g, ''));
    const second = Number(to.replace(/\$/g, ''));
    if (!bounds) {
      throw new DocumentError(`"${raw}" names whole rows, but this sheet has no data.`);
    }
    return {
      top: Math.min(first, second),
      bottom: Math.max(first, second),
      left: bounds.left,
      right: bounds.right,
    };
  }

  const a = parseRef(from);
  const b = parseRef(to);
  // Normalised rather than refused: `F200:A1` is the same rectangle, and it is what you get
  // when a selection was dragged upwards.
  return {
    top: Math.min(a.row, b.row),
    bottom: Math.max(a.row, b.row),
    left: Math.min(a.column, b.column),
    right: Math.max(a.column, b.column),
  };
}

/** The overlap of two rectangles, or null when they do not touch. */
export function intersect(a: GridRange, b: GridRange): GridRange | null {
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  if (top > bottom || left > right) return null;
  return { top, left, bottom, right };
}

/** Grow a rectangle to include a cell. `null` starts one. */
export function extend(
  range: GridRange | null,
  row: number,
  column: number,
): GridRange {
  if (!range) return { top: row, left: column, bottom: row, right: column };
  return {
    top: Math.min(range.top, row),
    left: Math.min(range.left, column),
    bottom: Math.max(range.bottom, row),
    right: Math.max(range.right, column),
  };
}
