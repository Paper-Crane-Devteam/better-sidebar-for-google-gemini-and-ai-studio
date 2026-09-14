/**
 * Adding and renaming worksheets.
 *
 * ## A new sheet touches four places
 *
 * 1. `xl/worksheets/sheetN.xml` — the part itself.
 * 2. `xl/_rels/workbook.xml.rels` — a relationship pointing at it.
 * 3. `[Content_Types].xml` — an override declaring what it is.
 * 4. `xl/workbook.xml` — a `<sheet>` entry inside `<sheets>`.
 *
 * ⚠️ Exactly the shape of adding `comments.xml` to a document, and the failure modes are the
 * same pair: miss (3) and Excel reports the whole workbook as damaged; miss (2) and the sheet
 * is in the file but not in the workbook, so it does not exist as far as the user can tell,
 * while the tool reports success.
 *
 * ## Why a new sheet is the safe way to change a workbook
 *
 * "Sort this" and "filter that" are destructive in place: they move data that charts, formulas
 * and pivot ranges point at by address. Written to a new sheet, the same result costs nothing
 * — the original is untouched, and the user can compare. `spreadsheet-analysis` pushes this
 * hard for that reason, and it is why `add_sheet` exists while `sort` deliberately does not.
 */

import { DocumentError } from '../types';
import { attr, element, elements, escapeXml, tokenize } from '../ooxml/xml-cursor';
import { columnName, quoteSheetName } from './refs';
import { directoryOf, type SheetInfo, type Workbook } from './model';
import { addRelationship, ensureContentType } from './recalc';

const WORKSHEET_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';

const WORKSHEET_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';

const SPREADSHEET_NS =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const RELATIONSHIPS_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Characters Excel refuses in a tab name, plus the length limit it enforces. */
const ILLEGAL_NAME = /[:\\/?*[\]]/;
const MAX_NAME_LENGTH = 31;

/**
 * Check a sheet name the way Excel does, before it reaches the file.
 *
 * ⚠️ Validating here rather than letting Excel complain is the difference between an error the
 * agent can fix in the same turn and a workbook the user cannot open. Every one of these rules
 * produces a repair prompt rather than a graceful failure.
 */
export function validateSheetName(workbook: Workbook, name: string, existing?: string): void {
  const trimmed = name.trim();

  if (trimmed === '') {
    throw new DocumentError('A sheet name cannot be empty.');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new DocumentError(
      `"${trimmed}" is ${trimmed.length} characters; Excel allows ${MAX_NAME_LENGTH}.`,
    );
  }
  if (ILLEGAL_NAME.test(trimmed)) {
    throw new DocumentError(
      `A sheet name cannot contain : \\ / ? * [ or ], so "${trimmed}" is not allowed.`,
    );
  }
  if (trimmed.startsWith("'") || trimmed.endsWith("'")) {
    throw new DocumentError('A sheet name cannot start or end with an apostrophe.');
  }
  if (trimmed.toLowerCase() === 'history') {
    // Not an Excel rule, but Excel reserves it internally and silently renames the tab.
    throw new DocumentError('"History" is reserved by Excel. Pick another name.');
  }

  const clash = workbook.sheets.find(
    (s) => s.name.toLowerCase() === trimmed.toLowerCase() && s.name !== existing,
  );
  if (clash) {
    throw new DocumentError(
      `This workbook already has a sheet called "${clash.name}". Sheet names are ` +
        'case-insensitive to Excel, so pick a different one.',
    );
  }
}

export interface NewSheet {
  name: string;
  /** Rows of values, written as text or numbers. Empty for a blank sheet. */
  rows: string[][];
}

/**
 * Create a worksheet and attach it, appended as the last tab.
 *
 * The part is generated from nothing, which makes this the one write here with no original to
 * preserve — the same reason `insert_table` is the safest docx table op. Values go in as
 * numbers when they parse as numbers and as inline strings otherwise, and a leading `=` is
 * written as a formula, which is how a summary sheet gets its totals.
 */
export function addSheet(workbook: Workbook, sheet: NewSheet): string {
  validateSheetName(workbook, sheet.name);

  const dir = directoryOf(workbook.bookName);
  const partName = freePartName(workbook, dir);

  workbook.archive.setText(partName, worksheetXml(sheet.rows));
  ensureContentType(workbook.archive, partName, WORKSHEET_CONTENT_TYPE);

  // The relationship target is relative to the workbook's own folder, which is how Excel
  // writes every one of them.
  const relId = addRelationship(
    workbook.archive,
    workbook.bookName,
    partName.slice(dir.length),
    WORKSHEET_REL_TYPE,
  );

  appendSheetEntry(workbook, sheet.name.trim(), relId);
  return partName;
}

/** `xl/worksheets/sheetN.xml` for the lowest free N. */
function freePartName(workbook: Workbook, dir: string): string {
  let n = workbook.sheets.length + 1;
  while (workbook.archive.has(`${dir}worksheets/sheet${n}.xml`)) n++;
  return `${dir}worksheets/sheet${n}.xml`;
}

/**
 * A `<sheet>` entry at the end of `<sheets>`.
 *
 * ⚠️ `sheetId` must be unique and is *not* the tab position — Excel keeps a deleted sheet's id
 * out of circulation, so reusing the highest+1 is the only safe choice. A duplicate id makes
 * Excel discard one of the two sheets on open.
 */
function appendSheetEntry(workbook: Workbook, name: string, relId: string): void {
  const source = workbook.archive.text(workbook.bookName);
  const part = tokenize(source);
  const container = element(part, 'sheets');

  if (!container) {
    throw new DocumentError('This workbook has no <sheets> element to add a sheet to.');
  }

  let highest = 0;
  for (const el of elements(part, 'sheet', container)) {
    const id = Number(attr(part, el, 'sheetId'));
    if (Number.isFinite(id) && id > highest) highest = id;
  }

  const entry =
    `<sheet name="${escapeXml(name)}" sheetId="${highest + 1}" r:id="${relId}"/>`;

  if (container.selfClosing) {
    workbook.archive.setText(
      workbook.bookName,
      source.slice(0, container.outerStart) +
        `<sheets>${entry}</sheets>` +
        source.slice(container.outerEnd),
    );
    return;
  }

  workbook.archive.setText(
    workbook.bookName,
    source.slice(0, container.innerEnd) + entry + source.slice(container.innerEnd),
  );
}

/** A complete worksheet part. */
function worksheetXml(rows: string[][]): string {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const body = rows
    .map((cells, index) => {
      const r = index + 1;
      const written = cells
        .map((value, column) => cellXml(r, column + 1, value))
        .filter((xml) => xml !== '')
        .join('');
      return `<row r="${r}">${written}</row>`;
    })
    .join('');

  const dimension =
    rows.length > 0 && width > 0
      ? `<dimension ref="A1:${columnName(width)}${rows.length}"/>`
      : '<dimension ref="A1"/>';

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    `<worksheet xmlns="${SPREADSHEET_NS}" xmlns:r="${RELATIONSHIPS_NS}">` +
    `${dimension}<sheetData>${body}</sheetData></worksheet>`
  );
}

function cellXml(row: number, column: number, value: string): string {
  const ref = `${columnName(column)}${row}`;
  if (value === '') return '';

  if (value.startsWith('=')) {
    return `<c r="${ref}"><f>${escapeXml(value.slice(1))}</f></c>`;
  }

  // Only a value that survives the round trip is written as a number. `"007"` and `"1e5"`
  // both parse as numbers and both would come back looking like something the user did not
  // type, so they stay text.
  if (isPlainNumber(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }

  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/**
 * Whether text should be stored as a number.
 *
 * ⚠️ Deliberately strict. An id like `007`, a phone number, a version like `1.10` and anything
 * in exponential notation all parse as numbers in JavaScript and would come back changed —
 * `007` as `7`, `1.10` as `1.1`. Requiring the canonical form means a value is only ever stored
 * as a number when doing so is lossless.
 */
export function isPlainNumber(value: string): boolean {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return false;
  return String(Number(value)) === value;
}

// ─── Renaming ────────────────────────────────────────────────────────────────

/**
 * Rename a tab, refusing when anything points at the old name.
 *
 * ⚠️ Excel stores sheet references in formulas as literal text — `=Sheet1!A1`, `'Q1 Data'!B2` —
 * and the same goes for defined names, chart series, data validations and conditional
 * formatting. Excel rewrites all of them when *it* does the rename; we would have to find them
 * across every part, inside a formula grammar we do not parse, and getting it 95% right means
 * leaving a workbook full of `#REF!`.
 *
 * So: rename when nothing references the sheet, refuse and say why when something does. A
 * refusal costs the user a rename they can do in Excel in two seconds; a silent 95% costs them
 * a broken workbook they may not notice for weeks.
 */
export function renameSheet(workbook: Workbook, info: SheetInfo, name: string): void {
  const target = name.trim();
  validateSheetName(workbook, target, info.name);

  const referencedIn = findReferences(workbook, info);
  if (referencedIn.length > 0) {
    throw new DocumentError(
      `"${info.name}" is referenced by name in ${referencedIn.join(', ')}. Renaming it here ` +
        'would leave those references pointing at a sheet that no longer exists (#REF!), so ' +
        'this is refused — rename the tab in Excel, which updates them, and then continue.',
    );
  }

  const source = workbook.archive.text(workbook.bookName);
  const part = tokenize(source);

  for (const el of elements(part, 'sheet')) {
    if (attr(part, el, 'r:id') !== info.relId) continue;
    const tag = source.slice(el.outerStart, el.outerEnd);
    const patched = tag.replace(
      /(\sname\s*=\s*)("[^"]*"|'[^']*')/,
      `$1"${escapeXml(target)}"`,
    );
    workbook.archive.setText(
      workbook.bookName,
      source.slice(0, el.outerStart) + patched + source.slice(el.outerEnd),
    );
    return;
  }

  throw new DocumentError(
    `Could not find the <sheet> entry for "${info.name}" in the workbook, so it cannot be ` +
      'renamed.',
  );
}

/**
 * Where the sheet's name appears outside its own tab entry.
 *
 * A substring search over the raw parts. Coarse on purpose — a false positive costs a refusal
 * the user can work around, a false negative costs them broken formulas — and the two spellings
 * checked (`Name!` and `'Name'!`) are the only two Excel writes.
 */
function findReferences(workbook: Workbook, info: SheetInfo): string[] {
  const bare = `${info.name}!`;
  const quoted = `${quoteSheetName(info.name)}!`;
  const escapedBare = escapeXml(bare);
  const escapedQuoted = escapeXml(quoted);

  const hit = (source: string | null) =>
    source !== null &&
    (source.includes(escapedBare) ||
      source.includes(escapedQuoted) ||
      source.includes(bare) ||
      source.includes(quoted));

  const places: string[] = [];

  if (hit(workbook.archive.textOrNull(workbook.bookName))) {
    places.push('a defined name');
  }

  for (const other of workbook.sheets) {
    if (other.partName === info.partName) continue;
    if (hit(workbook.archive.textOrNull(other.partName))) places.push(`sheet "${other.name}"`);
  }

  // Charts and pivot caches hold their source ranges as text too, and both survive a value
  // edit while breaking on a rename.
  for (const name of workbook.archive.names) {
    if (!name.startsWith('xl/charts/') && !name.startsWith('xl/pivotCache/')) continue;
    if (hit(workbook.archive.textOrNull(name))) {
      places.push(name.startsWith('xl/charts/') ? 'a chart' : 'a pivot table');
      break;
    }
  }

  return [...new Set(places)];
}
