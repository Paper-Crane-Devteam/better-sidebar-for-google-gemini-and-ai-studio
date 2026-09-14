/**
 * Table structure — building a new table, and adding or removing rows of an existing one.
 *
 * ## Why rows are cloned from a neighbour rather than built fresh
 *
 * A `w:tr` carries almost nothing that is visible and everything that makes the table look
 * like itself: `w:trPr` holds the row height and the repeat-as-header flag, and each
 * `w:tcPr` holds the column width, the shading, the borders, the vertical alignment and the
 * `w:gridSpan` that keeps a merged row aligned with the grid. A row built from scratch has
 * none of it, and the result is a table with one row that is visibly not part of the table.
 *
 * So `insert_row` copies the **structure** of an existing row — `w:trPr`, each cell's
 * `w:tcPr`, each cell's first `w:pPr` — and supplies its own content. ⚠️ Note that this is
 * deliberately *not* a string copy of the row. Cell content can hold bookmarks, comment
 * anchors, hyperlinks and someone else's tracked changes, all of which carry ids; a cloned
 * `w:bookmarkStart` is a duplicate id, which Word "repairs" silently and then reports as
 * damage we caused. Copying only the properties elements sidesteps that entirely, because
 * none of them can contain an anchor.
 *
 * Three things are stripped from what is copied, and each one is a real failure rather than
 * tidiness:
 *
 * - `w:vMerge` — a copied `restart` opens a second vertical merge over the same column, so
 *   the new row is swallowed into the one above it and appears to have done nothing.
 * - `w:cellIns` / `w:cellDel` / `w:tcPrChange` / `w:trPrChange` and any `w:ins` / `w:del`
 *   in the copied properties — these are *someone else's* revision records. Copied, they
 *   become a second change with the same id and the same author.
 * - `w:tblHeader` and `w:cnfStyle` — the flags that say "this row is the header". A data row
 *   that inherits them repeats on every page and picks up the header's conditional
 *   formatting.
 *
 * ## A new table needs borders it can rely on
 *
 * With no `w:tblStyle` and no `w:tblBorders`, a Word table has no lines at all — it renders
 * as text in invisible columns, which is never what "put this in a table" meant. A style id
 * is the better answer when the caller has one, because it matches the document's other
 * tables; without one, explicit `w:tblBorders` is written so the result is a visible table
 * in every reader.
 *
 * ## Two adjacent tables become one table
 *
 * Word merges them, silently. So an inserted table is padded with an empty paragraph on any
 * side that would otherwise touch another table, and a deleted table leaves one behind if
 * removing it would bring its neighbours together. The same rule covers the other end of the
 * body: a `w:body` may not end with a table.
 */

import { DocumentError } from '../types';
import {
  type Edit,
  type ElementRange,
  type XmlPart,
  childElements,
  escapeXml,
  removeElement,
} from '../ooxml/xml-cursor';
import { runXml } from '../ooxml/runs';
import { ownChild, type Cell, type DocPart, type Row } from './model';
import { revisionAttrs, type Revisions } from './revisions';

/** Border definition used when the caller names no table style. */
const DEFAULT_BORDERS =
  '<w:tblBorders>' +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
    .join('') +
  '</w:tblBorders>';

/** Total grid width in twips — the text column of a portrait A4/Letter page with 1" margins. */
const GRID_WIDTH = 9360;

/** Largest table this will build. A model asked for a table, not a database dump. */
const MAX_ROWS = 200;
const MAX_COLUMNS = 32;

/** Properties children that must not be carried onto a cloned row. See the header. */
const DROP_FROM_TC_PR = new Set([
  'w:vMerge',
  'w:cellIns',
  'w:cellDel',
  'w:cellMerge',
  'w:tcPrChange',
]);

const DROP_FROM_TR_PR = new Set([
  'w:tblHeader',
  'w:cnfStyle',
  'w:ins',
  'w:del',
  'w:trPrChange',
]);

const DROP_FROM_P_PR = new Set(['w:rPr', 'w:pPrChange', 'w:sectPr']);

const DROP_FROM_TBL_PR_EX = new Set(['w:tblPrExChange']);

// ─── Building a new table ────────────────────────────────────────────────────

export interface NewTable {
  rows: string[][];
  /** Repeat the first row on every page and set it in bold. */
  header: boolean;
  /** A `w:tblStyle` id. When absent, explicit borders are written instead. */
  styleId?: string;
  tracked: boolean;
}

/**
 * The XML for a whole new table.
 *
 * One revision id for the entire table when tracking: inserting a table is one change, and
 * splitting it per row would make the user accept a 12-row table twelve times — and let them
 * accept half of it, which is a table nobody asked for.
 */
export function newTableXml(table: NewTable, rev: Revisions): string {
  const columns = table.rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (table.rows.length === 0 || columns === 0) {
    throw new DocumentError(
      '"rows" must be a non-empty array of arrays, e.g. [["Name","Result"],["A","ok"]].',
    );
  }
  if (table.rows.length > MAX_ROWS || columns > MAX_COLUMNS) {
    throw new DocumentError(
      `That table is ${table.rows.length}×${columns}, past the ${MAX_ROWS}×${MAX_COLUMNS} ` +
        'limit for one call. Split it, or write the data to a .csv instead.',
    );
  }

  const attrs = table.tracked ? revisionAttrs(rev) : '';
  const width = Math.floor(GRID_WIDTH / columns);

  const properties =
    '<w:tblPr>' +
    (table.styleId ? `<w:tblStyle w:val="${escapeXml(table.styleId)}"/>` : '') +
    '<w:tblW w:w="5000" w:type="pct"/>' +
    (table.styleId ? '' : DEFAULT_BORDERS) +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" ' +
    'w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    '</w:tblPr>';

  const grid =
    `<w:tblGrid>${`<w:gridCol w:w="${width}"/>`.repeat(columns)}</w:tblGrid>`;

  const rows = table.rows
    .map((cells, index) => {
      const isHeader = table.header && index === 0;
      // ⚠️ Order inside `w:trPr` is a sequence, not a choice: `w:tblHeader` belongs to
      // `CT_TrPrBase` and `w:ins` is added after it by `CT_TrPr`. Reversing them is the kind
      // of schema violation Word reports as unreadable content.
      const trPr =
        isHeader || attrs
          ? `<w:trPr>${isHeader ? '<w:tblHeader/>' : ''}${attrs ? `<w:ins ${attrs}/>` : ''}</w:trPr>`
          : '';

      const tcs = Array.from({ length: columns }, (_, column) =>
        newCellXml(cells[column] ?? '', {
          width,
          bold: isHeader,
          attrs,
        }),
      ).join('');

      return `<w:tr>${trPr}${tcs}</w:tr>`;
    })
    .join('');

  return `<w:tbl>${properties}${grid}${rows}</w:tbl>`;
}

function newCellXml(
  text: string,
  options: { width: number; bold: boolean; attrs: string },
): string {
  const rPr = options.bold ? '<w:rPr><w:b/></w:rPr>' : '';
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${options.width}" w:type="dxa"/></w:tcPr>` +
    paragraphInCellXml(text, { pPr: '', rPr, attrs: options.attrs }) +
    '</w:tc>'
  );
}

/**
 * One paragraph of cell content.
 *
 * ⚠️ The paragraph **mark** carries its own `w:ins` when tracking, separately from the run.
 * Without it Word shows the text as inserted but treats the paragraph break as pre-existing,
 * so rejecting the change leaves an empty paragraph behind in every cell — the same trap
 * `revisions.ts` documents for a whole inserted paragraph.
 */
function paragraphInCellXml(
  text: string,
  options: { pPr: string; rPr: string; attrs: string },
): string {
  const run = runXml(text, options.rPr);
  if (!options.attrs) {
    const pPr = options.pPr ? `<w:pPr>${options.pPr}</w:pPr>` : '';
    return `<w:p>${pPr}${run}</w:p>`;
  }

  const pPr = `<w:pPr>${options.pPr}<w:rPr><w:ins ${options.attrs}/></w:rPr></w:pPr>`;
  const body = run === '' ? '' : `<w:ins ${options.attrs}>${run}</w:ins>`;
  return `<w:p>${pPr}${body}</w:p>`;
}

// ─── Cloning a row ───────────────────────────────────────────────────────────

/**
 * A new row shaped like an existing one.
 *
 * `cells` supplies the text per column; a shorter array leaves the rest empty, which is the
 * common case — "add a blank row I can fill in" and "add a row with these values" are the
 * same op.
 */
export function clonedRowXml(
  template: Row,
  cells: Cell[],
  text: string[],
  rev: Revisions,
  tracked: boolean,
): string {
  const part = template.part;
  const attrs = tracked ? revisionAttrs(rev) : '';

  // ⚠️ `w:tblPrEx` is a per-row override of the table's own borders and spacing, and in
  // `CT_Row` it comes **before** `w:trPr`. Tables that have been through a merge or a
  // converter carry it, and a row that drops it gets the table's default borders while its
  // neighbours keep the overridden ones — a visibly different row.
  const tblPrEx = keptChildren(
    part,
    ownChild(part, template.el, 'w:tblPrEx'),
    DROP_FROM_TBL_PR_EX,
  );
  const trPr = keptChildren(part, ownChild(part, template.el, 'w:trPr'), DROP_FROM_TR_PR);

  const properties =
    (tblPrEx ? `<w:tblPrEx>${tblPrEx}</w:tblPrEx>` : '') +
    (trPr || attrs
      ? `<w:trPr>${trPr}${attrs ? `<w:ins ${attrs}/>` : ''}</w:trPr>`
      : '');

  const tcs = cells
    .map((cell, index) => clonedCellXml(cell, text[index] ?? '', attrs))
    .join('');

  return `<w:tr>${properties}${tcs}</w:tr>`;
}

function clonedCellXml(template: Cell, text: string, attrs: string): string {
  const part = template.part;
  const tcPr = keptChildren(part, ownChild(part, template.el, 'w:tcPr'), DROP_FROM_TC_PR);

  // The template cell's own paragraph properties, so alignment and spacing carry over. Its
  // `w:rPr` is dropped by `DROP_FROM_P_PR` and rebuilt below, because a copied one can hold
  // the template's revision marks.
  const first = firstParagraph(part, template.el);
  const pPr = first ? keptChildren(part, ownChild(part, first, 'w:pPr'), DROP_FROM_P_PR) : '';
  const rPr = first ? firstRunProperties(part, first) : '';

  return (
    `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}` +
    paragraphInCellXml(text, { pPr, rPr, attrs }) +
    '</w:tc>'
  );
}

/** A properties element's children, minus the ones that must not be copied. */
function keptChildren(
  part: DocPart,
  el: ElementRange | null,
  drop: Set<string>,
): string {
  if (!el || el.selfClosing) return '';
  return childElements(part.xml, el)
    .filter((child) => !drop.has(child.name))
    .map((child) => part.xml.source.slice(child.outerStart, child.outerEnd))
    .join('');
}

/** The first `w:p` directly inside a cell. */
function firstParagraph(part: DocPart, cell: ElementRange): ElementRange | null {
  return childElements(part.xml, cell, 'w:p')[0] ?? null;
}

/**
 * The run properties of a paragraph's first run, for text going into a cloned cell.
 *
 * Taken from a real run rather than from the paragraph mark, because in a table it is the
 * run that carries what the column looks like — the mark's `w:rPr` in a data cell is often
 * empty even when every visible character is 9pt.
 */
function firstRunProperties(part: DocPart, paragraph: ElementRange): string {
  for (const run of childElements(part.xml, paragraph, 'w:r')) {
    const rPr = ownChild(part, run, 'w:rPr');
    if (rPr) return part.xml.source.slice(rPr.outerStart, rPr.outerEnd);
  }
  return '';
}

// ─── Deleting rows and tables ────────────────────────────────────────────────

/**
 * The `w:del` that marks a row deleted, placed in its `w:trPr`.
 *
 * ⚠️ This is only one third of a tracked row deletion. Word also needs `w:del` on each cell
 * paragraph's mark and every run's text moved into `w:delText` — with just this, it shows a
 * struck-through row that reappears when the change is accepted. The caller pairs it with
 * `deleteParagraphEdits` for every paragraph in the row, **sharing one revision id**, so the
 * whole row is one Accept.
 */
export function rowDeletionMark(row: Row, attrs: string, label?: string): Edit {
  const part = row.part;
  const trPr = ownChild(part, row.el, 'w:trPr');

  if (trPr && !trPr.selfClosing) {
    // ⚠️ `CT_TrPr` ends with the sequence `ins?, del?, trPrChange?`, so a `w:del` appended
    // after an existing `w:trPrChange` is out of order — the schema violation Word reports as
    // unreadable content. Same shape as the `w:sectPr` case in `markParagraphMark`.
    const change = ownChild(part, trPr, 'w:trPrChange');
    const at = change ? change.outerStart : trPr.innerEnd;
    return { start: at, end: at, text: `<w:del ${attrs}/>`, label };
  }
  if (trPr) {
    return {
      start: trPr.outerStart,
      end: trPr.outerEnd,
      text: `<w:trPr><w:del ${attrs}/></w:trPr>`,
      label,
    };
  }
  // `w:trPr` must be the first child of `w:tr`.
  return {
    start: row.el.innerStart,
    end: row.el.innerStart,
    text: `<w:trPr><w:del ${attrs}/></w:trPr>`,
    label,
  };
}

/** Remove a row or a table outright, for `direct` mode. */
export function removeRowOrTable(el: ElementRange, label?: string): Edit {
  return removeElement(el, label);
}

/**
 * Whether removing this element would bring two tables together.
 *
 * Word merges adjacent tables into one, silently, so the caller replaces the element with an
 * empty paragraph instead of deleting it outright.
 */
export function wouldMergeNeighbours(part: DocPart, el: ElementRange): boolean {
  return siblingBefore(part, el) === 'w:tbl' && siblingAfter(part, el) === 'w:tbl';
}

/**
 * Padding an inserted table needs so it does not merge with a neighbour.
 *
 * `after` says which side of the anchor the table goes on, which is what decides who the new
 * table's neighbours will be.
 */
export function tableSpacers(
  part: DocPart,
  anchor: ElementRange,
  after: boolean,
): { lead: string; trail: string } {
  const previous = after ? anchor.name : siblingBefore(part, anchor);
  const next = after ? siblingAfter(part, anchor) : anchor.name;

  return {
    lead: previous === 'w:tbl' ? '<w:p/>' : '',
    // ⚠️ Three cases, not one. `w:tbl` would merge; `null` means the table would be the last
    // thing in the body or the cell; and `w:sectPr` means the same — a section's properties
    // are not block content, so a table sitting immediately before them is still the last
    // block-level element, and Word treats a body or cell that ends with a table as damaged.
    trail:
      next === 'w:tbl' || next === 'w:sectPr' || next === null ? '<w:p/>' : '',
  };
}

/** Name of the element immediately before this one at the same depth, or null. */
function siblingBefore(part: DocPart, el: ElementRange): string | null {
  const tokens = part.xml.tokens;
  for (let i = el.openIndex - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token.depth < el.depth) return null; // reached the parent's opening tag
    if (token.depth !== el.depth) continue;
    if (token.kind === 'close' || token.kind === 'self') return token.name;
  }
  return null;
}

/** Name of the element immediately after this one at the same depth, or null. */
function siblingAfter(part: DocPart, el: ElementRange): string | null {
  const tokens = part.xml.tokens;
  for (let i = el.closeIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.depth < el.depth) return null; // reached the parent's closing tag
    if (token.depth !== el.depth) continue;
    if (token.kind === 'open' || token.kind === 'self') return token.name;
  }
  return null;
}
