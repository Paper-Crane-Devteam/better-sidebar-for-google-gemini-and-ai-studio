/**
 * Writing cells by splicing the sheet XML.
 *
 * ## Why not rebuild the sheet
 *
 * A worksheet part carries far more than values: column widths, conditional formatting
 * ranges, data validations, merged regions, autofilters, the cached results every chart reads
 * from, hyperlinks, comments' anchors, and a `<sheetPr>` nobody has ever looked at. None of
 * that is modelled here and none of it needs to be, because an edit replaces exactly one `<c>`
 * element and leaves the rest of the file byte-identical. This is the same argument as
 * `.kiro/docs/document-formats.md` §5.3, and it is the reason exceljs loses charts and this
 * does not.
 *
 * ## The three cases, in increasing order of care
 *
 * 1. **The cell exists.** Replace its element. Its `s` attribute comes along, so the user's
 *    formatting survives — which is what "write a value without breaking the sheet" means.
 * 2. **The row exists, the cell does not.** Insert a `<c>` in column order.
 *    ⚠️ Cells must be in ascending column order inside a `<row>`; Excel reads an out-of-order
 *    row as corrupt and offers to repair the file.
 * 3. **The row does not exist.** Insert a whole `<row>` in row order inside `<sheetData>`.
 *    Same ordering rule, one level up.
 *
 * ⚠️ Self-closing elements are a trap at both levels, and the same one the docx side hit with
 * `<w:p/>`: for `<row r="7"/>` the "content start" offset sits *after* the `/>`, so inserting
 * a cell there puts it between two rows. The tag has to be expanded instead, which is why a
 * row that needs a cell is rewritten whole rather than appended to.
 */

import { DocumentError } from '../types';
import { type Edit, escapeXml } from '../ooxml/xml-cursor';
import { columnName, formatRef, type GridRange } from './refs';
import type { ParsedSheet, SheetRow } from './sheet';

/** What to put in one cell. */
export interface CellWrite {
  row: number;
  column: number;
  /**
   * `text` and `number` are literals, `formula` is written without its `=`, and `blank`
   * clears the value while keeping the cell's formatting.
   */
  kind: 'text' | 'number' | 'formula' | 'blank';
  value: string;
  /** Which op asked for this, so an overlap can name it. */
  label: string;
}

export interface WriteResult {
  edits: Edit[];
  /** The area actually written, for updating `<dimension>`. */
  touched: GridRange | null;
}

/**
 * Build the edits for every cell write going into one sheet.
 *
 * ⚠️ **One call per sheet per `doc_edit`, not one per op.** The unit of a splice is the *row*,
 * not the cell, and two ops that each add a cell to row 1 both need the same two row-level
 * edits: the insertion point at the row's end, and the removal of the row's now-wrong `spans`
 * attribute. Called per op, the second `spans` edit replaces the same byte range as the first,
 * `applyEdits` correctly refuses the whole call as overlapping, and a perfectly sensible
 * request — "add a note column and also fill in this header" — fails for reasons that have
 * nothing to do with what was asked. Batching across ops is what makes the row-level
 * bookkeeping happen once.
 *
 * It also fixes the quieter half of the same problem: new cells must end up in ascending column
 * order inside a row, and only a caller that sees all of them at once can guarantee that.
 */
export function writeCells(sheet: ParsedSheet, writes: CellWrite[]): WriteResult {
  if (!sheet.sheetData) {
    throw new DocumentError(
      'This sheet has no <sheetData> element, so there is nowhere to put a value. The file ' +
        'may have been produced by a tool that writes only formatting.',
    );
  }

  const edits: Edit[] = [];
  let touched: GridRange | null = null;

  // Grouped by row and sorted, because both insertion points depend on order.
  const byRow = new Map<number, CellWrite[]>();
  for (const write of writes) {
    const list = byRow.get(write.row) ?? [];
    list.push(write);
    byRow.set(write.row, list);
  }

  for (const [row, cells] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    // ⚠️ Last write wins per cell, resolved here rather than emitted twice. Two edits replacing
    // the same `<c>` element would be an exact overlap and would fail the whole call — and the
    // op layer has already refused the case where two *different* ops want one cell, so
    // anything reaching here is one op writing a cell twice, where the later value is meant.
    const unique = new Map<number, CellWrite>();
    for (const cell of cells) unique.set(cell.column, cell);
    const ordered = [...unique.values()].sort((a, b) => a.column - b.column);

    const existing = sheet.rows.get(row);
    edits.push(
      ...(existing ? updateRow(sheet, existing, ordered) : [insertRow(sheet, row, ordered)]),
    );

    for (const cell of ordered) {
      touched = touched
        ? {
            top: Math.min(touched.top, row),
            bottom: Math.max(touched.bottom, row),
            left: Math.min(touched.left, cell.column),
            right: Math.max(touched.right, cell.column),
          }
        : { top: row, bottom: row, left: cell.column, right: cell.column };
    }
  }

  return { edits, touched };
}

// ─── Existing rows ───────────────────────────────────────────────────────────

/**
 * Replace and insert cells inside a row that is already there.
 *
 * A row whose `<row>` tag is self-closing is rewritten whole; otherwise each cell is its own
 * splice, which keeps the untouched cells of the row literally untouched.
 */
function updateRow(sheet: ParsedSheet, row: SheetRow, writes: CellWrite[]): Edit[] {
  const edits: Edit[] = [];
  const label = writes[0]?.label ?? 'edit';

  if (row.el.selfClosing) {
    // `<row r="7" ht="15"/>` — no content position exists, so the element is reopened with its
    // own attributes carried over. Row height and custom formatting live there, and dropping
    // them would visibly change a row the user only asked to put a value in.
    const attrs = sheet.xml.source.slice(
      row.el.outerStart + 1 + row.el.name.length,
      row.el.outerEnd - 2,
    );
    const body = writes.map((write) => cellXml(write, null)).join('');
    edits.push({
      start: row.el.outerStart,
      end: row.el.outerEnd,
      text: `<row${withoutSpans(attrs)}>${body}</row>`,
      label,
    });
    return edits;
  }

  let spansStale = false;

  for (const write of writes) {
    const existing = row.cells.get(write.column);

    if (existing) {
      edits.push({
        start: existing.el.outerStart,
        end: existing.el.outerEnd,
        text: cellXml(write, existing.styleIndex),
        label: write.label,
      });
      continue;
    }

    // A new cell goes before the first existing cell to its right, so the row stays ordered.
    // ⚠️ Several new cells with nothing to their right all land on the same offset, and
    // `applyEdits` keeps insertions at one offset in the order given — which is why the caller
    // sorts by column before getting here. Out of order, Excel reads the row as corrupt.
    const after = [...row.cells.values()]
      .filter((cell) => cell.column > write.column)
      .sort((a, b) => a.column - b.column)[0];
    const at = after ? after.el.outerStart : row.el.innerEnd;

    edits.push({
      start: at,
      end: at,
      text: cellXml(write, inheritedStyle(row, write.column)),
      label: write.label,
    });
    spansStale = true;
  }

  // ⚠️ `spans` is an optimisation hint ("this row's cells run from 1 to 6"). Leaving a stale
  // one after adding a seventh column is the sort of inconsistency Excel tolerates and other
  // readers do not, so the attribute is dropped from any row that grew. Dropping it is always
  // safe: it is optional.
  if (spansStale && row.spans !== null) {
    const tagEnd = row.el.innerStart;
    const tag = sheet.xml.source.slice(row.el.outerStart, tagEnd);
    edits.push({
      start: row.el.outerStart,
      end: tagEnd,
      text: withoutSpans(tag),
      label,
    });
  }

  return edits;
}

/**
 * The style a brand-new cell should carry.
 *
 * The left-hand neighbour first, then the cell above. Both are guesses, and they are the same
 * guesses Excel makes when a user types into a blank cell — which is the point: a value filled
 * into a new column of a formatted table should look like the table, not like the default.
 * A cell with no neighbours gets no style, which is correct rather than merely safe.
 */
function inheritedStyle(row: SheetRow, column: number): number | null {
  const left = [...row.cells.values()]
    .filter((cell) => cell.column < column)
    .sort((a, b) => b.column - a.column)[0];
  return left?.styleIndex ?? null;
}

// ─── New rows ────────────────────────────────────────────────────────────────

/** Insert a whole row, in row order inside `<sheetData>`. */
function insertRow(sheet: ParsedSheet, row: number, writes: CellWrite[]): Edit {
  const label = writes[0]?.label ?? 'edit';
  const body = writes.map((write) => cellXml(write, null)).join('');
  const xml = `<row r="${row}">${body}</row>`;

  const sheetData = sheet.sheetData!;

  if (sheetData.selfClosing) {
    return {
      start: sheetData.outerStart,
      end: sheetData.outerEnd,
      text: `<sheetData>${xml}</sheetData>`,
      label,
    };
  }

  const after = sheet.rowNumbers.find((n) => n > row);
  const at = after ? sheet.rows.get(after)!.el.outerStart : sheetData.innerEnd;

  // A pure insertion, so two new rows landing at the same offset (both past the last existing
  // row) are applied in the order given — which is why `writeCells` walks rows ascending.
  return { start: at, end: at, text: xml, label };
}

// ─── One cell ────────────────────────────────────────────────────────────────

/**
 * A `<c>` element.
 *
 * Three decisions worth stating:
 *
 * - **Text is written as `t="inlineStr"`, never into the shared string table.** Adding to
 *   `sharedStrings.xml` means maintaining `count`, `uniqueCount` and every index that follows
 *   it; `inlineStr` is standard, self-contained, and understood by Excel, WPS, Numbers and
 *   LibreOffice. It costs a few bytes per cell and removes a whole class of index bug.
 * - **A formula cell is written with no cached value.** `<f>` alone means "not calculated
 *   yet", and combined with `fullCalcOnLoad` (see `package.ts`) Excel computes it on open. The
 *   alternative — inventing a `<v>` — would be a number we made up sitting in the user's data.
 * - **`xml:space="preserve"` always.** A value of `" 12"` or `"a "` loses its space otherwise,
 *   and a trailing space is exactly the sort of thing a user has in a sheet on purpose.
 */
function cellXml(write: CellWrite, styleIndex: number | null): string {
  const ref = formatRef(write.row, write.column);
  const style = styleIndex !== null ? ` s="${styleIndex}"` : '';

  switch (write.kind) {
    case 'blank':
      return `<c r="${ref}"${style}/>`;

    case 'number':
      return `<c r="${ref}"${style}><v>${write.value}</v></c>`;

    case 'formula':
      return `<c r="${ref}"${style}><f>${escapeXml(write.value)}</f></c>`;

    default:
      return (
        `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">` +
        `${escapeXml(write.value)}</t></is></c>`
      );
  }
}

/** Drop the `spans` attribute, leaving every other character of the text alone. */
function withoutSpans(text: string): string {
  return text.replace(/\s+spans\s*=\s*("[^"]*"|'[^']*')/g, '');
}

/** How a write reads in the summary the user sees. */
export function describeWrite(write: CellWrite, sheetName: string): string {
  const ref = `${sheetName}!${formatRef(write.row, write.column)}`;
  switch (write.kind) {
    case 'blank':
      return `${ref}: cleared`;
    case 'formula':
      return `${ref}: =${write.value}`;
    default:
      return `${ref}: ${write.value.length > 40 ? `${write.value.slice(0, 40)}…` : write.value}`;
  }
}

/** `A`–`F` for a message about a range of columns. */
export function columnSpanLabel(left: number, right: number): string {
  return left === right ? columnName(left) : `${columnName(left)}–${columnName(right)}`;
}
