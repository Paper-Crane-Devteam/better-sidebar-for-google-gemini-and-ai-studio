/**
 * Projecting a region of a workbook into text the agent can read and quote back.
 *
 * ## The format
 *
 *     Sheet1!A1:D6 of used A1:F2000
 *     	A	B	C	D
 *     1	序号	姓名	日期	分数
 *     2	1	张三	2026-01-05	90
 *     3	2	李四	2026-01-06	88
 *     Formulas: D2 =B2*C2 · D3 =B3*C3
 *
 * Tab-separated, with the column letters as a head row and the row numbers as a first
 * column. Two things follow from that and both are deliberate:
 *
 * - **Every cell's address is derivable without counting.** The same reasoning as the docx
 *   table projection: a grid whose cells cannot be named is a grid the agent can read and
 *   cannot edit, and the failure mode is writing the answer into the neighbouring column.
 *   Here the axes are free, because Excel's addresses are already what the user sees.
 * - **Tabs, not pipes.** A Markdown table costs `| ` and ` |` per cell — around 40% overhead
 *   on numeric data, taken straight out of the round budget. TSV is what a spreadsheet is.
 *
 * ⚠️ **Formulas are listed separately, not shown in the grid.** A formula cell has both a
 * formula and a cached value, and inlining both doubles the width of a computed column while
 * inlining one hides half the truth. The grid shows what the user sees; the list below it
 * shows what the sheet computes, which is what stops an agent overwriting a calculated column
 * with literals.
 */

import type { DocProjectionResult, DocReadRequest } from '../types';
import { DocumentError } from '../types';
import type { LoadedDocument } from '../storage';
import { openWorkbook, type SheetInfo, type Workbook } from './model';
import {
  columnName,
  describeRange,
  formatRef,
  intersect,
  parseRangeRef,
  qualify,
  quoteSheetName,
  rangeColumns,
  splitSheetRef,
  type GridRange,
} from './refs';
import { cellValue, flatText, type CellValue } from './values';

/** Default ceiling on returned characters. Shares the round with every other tool call. */
const DEFAULT_MAX_CHARS = 12000;

/** Hard ceiling, whatever was asked for. */
const ABSOLUTE_MAX_CHARS = 24000;

/** Columns returned at most. A 200-column sheet makes one row bigger than the budget. */
const MAX_COLUMNS = 40;

/** Formula entries listed under the grid. */
const MAX_FORMULAS = 30;

/** Search hits returned at most. */
const MAX_HITS = 40;

export function xlsxRead(
  loaded: LoadedDocument,
  request: DocReadRequest,
): DocProjectionResult {
  const workbook = openWorkbook(loaded.bytes);

  return request.mode === 'search'
    ? search(workbook, loaded.path, request)
    : project(workbook, loaded.path, request);
}

// ─── Range projection ────────────────────────────────────────────────────────

/**
 * Split a `range` into the sheet it names and the rectangle within it.
 *
 * ⚠️ A bare sheet name has to work, and getting this wrong was not a small failure. The outline
 * lists sheets by name and tells the agent to use the id as a range — so `range="数据"` is the
 * *documented* next call, and reading it as a cell reference answered it with `"数据" is not a
 * cell reference`. The tool contradicted its own outline.
 *
 * Order matters here: `!` wins, then a name that matches a sheet, then a rectangle on the
 * default sheet. That way a sheet called `A1` (which people do create) is still reachable, and
 * an actual `A1` still means the cell.
 */
function resolveScope(
  workbook: Workbook,
  range: string | undefined,
): { info: SheetInfo; rest: string } {
  const raw = (range ?? '').trim();
  const { sheet, rest } = splitSheetRef(raw);

  if (sheet !== null) return { info: workbook.find(sheet), rest };

  const named = workbook.sheets.find((s) => s.name.toLowerCase() === raw.toLowerCase());
  if (named) return { info: named, rest: '' };

  return { info: workbook.find(null), rest };
}

function project(
  workbook: Workbook,
  path: string,
  request: DocReadRequest,
): DocProjectionResult {
  const { info, rest } = resolveScope(workbook, request.range);

  // Two-step read: the used range comes from a cheap window parse, then the requested
  // rectangle is clipped against it and only those rows are materialised. Parsing the whole
  // sheet to read fifty rows of it is the thing this avoids.
  const probe = workbook.sheet(info, { fromRow: 1, toRow: 1 });
  const used = probe.used;
  if (!used) {
    return {
      kind: 'projection',
      path,
      format: 'xlsx',
      text: `${quoteSheetName(info.name)} is empty.`,
      covered: `${info.name} (empty)`,
      truncated: false,
    };
  }

  const asked = parseRangeRef(rest, used);
  const clipped = intersect(asked, used);
  if (!clipped) {
    throw new DocumentError(
      `${qualify(info.name, describeRange(asked))} has no data in it. This sheet's used ` +
        `range is ${describeRange(used)}.`,
    );
  }

  // Columns are capped before rows, because a too-wide read cannot be continued by paging —
  // there is no "next columns" to offer, so it has to be narrowed by the caller instead.
  const wideBy = rangeColumns(clipped) - MAX_COLUMNS;
  const window: GridRange =
    wideBy > 0 ? { ...clipped, right: clipped.left + MAX_COLUMNS - 1 } : clipped;

  const sheet = workbook.sheet(info, { fromRow: window.top, toRow: window.bottom });
  const limit = Math.min(
    request.maxChars && request.maxChars > 0 ? request.maxChars : DEFAULT_MAX_CHARS,
    ABSOLUTE_MAX_CHARS,
  );

  const head = ['', ...columnsOf(window).map(columnName)].join('\t');
  const lines: string[] = [head];
  let used_chars = head.length;
  let lastRow = window.top - 1;
  let truncated = false;

  const formulas: string[] = [];
  let formulaCount = 0;

  for (let row = window.top; row <= window.bottom; row++) {
    const entry = sheet.parsed.rows.get(row);

    // ⚠️ A row that does not exist is skipped rather than printed as tabs. A gap between data
    // blocks is common in a real sheet, and emitting the empty rows costs one line of pure
    // separators each out of a budget that is already the binding constraint here. The row
    // numbers are in the output, so a gap is unambiguous without being spelled out.
    if (!entry || entry.cells.size === 0) continue;

    const cells: string[] = [String(row)];

    for (const column of columnsOf(window)) {
      const cell = entry?.cells.get(column);
      if (!cell) {
        cells.push('');
        continue;
      }
      const value = cellValue(workbook, cell);
      cells.push(flatText(value));

      if (value.computed) {
        formulaCount++;
        if (formulas.length < MAX_FORMULAS) {
          formulas.push(describeFormula(formatRef(row, column), value));
        }
      }
    }

    const line = cells.join('\t');
    // `lastRow < window.top` guarantees at least one row comes back even when a single row is
    // wider than the budget. Returning only a header would read as "the range is empty".
    if (used_chars + line.length > limit && lastRow >= window.top) {
      truncated = true;
      break;
    }
    lines.push(line);
    used_chars += line.length + 1;
    lastRow = row;
  }

  if (formulas.length > 0) {
    lines.push(
      `Formulas (${formulaCount}${formulaCount > formulas.length ? `, first ${formulas.length}` : ''}): ` +
        formulas.join(' · '),
    );
  }

  if (wideBy > 0) {
    lines.push(
      `Columns ${columnName(window.right + 1)}–${columnName(clipped.right)} were not ` +
        `included (${wideBy} more). Ask for them as a separate range.`,
    );
  }

  if (sheet.parsed.windowed && lastRow >= window.bottom && window.bottom < used.bottom) {
    // Not a truncation of this read — the range simply did not reach the end of the data.
    lines.push(`This sheet has data down to row ${used.bottom}.`);
  }

  const covered =
    `${qualify(info.name, describeRange({ ...window, bottom: Math.max(lastRow, window.top) }))}` +
    ` of used ${describeRange(used)}`;

  const incomplete = truncated || lastRow < clipped.bottom;

  return {
    kind: 'projection',
    path,
    format: 'xlsx',
    text: lines.join('\n'),
    covered,
    truncated: incomplete,
    nextRange: incomplete
      ? qualify(
          info.name,
          `${formatRef(lastRow + 1, window.left)}:${formatRef(clipped.bottom, window.right)}`,
        )
      : undefined,
  };
}

/**
 * One entry in the formula list.
 *
 * ⚠️ A shared follower stores no formula text of its own, so printing `E3 =` was the honest
 * rendering of the data and a useless thing to read. Naming it as sharing the host's formula is
 * both true and actionable: it tells the agent the cell is calculated *and* that changing it is
 * not a local decision.
 */
function describeFormula(ref: string, value: CellValue): string {
  if (value.sharedHost) {
    return `${ref} =${value.formula ?? ''} (shared down its range — do not overwrite)`;
  }
  if (value.sharedFollower) {
    return `${ref} shares the formula above it`;
  }
  return `${ref} =${value.formula ?? '(not stored)'}`;
}

function columnsOf(range: GridRange): number[] {
  const columns: number[] = [];
  for (let column = range.left; column <= range.right; column++) columns.push(column);
  return columns;
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Find a value or a formula anywhere in the workbook.
 *
 * Covers every sheet, including hidden ones, and searches **formulas as well as values** —
 * "where is this rate used" is a question about formulas, and it is the one that cannot be
 * answered by looking at the grid at all.
 *
 * ⚠️ Parses each sheet in full, so this is the most expensive read here. It is still far
 * cheaper than the alternative it replaces (paging through the sheets looking), and the
 * result is a handful of addresses rather than a rectangle of data.
 */
function search(
  workbook: Workbook,
  path: string,
  request: DocReadRequest,
): DocProjectionResult {
  const query = (request.query ?? '').trim();
  if (query === '') {
    throw new DocumentError('doc_read with mode "search" needs a "query".');
  }

  // A range may scope the search to one sheet: `range="Sheet2"`. Cheap to support and it is
  // what "search the summary tab" means.
  const scope = (request.range ?? '').trim();
  const sheets: SheetInfo[] =
    scope === '' ? workbook.sheets : [resolveScope(workbook, scope).info];

  const needle = query.toLowerCase();
  const lines: string[] = [];
  let hits = 0;

  for (const info of sheets) {
    const sheet = workbook.sheet(info);

    for (const row of sheet.parsed.rowNumbers) {
      const entry = sheet.parsed.rows.get(row);
      if (!entry) continue;

      for (const cell of entry.cells.values()) {
        const value = cellValue(workbook, cell);
        const inValue = value.text.toLowerCase().includes(needle);
        const inFormula = value.formula?.toLowerCase().includes(needle) ?? false;
        if (!inValue && !inFormula) continue;

        hits++;
        if (hits > MAX_HITS) break;

        const where = qualify(info.name, formatRef(cell.row, cell.column));
        const what = inFormula
          ? `=${value.formula}${value.text ? ` → ${flatText(value)}` : ''}`
          : flatText(value);
        lines.push(`${where}\t${clip(what)}`);
      }
      if (hits > MAX_HITS) break;
    }
    if (hits > MAX_HITS) break;
  }

  const truncated = hits > MAX_HITS;
  const header =
    lines.length === 0
      ? `Nothing in this workbook contains "${query}".`
      : `${truncated ? `${MAX_HITS}+` : lines.length} cell(s) contain "${query}" ` +
        '(values and formulas):';

  return {
    kind: 'projection',
    path,
    format: 'xlsx',
    text: [header, ...lines].join('\n'),
    covered: `search for "${query}"`,
    truncated,
  };
}

function clip(text: string): string {
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
