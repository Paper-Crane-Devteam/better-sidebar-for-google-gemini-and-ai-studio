/**
 * What is in this workbook — and, uniquely for spreadsheets, what each column holds.
 *
 * ## Why the column types are the point of this file
 *
 * For a document, the outline is a table of contents: it tells the agent where to read next.
 * For a workbook that would be nearly useless — "there are three sheets" does not help anyone
 * compute anything. What an agent needs before it can plan a statistic is the *schema*: which
 * column is the date, which is the measurement, which is already a formula.
 *
 * That costs a sample of the first few dozen rows and about a hundred characters per sheet,
 * and it replaces the alternative, which is reading a thousand rows to find out. On a
 * 5000×20 sheet the difference is a hundredfold — and reading that sheet whole would exceed
 * the entire round budget by a factor of thirty (see `.kiro/docs/document-formats.md` §7.2).
 *
 * ## The warnings are about damage, not tidiness
 *
 * Charts, pivot tables, defined names and merged cells all carry references to *cell
 * addresses*. Nothing here breaks them, because nothing here inserts or deletes rows — but
 * the agent has to know they exist before it proposes to, and before it reports a sorted copy
 * as if the chart above it had followed along.
 */

import type { DocOutlineResult, OutlineNode } from '../types';
import type { LoadedDocument } from '../storage';
import { openWorkbook, type SheetInfo, type Workbook } from './model';
import {
  columnName,
  describeRange,
  quoteSheetName,
  rangeColumns,
  rangeRows,
  type GridRange,
} from './refs';
import type { SheetRow } from './sheet';
import { cellValue, inferColumnType, type CellValue, type ColumnType } from './values';

/** Rows sampled per sheet to infer column types. Enough to see past a stray header. */
const SAMPLE_ROWS = 30;

/** Columns described per sheet. A 60-column sheet gets the first dozen and a count. */
const MAX_COLUMNS_DESCRIBED = 12;

/** Sheets given a column breakdown. Beyond this only the size line, to hold the budget. */
const MAX_SHEETS_PROFILED = 6;

/** Characters of a header label kept. */
const LABEL_CHARS = 24;

export function xlsxOutline(loaded: LoadedDocument): DocOutlineResult {
  const workbook = openWorkbook(loaded.bytes);
  const sections: OutlineNode[] = [];
  let totalCells = 0;

  workbook.sheets.forEach((info, position) => {
    const profile = profileSheet(workbook, info, position < MAX_SHEETS_PROFILED);
    totalCells += profile.cells;
    sections.push({
      id: info.name,
      label: profile.label,
      level: 1,
      size: profile.rows,
      unit: 'rows',
    });
  });

  return {
    kind: 'outline',
    path: loaded.path,
    format: 'xlsx',
    summary: summarise(loaded.path, workbook, totalCells),
    facts: collectFacts(workbook),
    sections,
    warnings: collectWarnings(workbook),
  };
}

function summarise(path: string, workbook: Workbook, cells: number): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const count = workbook.sheets.length;
  return (
    `${name} is an Excel workbook with ${count} sheet${count === 1 ? '' : 's'}` +
    (cells > 0 ? `, roughly ${cells} cells of data` : '') +
    '. Each sheet is listed below with its used range and what its columns hold.'
  );
}

// ─── Per-sheet profile ───────────────────────────────────────────────────────

interface SheetProfile {
  label: string;
  rows: number;
  cells: number;
}

/**
 * One line describing a sheet: its used range, its shape, and its columns.
 *
 * The sample is a *window* read, so a 200k-row sheet costs the same as a 30-row one. That is
 * the whole reason `parseSheet` takes a window.
 */
function profileSheet(
  workbook: Workbook,
  info: SheetInfo,
  withColumns: boolean,
): SheetProfile {
  const sheet = workbook.sheet(info, { fromRow: 1, toRow: SAMPLE_ROWS });
  const used = sheet.used;

  if (!used) {
    return { label: 'empty', rows: 0, cells: 0 };
  }

  const rows = rangeRows(used);
  const columns = rangeColumns(used);
  const parts = [`${describeRange(used)} · ${rows}×${columns}`];

  if (info.hidden) parts.push('hidden tab');

  if (withColumns) {
    const described = describeColumns(workbook, sheet.parsed.rows, used);
    if (described) parts.push(described);
  }

  return { label: parts.join(' · '), rows, cells: rows * columns };
}

/**
 * `A 序号(number) B 姓名(text) C 日期(date) D 分数(formula)`.
 *
 * The header text comes from the first row of the used range and the type from the rows under
 * it — deliberately not from the header row itself, which is text in every sheet and would
 * make every column look like text.
 */
function describeColumns(
  workbook: Workbook,
  rows: Map<number, SheetRow>,
  used: GridRange,
): string | null {
  const headerRow = rows.get(used.top);
  const limit = Math.min(used.right, used.left + MAX_COLUMNS_DESCRIBED - 1);
  const described: string[] = [];

  for (let column = used.left; column <= limit; column++) {
    const header = headerRow?.cells.get(column);
    const label = header ? clip(cellValue(workbook, header).text) : '';

    const sample: CellValue[] = [];
    for (const [row, entry] of rows) {
      if (row === used.top) continue;
      const cell = entry.cells.get(column);
      if (cell) sample.push(cellValue(workbook, cell));
    }

    const type = inferColumnType(sample);
    described.push(`${columnName(column)} ${label || '—'}(${abbreviate(type)})`);
  }

  if (described.length === 0) return null;

  const hidden = used.right - limit;
  return described.join(' ') + (hidden > 0 ? ` …+${hidden} more columns` : '');
}

/** Short type names, because this line is repeated per sheet. */
function abbreviate(type: ColumnType): string {
  return type === 'number' ? 'num' : type === 'formula' ? 'fx' : type;
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > LABEL_CHARS ? `${flat.slice(0, LABEL_CHARS)}…` : flat;
}

// ─── Facts and warnings ──────────────────────────────────────────────────────

/**
 * Package-level facts, each one something that changes what to do next.
 *
 * Checked against the archive's entry list rather than by parsing, because "is there a chart"
 * is answered by the presence of `xl/charts/chart1.xml` and inflating the part to confirm it
 * would cost more than the answer is worth.
 */
function collectFacts(workbook: Workbook): string[] {
  const facts: string[] = [];
  const names = workbook.archive.names;

  const count = (prefix: string) => names.filter((n) => n.startsWith(prefix)).length;

  const charts = count('xl/charts/chart');
  if (charts > 0) facts.push(`${charts} chart${charts === 1 ? '' : 's'}`);

  const pivots = count('xl/pivotTables/');
  if (pivots > 0) facts.push(`${pivots} pivot table${pivots === 1 ? '' : 's'}`);

  const tables = count('xl/tables/');
  if (tables > 0) facts.push(`${tables} formatted table${tables === 1 ? '' : 's'} (ListObjects)`);

  const definedNames = countDefinedNames(workbook);
  if (definedNames > 0) facts.push(`${definedNames} defined names`);

  if (workbook.date1904) facts.push('1904 date system (an old Mac file)');

  const hidden = workbook.sheets.filter((s) => s.hidden).map((s) => s.name);
  if (hidden.length > 0) facts.push(`hidden sheets: ${hidden.join(', ')}`);

  // Worded with a name from this workbook, not a placeholder: a hint that says `Sheet1` in a
  // file whose tabs are called 数据 and 汇总 is a hint the agent will copy verbatim and get an
  // error from.
  const example = quoteSheetName(workbook.sheets[0].name);
  facts.push(`read a region with range="${example}!A1:F50", or a whole sheet with range="${example}"`);
  return facts;
}

function countDefinedNames(workbook: Workbook): number {
  const source = workbook.book.source;
  // Counted on the raw string: the alternative is tokenising `definedNames` for a number that
  // only ever appears in one fact line.
  return (source.match(/<definedName\b/g) ?? []).length;
}

/**
 * Everything that should change the plan before a cell is written.
 *
 * Phrased as consequences rather than observations, same as the docx outline: "12 charts" is
 * a fact the model skims past, "changing the values a chart reads from will change the chart"
 * is one it acts on.
 */
function collectWarnings(workbook: Workbook): string[] {
  const warnings: string[] = [];
  const names = workbook.archive.names;

  if (names.some((n) => n.startsWith('xl/charts/chart'))) {
    warnings.push(
      'This workbook has charts, which read from cell ranges. Writing into those ranges ' +
        'changes the chart too — usually what the user wants, but say so. Never propose ' +
        'inserting or deleting rows in a charted range.',
    );
  }

  if (names.some((n) => n.startsWith('xl/pivotTables/'))) {
    warnings.push(
      'There are pivot tables. Their cached data does not update until the user refreshes ' +
        'them in Excel, so a pivot will disagree with the source sheet after your edit until ' +
        'they do. Mention that.',
    );
  }

  // ⚠️ Decoded once per sheet, not once per question. `textOrNull` re-runs `strFromU8` over the
  // whole part every call, so asking three separate questions of a 20 MB sheet decoded 60 MB for
  // three substring searches.
  const sources = workbook.sheets.map((info) => ({
    info,
    source: workbook.archive.textOrNull(info.partName) ?? '',
  }));

  if (sources.some((s) => s.source.includes('t="shared"'))) {
    warnings.push(
      'Some formulas are shared: one cell holds the formula and the rest of its column only ' +
        'references it. Overwriting the holder would wipe the whole column, so that is ' +
        'refused — write to a new column instead.',
    );
  }

  const merged = sources.filter((s) => s.source.includes('<mergeCell '));
  if (merged.length > 0) {
    warnings.push(
      `Merged cells in ${merged.map((s) => s.info.name).join(', ')}. Only the top-left cell of ` +
        'a merge holds a value; the others read as empty and writing to one has no visible ' +
        'effect.',
    );
  }

  const locked = sources.filter((s) => s.source.includes('<sheetProtection '));
  if (locked.length > 0) {
    warnings.push(
      `${locked.map((s) => s.info.name).join(', ')} ${locked.length === 1 ? 'is' : 'are'} ` +
        'protected in Excel. Edits written here still land, but the user may have to unprotect ' +
        'the sheet before Excel lets them change anything themselves.',
    );
  }

  if (workbook.archive.names.some((n) => n.startsWith('xl/externalLinks/'))) {
    warnings.push(
      'Some formulas point at other workbooks that are not here. Their cached values are all ' +
        'we can see, and they will not recalculate.',
    );
  }

  return warnings;
}
