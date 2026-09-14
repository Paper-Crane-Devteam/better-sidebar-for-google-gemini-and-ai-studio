/**
 * The docx document model — just enough of it.
 *
 * Opens the package, tokenises every part that holds visible text, and numbers their
 * blocks so each paragraph, table and table cell has an address. That numbering is the
 * document's table of contents *and* the coordinate system the projection quotes back.
 *
 * Three things it deliberately covers, each because its absence was a hole a user fell
 * into rather than a feature someone asked for:
 *
 * - **Headers, footers, footnotes and endnotes**, not just `word/document.xml`. Text the
 *   user can see but the tools cannot name reads to the agent as text that is not there.
 * - **Table cells**, as `t3r2c1`. See `blocks.ts`.
 * - **Paragraphs inside cells in the same `pN` sequence**, so the text of a results table
 *   is addressable the same way as body text.
 *
 * ⚠️ Ids are stable for a given file, not across an edit. Inserting a paragraph shifts
 * every later number in that part. That is why ids are navigation only and text edits are
 * addressed by quoted text (see `.kiro/docs/document-formats.md` §7.1) — an id the agent is
 * holding from a previous call may already mean a different paragraph.
 */

import { openArchive, looksLikeZip, type Archive } from '../zip';
import { DocumentError } from '../types';
import {
  type ElementRange,
  type XmlPart,
  attr,
  element,
  elements,
  textOf,
  tokenize,
} from '../ooxml/xml-cursor';
import { flattenParagraph, type FlatParagraph } from '../ooxml/runs';
import { readStyles, type StyleMap } from './styles';
import { numberPart, ownChild, type Block, type Cell, type Row } from './blocks';
import { openParts, splitAddress, type DocPart } from './parts';

export type { Block, Cell, Row } from './blocks';
export type { DocPart, PartKind } from './parts';
export { ownChild, requireParagraph } from './blocks';
export { addressIn, splitAddress, siblingOf, relsNameFor, directoryOf } from './parts';

export interface DocxDocument {
  archive: Archive;
  /** Name of the main part, which is *usually* but not always `word/document.xml`. */
  mainName: string;
  /** The main part's tokens. Kept as a field because most reads only ever want the body. */
  main: XmlPart;
  /** `w:body` of the main part. */
  body: ElementRange;
  /** The body as a part, for code that takes a `DocPart`. */
  bodyPart: DocPart;
  /** Body first, then headers, footers, footnotes, endnotes. */
  parts: DocPart[];
  styles: StyleMap;
  /** Every block in every part. */
  blocks: Block[];
  /** Body blocks only — the default scope for reading and for locating text. */
  bodyBlocks: Block[];
  byId: Map<string, Block>;
  /** Every table cell, by address. */
  cells: Map<string, Cell>;
  /** Every table row, by address. */
  rows: Map<string, Row>;
}

/** Relationship type identifying the main document part. */
const OFFICE_DOCUMENT_REL = '/officeDocument';

export function openDocx(bytes: Uint8Array): DocxDocument {
  if (!looksLikeZip(bytes)) {
    throw new DocumentError(
      'This is not a .docx file. A file with a .docx name but no zip header is ' +
        'usually a legacy .doc saved under the wrong extension — it has to be ' +
        're-saved as .docx in Word first.',
    );
  }

  const archive = openArchive(bytes);
  const mainName = findMainPart(archive);
  const main = tokenize(archive.text(mainName));

  const body = element(main, 'w:body');
  if (!body) {
    throw new DocumentError(
      `"${mainName}" has no <w:body>, so this file is not a readable Word document.`,
    );
  }

  const styles = readStyles(archive.textOrNull('word/styles.xml'));
  const parts = openParts(archive, mainName, main, body);

  const blocks: Block[] = [];
  const cells = new Map<string, Cell>();
  const rows = new Map<string, Row>();

  for (const part of parts) {
    const numbering = numberPart(part, styles);
    blocks.push(...numbering.blocks);
    for (const cell of numbering.cells) cells.set(cell.id, cell);
    for (const row of numbering.rows) rows.set(row.id, row);
  }

  const bodyPart = parts[0];

  return {
    archive,
    mainName,
    main,
    body,
    bodyPart,
    parts,
    styles,
    blocks,
    bodyBlocks: blocks.filter((b) => b.part === bodyPart),
    byId: new Map(blocks.map((b) => [b.id, b])),
    cells,
    rows,
  };
}

/**
 * Locate the main part through `_rels/.rels` rather than assuming its name.
 *
 * Word writes `word/document.xml`, but a file that has been through Google Docs,
 * Pages, or certain converters can name it `word/document2.xml`. Assuming the name
 * turns that into "this file is not valid", which is both wrong and unactionable.
 */
function findMainPart(archive: Archive): string {
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

  if (archive.has('word/document.xml')) return 'word/document.xml';

  throw new DocumentError(
    'Could not find the main document part. The file may be an .xlsx or .pptx that ' +
      'was renamed to .docx.',
  );
}

// ─── Addressing ──────────────────────────────────────────────────────────────

/** What an address resolved to. Rows and cells are not blocks — they hold paragraphs. */
export type Target =
  | { kind: 'block'; block: Block }
  | { kind: 'row'; row: Row }
  | { kind: 'cell'; cell: Cell };

/** A cell address: `t3r2c1`, optionally part-prefixed. */
const CELL_ADDRESS = /^t(\d+)r(\d+)c(\d+)$/;

/** A row address: `t3r2`. */
const ROW_ADDRESS = /^t(\d+)r(\d+)$/;

/**
 * Resolve an address the agent wrote, tolerating case and stray whitespace.
 *
 * ⚠️ The three not-found messages are different on purpose, because the three mistakes
 * have different fixes. A stale `pN` needs a re-read; a cell address that is out of range
 * needs the table's real shape; a part id that does not exist needs the list of parts the
 * document actually has. A single "no such id" would send the agent guessing.
 */
export function resolveTarget(doc: DocxDocument, address: string): Target {
  const key = address.trim().toLowerCase();

  const block = doc.byId.get(key);
  if (block) return { kind: 'block', block };

  const cell = doc.cells.get(key);
  if (cell) return { kind: 'cell', cell };

  const row = doc.rows.get(key);
  if (row) return { kind: 'row', row };

  const { partId, localId } = splitAddress(key);
  if (partId !== '' && !doc.parts.some((p) => p.id === partId)) {
    throw new DocumentError(
      `This document has no part "${partId}". It has: ${partNames(doc)}.`,
    );
  }

  const asCell = CELL_ADDRESS.exec(localId);
  if (asCell) throw cellOutOfRange(doc, key, `t${asCell[1]}`, partId);

  const asRow = ROW_ADDRESS.exec(localId);
  if (asRow) throw cellOutOfRange(doc, key, `t${asRow[1]}`, partId);

  throw new DocumentError(
    `There is no "${address}" in this document. ${shapeOf(doc, partId)} Run doc_read ` +
      'first — ids shift whenever paragraphs are added or removed, so one from an earlier ' +
      'read may be stale.',
  );
}

/** `resolveTarget`, refusing anything that is not a single block. */
export function resolveBlock(doc: DocxDocument, address: string): Block {
  const target = resolveTarget(doc, address);
  if (target.kind === 'cell') {
    throw new DocumentError(
      `${target.cell.id} is a table cell. It holds ${target.cell.paragraphIds.join(', ')} — ` +
        'name one of those, or use the cell address with an op that accepts a cell.',
    );
  }
  if (target.kind === 'row') {
    throw new DocumentError(
      `${target.row.id} is a table row. Name one of its cells (${target.row.cellIds
        .slice(0, 4)
        .join(', ')}) or a paragraph inside them.`,
    );
  }
  return target.block;
}

function cellOutOfRange(
  doc: DocxDocument,
  address: string,
  tableLocal: string,
  partId: string,
): DocumentError {
  const tableId = partId === '' ? tableLocal : `${partId}:${tableLocal}`;
  const table = doc.byId.get(tableId);
  if (!table || table.kind !== 'table') {
    return new DocumentError(
      `There is no ${tableId} in this document, so ${address} cannot exist.`,
    );
  }

  const shape = tableShape(doc, table);
  return new DocumentError(
    `${address} is outside ${tableId}, which has ${shape.rows} rows and at most ` +
      `${shape.columns} cells per row (${tableId}r1c1 to ${tableId}r${shape.rows}c` +
      `${shape.columns}).`,
  );
}

/** Rows and widest row of a table, for error messages and the projection header. */
export function tableShape(
  doc: DocxDocument,
  table: Block,
): { rows: number; columns: number } {
  let rows = 0;
  let columns = 0;
  for (const cell of doc.cells.values()) {
    if (cell.tableId !== table.id) continue;
    if (cell.row > rows) rows = cell.row;
    if (cell.column > columns) columns = cell.column;
  }
  return { rows, columns };
}

/** The cells of one table, row-major. */
export function cellsOf(doc: DocxDocument, table: Block): Cell[] {
  return [...doc.cells.values()]
    .filter((cell) => cell.tableId === table.id)
    .sort((a, b) => a.row - b.row || a.column - b.column);
}

/** The rows of one table, in order. Excludes rows of nested tables. */
export function rowsOf(doc: DocxDocument, table: Block): Row[] {
  return [...doc.rows.values()]
    .filter((row) => row.tableId === table.id)
    .sort((a, b) => a.row - b.row);
}

/** The cells of one row, in column order. */
export function cellsOfRow(doc: DocxDocument, row: Row): Cell[] {
  return row.cellIds
    .map((id) => doc.cells.get(id))
    .filter((c): c is Cell => c !== undefined);
}

function partNames(doc: DocxDocument): string {
  return doc.parts
    .map((p) => (p.kind === 'body' ? 'the body (unprefixed ids)' : `${p.id} (${p.label})`))
    .join(', ');
}

function shapeOf(doc: DocxDocument, partId: string): string {
  const part = doc.parts.find((p) => (partId === '' ? p.kind === 'body' : p.id === partId));
  if (!part) return '';
  const paragraphs = doc.blocks.filter(
    (b) => b.part === part && b.kind === 'paragraph',
  ).length;
  if (paragraphs === 0) return `${part.label} has no paragraphs.`;
  const first = part.kind === 'body' ? 'p1' : `${part.id}:p1`;
  const last = part.kind === 'body' ? `p${paragraphs}` : `${part.id}:p${paragraphs}`;
  return `${part.label} has ${first}–${last}.`;
}

// ─── Reading blocks ──────────────────────────────────────────────────────────

/** A paragraph's visible text plus its run map. Cached per call site, not globally. */
export function flatten(block: Block): FlatParagraph {
  if (block.kind !== 'paragraph') {
    throw new DocumentError(`${block.id} is a table, not a paragraph.`);
  }
  return flattenParagraph(block.part.xml, block.el);
}

/** A paragraph's text, without building the run map. */
export function paragraphText(block: Block): string {
  return flatten(block).text;
}

/**
 * A table as rows of cell text, with each cell's address alongside it.
 *
 * Cell text is the cell's paragraphs joined by a space rather than a newline: a
 * Markdown table cannot hold a line break, and a cell that wraps in Word is one value.
 * Nested tables collapse to their own text, which is lossy and is the right trade for a
 * projection — a nested table is addressable on its own `tN` id.
 *
 * ⚠️ Rows and columns come from `cellsOf`, i.e. from element order, so the grid the agent
 * reads and the address it derives from that grid are built from the same walk. See
 * `blocks.ts` for why that matters more than matching Word's visual layout.
 */
export function tableGrid(doc: DocxDocument, block: Block): CellText[][] {
  if (block.kind !== 'table') {
    throw new DocumentError(`${block.id} is a paragraph, not a table.`);
  }

  // Cells of a *nested* table carry that table's id, so they never land in this grid — their
  // text still shows up here through the enclosing cell, and they stay addressable on their
  // own `tN`.
  const cells = cellsOf(doc, block);
  const rows = cells.reduce((max, cell) => Math.max(max, cell.row), 0);
  const columns = cells.reduce((max, cell) => Math.max(max, cell.column), 0);

  // Built dense and rectangular so no consumer has to reason about holes. A row with fewer
  // cells than the widest one — which `gridSpan` produces — keeps `exists: false` padding,
  // and the renderer shows that differently from a cell that exists but is empty. Conflating
  // the two would invite an edit addressed at a cell that is not there.
  const grid: CellText[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellText[] = [];
    for (let c = 0; c < columns; c++) row.push({ id: '', text: '', exists: false });
    grid.push(row);
  }

  for (const cell of cells) {
    grid[cell.row - 1][cell.column - 1] = {
      id: cell.id,
      // `textOf` takes every text node under the cell, which is exactly right here:
      // we want the words, not the run structure.
      text: textOf(block.part.xml, cell.el).replace(/\s+/g, ' ').trim(),
      exists: true,
    };
  }

  return grid;
}

/** One position in a projected table. `exists: false` means the row has no such cell. */
export interface CellText {
  id: string;
  text: string;
  exists: boolean;
}

/** Whether a table uses merged cells, which makes the projected grid approximate. */
export function hasMergedCells(doc: DocxDocument, table: Block): boolean {
  for (const cell of cellsOf(doc, table)) {
    const tcPr = ownChild(cell.part, cell.el, 'w:tcPr');
    if (!tcPr) continue;
    if (ownChild(cell.part, tcPr, 'w:gridSpan') || ownChild(cell.part, tcPr, 'w:vMerge')) {
      return true;
    }
  }
  return false;
}

/** Every paragraph inside a cell, as blocks. */
export function cellParagraphs(doc: DocxDocument, cell: Cell): Block[] {
  return cell.paragraphIds
    .map((id) => doc.byId.get(id))
    .filter((b): b is Block => b !== undefined);
}
