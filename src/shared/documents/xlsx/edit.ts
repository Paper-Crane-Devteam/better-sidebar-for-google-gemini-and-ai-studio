/**
 * Applying edits to a workbook.
 *
 * ## Addressing is Excel's, and that removes a whole class of bug
 *
 * The docx side had to forbid editing by paragraph id, because inserting one paragraph shifts
 * every later number and a stale `p12` silently means a different paragraph. `C2` has no such
 * problem: it is a coordinate, the user can see it, and it means the same cell before and after
 * any edit this module performs. So writes here are addressed directly, and the safety work
 * moves elsewhere — to *what* may be overwritten rather than to *where*.
 *
 * ## What may not be overwritten
 *
 * | refused | why |
 * | --- | --- |
 * | the host cell of a shared formula | it holds the only copy for its whole column |
 * | inserting or deleting rows and columns | formulas, merged regions, table ranges, conditional formats, validations and chart references are all stored by address and would all have to move |
 * | sorting in place | same reason, plus the user cannot see what moved |
 *
 * Each refusal names the alternative, and for a research spreadsheet the alternative is almost
 * always better than what was asked for: add a column rather than change one, write a sorted
 * copy to a new sheet rather than sort the original.
 *
 * ## Every op resolves against the workbook as loaded
 *
 * Same contract as the docx editor: ops do not see each other's results, all edits are spliced
 * at the end, and two ops touching the same cell are refused rather than silently ordered. One
 * failed op does not fail the call.
 */

import { DocumentError, type DocEditRequest, type DocOp } from '../types';
import type { LoadedDocument } from '../storage';
import type { EditOutcome } from '../registry';
import { type Edit, XmlError, applyEdits } from '../ooxml/xml-cursor';
import { openWorkbook, type SheetInfo, type Workbook } from './model';
import {
  columnName,
  describeRange,
  formatRef,
  parseRangeRef,
  parseRef,
  quoteSheetName,
  rangeColumns,
  rangeRows,
  splitSheetRef,
  type GridRange,
} from './refs';
import { describeWrite, writeCells, type CellWrite } from './cells';
import { extendDimension, invalidateCalculation } from './recalc';
import { addSheet, isPlainNumber, renameSheet } from './sheets';

/** Cells one op may write. A larger batch is a script, not an edit, and blows the budget. */
const MAX_CELLS_PER_OP = 2000;

/** Rows `add_column` will fill. Past this the formula should go in as a shared one in Excel. */
const MAX_FILL_ROWS = 5000;

export function xlsxEdit(loaded: LoadedDocument, request: DocEditRequest): EditOutcome {
  const workbook = openWorkbook(loaded.bytes);

  /**
   * Cell writes collected across **all** ops, grouped by sheet.
   *
   * ⚠️ Collected rather than spliced per op, and the reason is in `cells.ts`: a row's `spans`
   * attribute and its insertion point are row-level bookkeeping, so two ops each adding a cell
   * to row 1 would emit the same row-level edit twice and `applyEdits` would refuse the call.
   * "Add a note column and fill in this header" is a perfectly ordinary request and it has to
   * work.
   */
  const bySheet = new Map<string, { info: SheetInfo; writes: CellWrite[] }>();
  const applied: string[] = [];
  const skipped: string[] = [];
  /** Cells already claimed in this call, so a second op cannot quietly contradict the first. */
  const claimed = new Map<string, string>();
  let needsRecalc = false;

  const context: OpContext = { workbook, label: '', claimed };

  request.ops.forEach((op, index) => {
    context.label = `op ${index + 1} (${String(op.op ?? '?')})`;
    try {
      const outcome = applyOp(op, context);

      if (outcome.writes && outcome.writes.cells.length > 0) {
        const key = outcome.writes.info.partName;
        const entry = bySheet.get(key) ?? { info: outcome.writes.info, writes: [] };
        entry.writes.push(...outcome.writes.cells);
        bySheet.set(key, entry);
      }

      applied.push(...outcome.summaries);
      skipped.push(...outcome.refused.map((reason) => `${context.label}: ${reason}`));
      if (outcome.recalc) needsRecalc = true;
    } catch (e) {
      skipped.push(`${context.label}: ${describe(e)}`);
    }
  });

  const written = new Map<string, GridRange>();
  const rewritten = new Map<string, string>();

  // ⚠️ Nothing is staged until every sheet's splices succeed. A call that half-applied would
  // leave a workbook whose input column was updated and whose result column was not, which is
  // the self-contradicting state this engine works hardest to avoid.
  for (const [partName, entry] of bySheet) {
    const sheet = workbook.sheet(entry.info);
    const result = writeCells(sheet.parsed, entry.writes);
    try {
      rewritten.set(partName, applyEdits(sheet.parsed.xml.source, result.edits));
    } catch (e) {
      throw new DocumentError(
        `${describe(e)} Nothing was written — the file is unchanged. Send the conflicting ` +
          'changes in separate doc_edit calls.',
      );
    }
    if (result.touched) written.set(partName, result.touched);
  }

  // Checked after the splices, because a call whose only ops were refused must leave the bytes
  // untouched — that is what lets the engine skip the write and keep the session's one backup
  // slot for a real previous version.
  if (rewritten.size === 0 && workbook.archive.changedNames().length === 0) {
    return { bytes: loaded.bytes, applied: [], skipped };
  }

  for (const [partName, source] of rewritten) {
    workbook.archive.setText(partName, source);
  }

  // After the sheet text is staged, so the dimension patch reads the rewritten part.
  for (const [partName, range] of written) {
    extendDimension(workbook.archive, partName, range);
  }

  if (needsRecalc) {
    invalidateCalculation(workbook);
    applied.push(
      'Excel will recalculate every formula the next time this file is opened, so cached ' +
        'totals cannot disagree with the new values.',
    );
  }

  return { bytes: workbook.archive.save(), applied, skipped };
}

function describe(e: unknown): string {
  if (e instanceof DocumentError || e instanceof XmlError) return e.message;
  return `unexpected failure — ${(e as Error)?.message ?? String(e)}`;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

interface OpContext {
  workbook: Workbook;
  label: string;
  /** `Sheet1!C2` → the op that claimed it. */
  claimed: Map<string, string>;
}

interface OpOutcome {
  /** Cells this op wants written. Spliced by the caller, once per sheet. */
  writes?: { info: SheetInfo; cells: CellWrite[] };
  summaries: string[];
  refused: string[];
  /** Whether this op invalidates cached formula results. */
  recalc?: boolean;
}

/** Every verb this handler understands, for the message when one is misspelled. */
const OPS = [
  'set_cell',
  'set_cells',
  'add_column',
  'clear_cells',
  'add_sheet',
  'rename_sheet',
] as const;

/**
 * Operations that are refused by name rather than by falling through to "unknown".
 *
 * ⚠️ Worth the extra code: an agent that asks for `insert_row` and hears "not a valid
 * operation" concludes the tool is limited and stops. One that hears "that would move every
 * address a formula, chart and merged region points at — add a column instead" does the right
 * thing on the next call. The refusal is the teaching moment, so it has to carry the reason.
 */
const REFUSED: Record<string, string> = {
  insert_row:
    'Inserting a row shifts every address below it, and formulas, merged regions, table ' +
    'ranges, conditional formats, data validations and chart references all store addresses. ' +
    'Append below the data with set_cells instead, or put the result on a new sheet with ' +
    'add_sheet.',
  delete_row:
    'Deleting a row breaks every formula and chart range that referenced the rows under it. ' +
    'If a row should be excluded, mark it in a new column with add_column and say which rows ' +
    'you would drop.',
  insert_column: 'Use add_column, which appends to the right of the data and shifts nothing.',
  delete_column:
    'Deleting a column breaks the formulas that read from it. Say which column should go and ' +
    'let the user delete it in Excel, or write the columns you want kept to a new sheet.',
  sort:
    'Sorting in place moves data that charts, formulas and pivot ranges point at by address, ' +
    'and the user cannot see what moved. Read the range, sort it in your answer, and write the ' +
    'result to a new sheet with add_sheet.',
  filter: 'Read the range and write the rows you kept to a new sheet with add_sheet.',
  merge_cells:
    'Merged cells hide values from every formula that reads them. If two columns belong ' +
    'together, write the combined text into one cell instead.',
  set_format:
    'Number formats and fonts are not editable here — writing one means renumbering every ' +
    'style index in the workbook. Values keep whatever format their cell already had, and a ' +
    'new cell inherits from its neighbour.',
  add_comment:
    'Cell comments are not supported yet. Put the note in a new column with add_column, ' +
    'which the user can see without hovering.',
};

function applyOp(op: DocOp, ctx: OpContext): OpOutcome {
  const verb = String(op.op ?? '').trim();

  const refusal = REFUSED[verb];
  if (refusal) throw new DocumentError(refusal);

  switch (verb) {
    case 'set_cell':
      return setCell(op, ctx);
    case 'set_cells':
      return setCells(op, ctx);
    case 'add_column':
      return addColumn(op, ctx);
    case 'clear_cells':
      return clearCells(op, ctx);
    case 'add_sheet':
      return newSheet(op, ctx);
    case 'rename_sheet':
      return retitleSheet(op, ctx);
    default:
      throw new DocumentError(
        `"${verb}" is not a workbook operation. Use one of: ${OPS.join(', ')}.`,
      );
  }
}

// ─── set_cell ────────────────────────────────────────────────────────────────

/**
 * Write one cell.
 *
 * `value` and `formula` are the same parameter in practice: a `value` starting with `=` is a
 * formula, because that is how it is typed into Excel and how a model will write it without
 * being told. `formula` stays available for the case where the text genuinely begins with an
 * equals sign and must not be evaluated.
 */
function setCell(op: DocOp, ctx: OpContext): OpOutcome {
  const { info, ref } = resolveCell(ctx, op, 'ref');
  return commit(ctx, info, [valueToWrite(op, ref, ctx.label)]);
}

/**
 * Write a rectangle of values.
 *
 * `range` names the target and `values` is a JSON array of arrays. A `values` grid smaller than
 * the range fills what it covers and leaves the rest alone — deliberately not padded with
 * blanks, because "write these three rows into C2:C50" is a normal thing to ask and clearing
 * the other 47 cells is not what it means.
 */
function setCells(op: DocOp, ctx: OpContext): OpOutcome {
  const { sheet, rest } = splitSheetRef(text(op, 'range') ?? text(op, 'start') ?? '');
  // ⚠️ `sheet ?? op.sheet`, not just `sheet`. The name may arrive either inside the range or as
  // its own parameter, and both are natural to write. Honouring only the range form meant
  // `sheet="汇总" range="A1:B2"` silently wrote to the first tab instead.
  const info = ctx.workbook.find(sheet ?? text(op, 'sheet') ?? null);
  const values = matrix(op, 'values');

  if (rest === '') {
    throw new DocumentError(
      'set_cells needs "range" naming where to write, e.g. range="Sheet1!C2:C20" or ' +
        'range="Sheet1!C2" for the top-left corner.',
    );
  }

  const anchor = parseRangeRef(rest, null);
  const height = Math.max(values.length, 1);
  const width = values.reduce((max, row) => Math.max(max, row.length), 0);

  // A single-cell "range" is read as the top-left corner and the grid decides the extent. That
  // is what `start="C2"` means, and accepting it under `range` too removes a distinction the
  // model has no way to guess.
  const target: GridRange =
    rangeRows(anchor) === 1 && rangeColumns(anchor) === 1
      ? {
          top: anchor.top,
          left: anchor.left,
          bottom: anchor.top + height - 1,
          right: anchor.left + Math.max(width, 1) - 1,
        }
      : anchor;

  const writes: CellWrite[] = [];
  for (let r = 0; r < values.length; r++) {
    const row = target.top + r;
    if (row > target.bottom) break;
    for (let c = 0; c < values[r].length; c++) {
      const column = target.left + c;
      if (column > target.right) break;
      writes.push(valueToWrite({ value: values[r][c] }, { row, column }, ctx.label));
    }
  }

  if (writes.length === 0) {
    throw new DocumentError('"values" is empty, so there is nothing to write.');
  }

  return commit(ctx, info, writes, `${describeRange(target)}: ${writes.length} cells written`);
}

/**
 * Blank a range, keeping its formatting.
 *
 * Separate from `set_cells` with empty strings, because an empty string is a *value* — a cell
 * holding `""` is not the same as an empty cell to `COUNTA`, `ISBLANK` or a chart, and
 * conflating them is how a "cleared" column still counts as full.
 */
function clearCells(op: DocOp, ctx: OpContext): OpOutcome {
  const { sheet, rest } = splitSheetRef(required(op, 'range'));
  const info = ctx.workbook.find(sheet ?? text(op, 'sheet') ?? null);
  const probe = ctx.workbook.sheet(info, { fromRow: 1, toRow: 1 });
  const target = parseRangeRef(rest, probe.used);

  const writes: CellWrite[] = [];
  for (let row = target.top; row <= target.bottom; row++) {
    for (let column = target.left; column <= target.right; column++) {
      writes.push({ row, column, kind: 'blank', value: '', label: ctx.label });
    }
  }

  return commit(
    ctx,
    info,
    writes,
    `${describeRange(target)}: ${writes.length} cells cleared (formatting kept)`,
  );
}

// ─── add_column ──────────────────────────────────────────────────────────────

/**
 * Append a column: a header, and a formula or value down every data row.
 *
 * ## This is the op the spreadsheet case is actually about
 *
 * A researcher asking the agent to "work out the growth rate" does not want the original
 * numbers touched. A new column is additive, reversible by deleting it, and leaves every
 * existing formula, chart and pivot range pointing exactly where it did. It is what "help me
 * with my statistics" should almost always compile down to, which is why the skill leads with
 * it and why the destructive alternatives are refused above.
 *
 * `formula` is a template: `{row}` is replaced with each row's number, so
 * `formula="=(C{row}-B{row})/B{row}"` fills the column correctly all the way down. That
 * placeholder exists because the obvious alternative — writing the same formula everywhere and
 * letting Excel adjust it — is not a thing a file format can do; relative references are
 * relative to the cell they are *in*, and every cell needs its own text.
 */
function addColumn(op: DocOp, ctx: OpContext): OpOutcome {
  const sheetName = text(op, 'sheet');
  const info = ctx.workbook.find(sheetName ?? null);
  const probe = ctx.workbook.sheet(info, { fromRow: 1, toRow: 1 });
  const used = probe.used;

  if (!used) {
    throw new DocumentError(
      `${quoteSheetName(info.name)} is empty, so there is no data to add a column beside. ` +
        'Use add_sheet or set_cells to put the table in first.',
    );
  }

  const header = text(op, 'header');
  const formula = text(op, 'formula');
  const values = op.values !== undefined ? matrix(op, 'values') : null;

  if (!formula && !values) {
    throw new DocumentError(
      'add_column needs "formula" (a template using {row}, e.g. "=(C{row}-B{row})/B{row}") ' +
        'or "values" (one entry per data row).',
    );
  }

  const column = used.right + 1;
  const headerRow = used.top;
  const firstData = number(op, 'from_row') ?? headerRow + 1;
  const lastData = Math.min(number(op, 'to_row') ?? used.bottom, used.bottom);

  if (lastData - firstData + 1 > MAX_FILL_ROWS) {
    throw new DocumentError(
      `That would fill ${lastData - firstData + 1} rows, over the ${MAX_FILL_ROWS} limit for ` +
        'one call. Give "to_row" to do it in batches.',
    );
  }

  const writes: CellWrite[] = [];

  if (header) {
    writes.push({ row: headerRow, column, kind: 'text', value: header, label: ctx.label });
  }

  for (let row = firstData; row <= lastData; row++) {
    if (values) {
      // A column of values arrives either as one flat list (`["a","b"]`, normalised to a single
      // row) or as one entry per row (`[["a"],["b"]]`). Both mean the same thing here, and
      // insisting on one of them would be a shape the model has to guess.
      const value = values[row - firstData]?.[0] ?? values[0]?.[row - firstData];
      if (value === undefined || value === '') continue;
      writes.push(valueToWrite({ value }, { row, column }, ctx.label));
      continue;
    }
    // `{row}` is the only substitution. `{r}` is accepted too because it is the shorter thing a
    // model reaches for, and a template that silently kept the literal braces would fill the
    // column with #NAME? errors.
    const filled = formula!.replace(/\{row\}|\{r\}/g, String(row));
    writes.push(valueToWrite({ value: filled }, { row, column }, ctx.label));
  }

  if (writes.length === 0) {
    throw new DocumentError('add_column produced nothing to write.');
  }

  return commit(
    ctx,
    info,
    writes,
    `${quoteSheetName(info.name)}: added column ${columnName(column)}` +
      (header ? ` “${header}”` : '') +
      ` over rows ${firstData}–${lastData}`,
  );
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

/**
 * Add a worksheet, optionally filled with a grid of values.
 *
 * The safe destination for anything derived: a sorted copy, a summary, a set of statistics. The
 * original sheet is not touched at all, which means the user can compare the two and the agent
 * cannot damage the data it was given.
 */
function newSheet(op: DocOp, ctx: OpContext): OpOutcome {
  const name = required(op, 'name');
  const rows = op.rows !== undefined ? matrix(op, 'rows') : [];

  addSheet(ctx.workbook, { name, rows });

  const shape =
    rows.length > 0
      ? ` with ${rows.length} rows × ${rows.reduce((m, r) => Math.max(m, r.length), 0)} columns`
      : ' (empty)';

  return {
    summaries: [`Added sheet “${name}”${shape}`],
    refused: [],
    // A new sheet may carry formulas, and even when it does not, a `=SUM` on it must be
    // computed before the user sees a number.
    recalc: rows.some((row) => row.some((value) => value.startsWith('='))),
  };
}

function retitleSheet(op: DocOp, ctx: OpContext): OpOutcome {
  const info = ctx.workbook.find(required(op, 'sheet'));
  const name = required(op, 'name');
  renameSheet(ctx.workbook, info, name);
  return {
    summaries: [`Renamed sheet “${info.name}” to “${name.trim()}”`],
    refused: [],
  };
}

// ─── Shared machinery ────────────────────────────────────────────────────────

/**
 * Vet a batch of writes and hand them on.
 *
 * All the policy lives here and all the XML mechanics live in `cells.ts`. That split is what
 * keeps the summaries honest: everything that can refuse a write has already refused it by the
 * time this returns, so a line in `applied` cannot describe a change that was later dropped.
 *
 * The sheet is parsed **without a window**, deliberately. A write has to see the cell it is
 * replacing — its `s` attribute carries the user's formatting, and its `<f t="shared">` marker
 * is what makes an overwrite unsafe. A windowed parse would report an existing cell as absent,
 * write a fresh one over the top of it, and lose both.
 */
function commit(
  ctx: OpContext,
  info: SheetInfo,
  writes: CellWrite[],
  summary?: string,
): OpOutcome {
  if (writes.length > MAX_CELLS_PER_OP) {
    throw new DocumentError(
      `That is ${writes.length} cells in one operation, over the ${MAX_CELLS_PER_OP} limit. ` +
        'Split it into several calls.',
    );
  }

  const sheet = ctx.workbook.sheet(info);
  const refused: string[] = [];
  const kept: CellWrite[] = [];

  for (const write of writes) {
    const ref = formatRef(write.row, write.column);
    const key = `${info.name}!${ref}`;

    const holder = ctx.claimed.get(key);
    // ⚠️ Two ops writing one cell is a contradiction, not a sequence — ops in a call do not see
    // each other, so neither value is "the later one". Refusing names both ops; letting them
    // through would write whichever `applyEdits` happened to order last.
    if (holder) {
      refused.push(`${key} is already being written by ${holder} in this call.`);
      continue;
    }

    const existing = sheet.parsed.rows.get(write.row)?.cells.get(write.column);
    // ⚠️ The one cell that may not be overwritten. It holds the only copy of a formula that the
    // rest of its range references by id, so replacing it leaves those cells pointing at an `si`
    // that no longer exists — and Excel renders the whole column blank.
    if (existing?.shared?.isHost) {
      refused.push(
        `${key} holds the shared formula for ${existing.shared.ref ?? 'its column'}, so ` +
          'overwriting it would blank every cell that shares it. Add a new column with ' +
          'add_column instead, or change the formula in Excel.',
      );
      continue;
    }

    ctx.claimed.set(key, ctx.label);
    kept.push(write);
  }

  if (kept.length === 0) {
    return { summaries: [], refused };
  }

  const summaries = summary
    ? [summary]
    : kept.slice(0, 6).map((write) => describeWrite(write, quoteSheetName(info.name)));

  if (!summary && kept.length > 6) {
    summaries.push(`…and ${kept.length - 6} more cells`);
  }

  // ⚠️ A one-line summary describes the whole batch, so it overstates when part of the batch was
  // refused — "added column F 含税" while the header cell was rejected reads as complete work.
  // Saying how many were dropped keeps the applied list honest without losing the summary.
  if (summary && refused.length > 0) {
    summaries.push(
      `…but ${refused.length} of those ${refused.length + kept.length} cells were not written ` +
        '(see below).',
    );
  }

  return {
    writes: { info, cells: kept },
    summaries,
    refused,
    // Any value change can feed a formula somewhere, so recalculation is requested for every
    // write rather than only for formula writes. The cost is one deleted part; the cost of
    // getting it wrong is a workbook that contradicts itself.
    recalc: true,
  };
}

/** Which sheet and cell an op names. */
function resolveCell(
  ctx: OpContext,
  op: DocOp,
  field: string,
): { info: SheetInfo; ref: { row: number; column: number } } {
  const raw = text(op, field) ?? text(op, 'cell') ?? text(op, 'range');
  if (!raw) {
    throw new DocumentError(
      `set_cell needs "${field}" naming the cell, e.g. ${field}="Sheet1!C2" or ${field}="C2" ` +
        'with a separate "sheet".',
    );
  }

  const { sheet, rest } = splitSheetRef(raw);
  const info = ctx.workbook.find(sheet ?? text(op, 'sheet') ?? null);
  return { info, ref: parseRef(rest) };
}

/**
 * Decide how a written value should be stored.
 *
 * The `=` prefix is the whole convention: it is what the user types in Excel, what a model
 * writes unprompted, and the only unambiguous signal available. `formula` as an explicit
 * parameter exists so that text which genuinely starts with `=` can still be written.
 */
function valueToWrite(
  op: Record<string, unknown>,
  at: { row: number; column: number },
  label: string,
): CellWrite {
  const explicit = op.formula;
  if (explicit !== undefined && explicit !== null && String(explicit) !== '') {
    return { ...at, label, kind: 'formula', value: String(explicit).replace(/^=/, '') };
  }

  const raw = op.value ?? op.text;
  if (raw === undefined || raw === null) {
    throw new DocumentError(
      `${formatRef(at.row, at.column)} has no "value". Pass value="…" (a number, text, or a ` +
        'formula starting with "="), or use clear_cells to empty it.',
    );
  }

  const value = String(raw);
  if (value === '') return { ...at, label, kind: 'blank', value: '' };
  if (value.startsWith('=')) return { ...at, label, kind: 'formula', value: value.slice(1) };
  if (isPlainNumber(value)) return { ...at, label, kind: 'number', value };
  return { ...at, label, kind: 'text', value };
}

// ─── Parameter reading ───────────────────────────────────────────────────────

function text(op: DocOp | Record<string, unknown>, name: string): string | undefined {
  const value = (op as Record<string, unknown>)[name];
  if (value === undefined || value === null) return undefined;
  const asText = String(value).trim();
  return asText === '' ? undefined : asText;
}

function required(op: DocOp, name: string): string {
  const value = text(op, name);
  if (value === undefined) {
    throw new DocumentError(`This operation needs a "${name}" parameter.`);
  }
  return value;
}

function number(op: DocOp, name: string): number | undefined {
  const value = text(op, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new DocumentError(`"${name}" must be a row number, not "${value}".`);
  }
  return parsed;
}

/**
 * Read a grid of values out of an op.
 *
 * Accepts a real array of arrays, a JSON string of one (which is what arrives when the model
 * quotes the whole thing), and a flat array (read as a single row). Every entry is stringified
 * here so the write path has one type to reason about — a number the model wrote as JSON and
 * one it wrote as text should not behave differently.
 */
function matrix(op: DocOp | Record<string, unknown>, name: string): string[][] {
  const raw = (op as Record<string, unknown>)[name];
  if (raw === undefined || raw === null) {
    throw new DocumentError(`"${name}" is required and must be an array of rows.`);
  }

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new DocumentError(
        `"${name}" is not valid JSON. Write it as an array of rows, e.g. ` +
          '[["Item","Result"],["A",1]].',
      );
    }
  }

  if (!Array.isArray(parsed)) {
    throw new DocumentError(`"${name}" must be an array of rows.`);
  }

  const rows = Array.isArray(parsed[0]) ? (parsed as unknown[][]) : [parsed as unknown[]];

  return rows.map((row, index) => {
    if (!Array.isArray(row)) {
      throw new DocumentError(
        `Row ${index + 1} of "${name}" is not an array. Every row must be its own array.`,
      );
    }
    return row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)));
  });
}
