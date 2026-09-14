/**
 * Numbering a part's blocks — the coordinate system every address is built on.
 *
 * One walk over a part's token stream assigns an address to every paragraph and table in
 * document order, at every depth. Document order is the only rule, and it is what lets
 * `p12` mean the same thing to the reader, to the projection and to an edit.
 *
 * ## Table cells are addressable, and that is the point of this file
 *
 * Paragraphs inside table cells were always numbered in the same `pN` sequence, but
 * nothing exposed *which cell* a given `pN` was in — and a cell with no text has no
 * quotable string either. The result was a hole with a very specific shape: an empty
 * column in a checklist could not be filled at all. The agent's only expressible move was
 * to quote the neighbouring cell's text, and the value landed in the wrong column.
 *
 * So the walk now also records a grid position for every cell: `t3r2c1` is the first cell
 * of the second row of table `t3`. Two properties matter more than the syntax:
 *
 * ⚠️ **Row and column count `w:tr` and `w:tc` elements, not visual grid positions.** A
 * `w:gridSpan` or a vertical merge makes the two diverge. Counting elements is the choice
 * that keeps the *projection* and the *address* in agreement — the renderer walks the same
 * elements in the same order, so a cell the agent picked off the rendered grid is the cell
 * it addresses. A visual-grid numbering would read better and resolve to the wrong cell.
 *
 * ⚠️ **`mc:Fallback` is skipped.** Word writes a shape's text twice inside
 * `mc:AlternateContent`: once under `mc:Choice` for modern Word and once under
 * `mc:Fallback` as a VML picture for Word 2007. Numbering both gave every text box two
 * addresses holding identical text, so `replace_text` saw two matches, refused as
 * ambiguous, and no extra context could ever make it unique — the two really are the same
 * sentence. Numbering only the `mc:Choice` branch makes the text editable again.
 *
 * ⚠️ **Separator footnotes are skipped.** `footnotes.xml` always opens with two synthetic
 * entries (`w:type="separator"` and `"continuationSeparator"`) holding an empty paragraph
 * each. Numbering them would push every real footnote's address up by two and make `fn:p1`
 * a paragraph the user cannot see.
 */

import { DocumentError } from '../types';
import {
  type ElementRange,
  attr,
  element,
  elementAt,
} from '../ooxml/xml-cursor';
import { headingLevelOf, styleIdOf, type StyleMap } from './styles';
import { addressIn, type DocPart } from './parts';

export interface Block {
  kind: 'paragraph' | 'table';
  /** `p12`, `t3`, `hd1:p2`. Unique across the whole document. */
  id: string;
  /** The part this block lives in. Offsets in `el` index `part.xml.source`. */
  part: DocPart;
  el: ElementRange;
  /** 1–9 for a heading paragraph, null for body text and for tables. */
  headingLevel: number | null;
  /** The paragraph's style id, when it has one. Useful in warnings. */
  styleId: string | null;
  /** True when this block sits inside a table cell (or a nested table). */
  inTable: boolean;
  /** The cell this paragraph is in, e.g. `t3r2c1`. Null outside a table. */
  cellId: string | null;
}

export interface Cell {
  /** `t3r2c1`, part-prefixed like every other address. */
  id: string;
  /** The table this cell belongs to. */
  tableId: string;
  /** The row this cell belongs to, e.g. `t3r2`. */
  rowId: string;
  part: DocPart;
  /** The `w:tc` element. */
  el: ElementRange;
  /** 1-based index among the table's `w:tr`. */
  row: number;
  /** 1-based index among the row's `w:tc`. */
  column: number;
  /** Ids of the paragraphs in this cell, in order. Always at least one. */
  paragraphIds: string[];
}

/**
 * A table row, addressable as `t3r2`.
 *
 * Rows get their own address for the same reason cells did: the structural ops need to name
 * one, and inventing a separate `{ table, row }` parameter shape for them would give the
 * model two ways to point at a table — one for text, one for structure — which is exactly
 * the kind of split that produces calls aimed at the wrong thing.
 */
export interface Row {
  /** `t3r2`, part-prefixed. */
  id: string;
  tableId: string;
  part: DocPart;
  /** The `w:tr` element. */
  el: ElementRange;
  /** 1-based index among the table's `w:tr`. */
  row: number;
  cellIds: string[];
}

/** What one part contributed. */
export interface Numbering {
  blocks: Block[];
  cells: Cell[];
  rows: Row[];
}

/** A table, row or cell we are currently inside. */
interface Frame {
  name: string;
  depth: number;
  /** Set on table frames. */
  table?: { id: string; row: number; column: number };
  /** Set on row frames. */
  tableRow?: Row;
  /** Set on cell frames. */
  cell?: Cell;
}

/**
 * Walk one part, assigning ids in document order.
 *
 * Iterative over tokens rather than recursive over elements: a deeply nested table would
 * otherwise recurse per level, and the token walk gives document order for free — which
 * is the property every address depends on.
 */
export function numberPart(part: DocPart, styles: StyleMap): Numbering {
  const blocks: Block[] = [];
  const cells: Cell[] = [];
  const rows: Row[] = [];
  const stack: Frame[] = [];

  let paragraphNumber = 0;
  let tableNumber = 0;
  /** Depth of a subtree being ignored (`mc:Fallback`, a separator footnote), or -1. */
  let skipBelow = -1;

  const xml = part.xml;

  for (let i = part.root.openIndex + 1; i < part.root.closeIndex; i++) {
    const token = xml.tokens[i];

    if (skipBelow !== -1) {
      if (token.kind === 'close' && token.depth === skipBelow) skipBelow = -1;
      continue;
    }

    if (token.kind === 'close') {
      while (
        stack.length > 0 &&
        stack[stack.length - 1].depth === token.depth &&
        stack[stack.length - 1].name === token.name
      ) {
        stack.pop();
      }
      continue;
    }

    if (token.kind !== 'open' && token.kind !== 'self') continue;

    // See the header: the fallback branch repeats the choice branch's text verbatim.
    if (token.name === 'mc:Fallback') {
      if (token.kind === 'open') skipBelow = token.depth;
      continue;
    }

    if (token.name === 'w:footnote' || token.name === 'w:endnote') {
      if (token.kind === 'open' && isSyntheticNote(part, i)) skipBelow = token.depth;
      continue;
    }

    if (token.name === 'w:tbl') {
      const el = elementAt(xml, i);
      const id = addressIn(part, `t${++tableNumber}`);
      blocks.push({
        kind: 'table',
        id,
        part,
        el,
        headingLevel: null,
        styleId: null,
        inTable: stack.some((f) => f.table !== undefined),
        cellId: currentCell(stack)?.id ?? null,
      });
      if (token.kind === 'open') {
        stack.push({ name: 'w:tbl', depth: token.depth, table: { id, row: 0, column: 0 } });
      }
      continue;
    }

    if (token.name === 'w:tr') {
      const table = currentTable(stack);
      if (!table) continue;

      table.row++;
      table.column = 0;

      if (token.kind !== 'open') continue;
      const row: Row = {
        id: addressIn(part, `${localId(table.id)}r${table.row}`),
        tableId: table.id,
        part,
        el: elementAt(xml, i),
        row: table.row,
        cellIds: [],
      };
      rows.push(row);
      stack.push({ name: 'w:tr', depth: token.depth, tableRow: row });
      continue;
    }

    if (token.name === 'w:tc') {
      const table = currentTable(stack);
      const row = currentRow(stack);
      // A `w:tc` with no enclosing table is malformed; ignoring it is better than
      // inventing an address that resolves to nothing.
      if (!table || !row || token.kind !== 'open') continue;

      table.column++;
      const cell: Cell = {
        id: addressIn(part, `${localId(table.id)}r${table.row}c${table.column}`),
        tableId: table.id,
        rowId: row.id,
        part,
        el: elementAt(xml, i),
        row: table.row,
        column: table.column,
        paragraphIds: [],
      };
      cells.push(cell);
      row.cellIds.push(cell.id);
      stack.push({ name: 'w:tc', depth: token.depth, cell });
      continue;
    }

    if (token.name !== 'w:p') continue;

    const el = elementAt(xml, i);
    // `w:pPr` must be this paragraph's own, not one belonging to a run or a nested
    // paragraph: `element()` returns the first match anywhere inside, so the depth
    // check is what makes it correct.
    const pPr = ownChild(part, el, 'w:pPr');
    const cell = currentCell(stack);
    const id = addressIn(part, `p${++paragraphNumber}`);

    if (cell) cell.paragraphIds.push(id);

    blocks.push({
      kind: 'paragraph',
      id,
      part,
      el,
      headingLevel: headingLevelOf(xml, pPr, styles),
      styleId: styleIdOf(xml, pPr),
      inTable: stack.some((f) => f.table !== undefined),
      cellId: cell?.id ?? null,
    });
  }

  return { blocks, cells, rows };
}

function currentTable(stack: Frame[]): { id: string; row: number; column: number } | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].table) return stack[i].table!;
  }
  return null;
}

function currentRow(stack: Frame[]): Row | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].tableRow) return stack[i].tableRow!;
    // ⚠️ Stop at a table boundary. A nested table's `w:tc` must attach to the nested
    // table's own row, never to the row of the cell it is sitting in.
    if (stack[i].table) return null;
  }
  return null;
}

function currentCell(stack: Frame[]): Cell | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].cell) return stack[i].cell!;
  }
  return null;
}

/**
 * Whether a `w:footnote` is one of the package's synthetic separator entries.
 *
 * Anything with a `w:type` other than `normal` is Word's own furniture — the horizontal
 * rule above the notes and its continuation twin. They are not content and the user cannot
 * see them as text.
 */
function isSyntheticNote(part: DocPart, openIndex: number): boolean {
  const el = elementAt(part.xml, openIndex);
  const type = attr(part.xml, el, 'w:type');
  return type !== null && type !== 'normal';
}

/** Strip the part prefix from an address: `hd1:t2` → `t2`. */
function localId(address: string): string {
  const colon = address.indexOf(':');
  return colon === -1 ? address : address.slice(colon + 1);
}

/** A direct child element by name, or null. */
export function ownChild(
  part: DocPart,
  parent: ElementRange,
  name: string,
): ElementRange | null {
  const found = element(part.xml, name, parent);
  return found && found.depth === parent.depth + 1 ? found : null;
}

/** Guard for the ops that only make sense on a paragraph. */
export function requireParagraph(block: Block): Block {
  if (block.kind !== 'paragraph') {
    throw new DocumentError(`${block.id} is a table, not a paragraph.`);
  }
  return block;
}
