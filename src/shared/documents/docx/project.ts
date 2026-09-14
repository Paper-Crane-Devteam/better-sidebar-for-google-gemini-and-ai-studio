/**
 * Projecting a docx into addressable text.
 *
 * ## The format, and why it looks like this
 *
 *     [p12 h1] 3 实验设计
 *     [p13] 为了验证上述假设，本文设计了……
 *     [t2 4×3]
 *     | 方法 | 准确率 | 召回率 |
 *     | --- | --- | --- |
 *     | ours | 0.91 | 0.88 |
 *
 * Two decisions worth defending:
 *
 * ⚠️ **No inline markup.** No `**bold**`, no `*italic*`. The projection is not only read,
 * it is *quoted back* — `doc_edit` locates text by matching what the agent supplies
 * against the paragraph's real characters. The moment the projection contains `**`, the
 * agent quotes it, and the match fails on text that is plainly there. Structure that
 * lives outside the text (the address prefix, table pipes) is safe; anything inside the
 * sentence is not.
 *
 * ⚠️ **The address is a prefix, not a suffix or a separate column.** The agent reads
 * top-to-bottom and has to know the address *before* the text it is about to quote,
 * otherwise it cites the previous paragraph's id. Same reason `read_file` prefixes line
 * numbers instead of reporting a range in a header.
 */

import type { DocProjectionResult, DocReadRequest } from '../types';
import { DocumentError } from '../types';
import type { LoadedDocument } from '../storage';
import {
  hasMergedCells,
  openDocx,
  paragraphText,
  tableGrid,
  type Block,
  type CellText,
  type DocPart,
  type DocxDocument,
} from './model';

/**
 * Default ceiling on returned characters.
 *
 * The round budget is 29998 characters *for every tool result in the round combined*
 * (see `engine/stages/handoff/budget.ts`). A reader that defaults to the whole budget
 * leaves nothing for the other calls the agent makes in the same turn, and the overflow
 * is silently truncated rather than reported. 12000 is enough for a full chapter.
 */
const DEFAULT_MAX_CHARS = 12000;

/** Hard ceiling, whatever the caller asks for. */
const ABSOLUTE_MAX_CHARS = 24000;

/** Context shown either side of a search hit. */
const SNIPPET_CONTEXT = 50;

/** Search hits returned at most. */
const MAX_HITS = 40;

export function docxRead(
  loaded: LoadedDocument,
  request: DocReadRequest,
): DocProjectionResult {
  const doc = openDocx(loaded.bytes);

  if (request.mode === 'search') {
    return search(doc, loaded.path, request);
  }

  return project(doc, loaded.path, request);
}

// ─── Range projection ────────────────────────────────────────────────────────

function project(
  doc: DocxDocument,
  path: string,
  request: DocReadRequest,
): DocProjectionResult {
  // A range may name a part (`hd1`, `fn:p2-p5`); without one it means the body. Reading is
  // always scoped to a single part, because paragraph numbers restart in each one and a
  // projection mixing two would give the same `pN` two meanings.
  const { part, spec } = splitRangeSpec(doc, request.range);
  const partBlocks = doc.blocks.filter((b) => b.part === part);
  const paragraphs = partBlocks.filter((b) => b.kind === 'paragraph');
  const total = paragraphs.length;
  const { startIndex, endIndex } = resolveRange(doc, part, spec, total);

  const limit = Math.min(
    request.maxChars && request.maxChars > 0 ? request.maxChars : DEFAULT_MAX_CHARS,
    ABSOLUTE_MAX_CHARS,
  );
  const withStructure = request.formatting !== false;

  const layout = mapLayout(partBlocks);
  const lines: string[] = [];
  if (part.kind !== 'body') lines.push(`(${part.label}, addressed as ${part.id}:pN)`);
  let used = 0;
  let lastRendered = startIndex - 1;
  let truncated = false;

  /**
   * Offset past which we are still inside an already-rendered table.
   *
   * A table is rendered as one block, so the paragraphs in its cells must not also be
   * emitted on their own — they are already in the grid. Skipping by offset handles
   * nested tables without a second mechanism.
   */
  let skipUntil = -1;

  for (const block of partBlocks) {
    if (block.el.outerStart < skipUntil) continue;

    if (block.kind === 'table') {
      const span = layout.tableSpan.get(block.id);
      // A table with no rows at all has no span and nothing to show. ⚠️ Note this is *not*
      // the "all cells are empty" case: a cell always contains a `w:p`, empty or not, and
      // that paragraph is numbered — so a blank checklist column still gives its table a
      // span and still gets rendered. It has to, since filling it in is the point.
      if (!span) continue;
      if (span.last < startIndex || span.first > endIndex) continue;

      const rendered = renderTable(doc, block, withStructure);
      // `used > 0`, not `lines.length > 0`: a non-body read opens with a label line, and
      // counting that as content would let the budget check drop the only block there is.
      if (used + rendered.length > limit && used > 0) {
        truncated = true;
        break;
      }
      lines.push(rendered);
      used += rendered.length;
      skipUntil = block.el.outerEnd;
      lastRendered = Math.max(lastRendered, Math.min(span.last, endIndex));
      continue;
    }

    const index = layout.paragraphIndex.get(block.id);
    if (index === undefined || index < startIndex || index > endIndex) continue;

    const rendered = renderParagraph(block, withStructure);
    if (used + rendered.length > limit && used > 0) {
      truncated = true;
      break;
    }
    lines.push(rendered);
    used += rendered.length;
    lastRendered = index;
  }

  const from = paragraphs[startIndex]?.id ?? 'p1';
  const to = paragraphs[Math.max(startIndex, lastRendered)]?.id ?? from;
  const nextIndex = lastRendered + 1;
  const incomplete = truncated || lastRendered < endIndex || endIndex < total - 1;

  // Other parts are named once, at the end of a body read, and only when they hold text.
  // Without it the agent has no way to learn that a header exists — and a header it does not
  // know about is a header it will report as absent when the user asks about its contents.
  if (part.kind === 'body') {
    const others = otherPartsNote(doc);
    if (others) lines.push(others);
  }

  return {
    kind: 'projection',
    path,
    format: 'docx',
    text: lines.join('\n'),
    covered: `${from}–${to} of ${total} paragraphs in ${part.label}`,
    truncated: incomplete,
    // The id already carries its part prefix, so `hd1:p2-p3` round-trips through
    // `splitRangeSpec` for free and the body keeps its familiar `p13-p40`.
    nextRange:
      incomplete && nextIndex < total
        ? `${paragraphs[nextIndex].id}-p${total}`
        : undefined,
  };
}

/** One line listing the parts a body read did not cover. */
function otherPartsNote(doc: DocxDocument): string | null {
  const others = doc.parts
    .filter(
      (part) =>
        part.kind !== 'body' &&
        doc.blocks.some(
          (b) => b.part === part && b.kind === 'paragraph' && paragraphText(b).trim() !== '',
        ),
    )
    .map((part) => `${part.id} (${part.label})`);

  if (others.length === 0) return null;
  return (
    `Text outside the body: ${others.join(', ')}. Read one with range="${others[0].split(' ')[0]}".`
  );
}

interface Layout {
  /** Paragraph id → its 0-based position among paragraphs. */
  paragraphIndex: Map<string, number>;
  /** Table id → the paragraph positions it encloses. */
  tableSpan: Map<string, { first: number; last: number }>;
}

/**
 * One pass that answers both "where is this paragraph in the sequence" and "which
 * paragraphs does this table cover".
 *
 * Blocks are already in document order, so a running counter gives paragraph positions,
 * and a stack of open tables (properly nested by construction) attributes each paragraph
 * to every table containing it. Computing this per paragraph instead would be
 * `indexOf` in a loop — quadratic on exactly the documents where it matters.
 */
function mapLayout(blocks: Block[]): Layout {
  const paragraphIndex = new Map<string, number>();
  const tableSpan = new Map<string, { first: number; last: number }>();
  const open: Array<{ id: string; end: number }> = [];
  let index = -1;

  for (const block of blocks) {
    while (open.length > 0 && block.el.outerStart >= open[open.length - 1].end) {
      open.pop();
    }

    if (block.kind === 'table') {
      open.push({ id: block.id, end: block.el.outerEnd });
      continue;
    }

    index++;
    paragraphIndex.set(block.id, index);

    for (const table of open) {
      const span = tableSpan.get(table.id);
      if (span) {
        span.last = index;
      } else {
        tableSpan.set(table.id, { first: index, last: index });
      }
    }
  }

  return { paragraphIndex, tableSpan };
}

function renderParagraph(block: Block, withStructure: boolean): string {
  const text = paragraphText(block).replace(/\n/g, ' ');
  const marker =
    withStructure && block.headingLevel ? ` h${block.headingLevel}` : '';
  return `[${block.id}${marker}] ${text}`;
}

/** Stands in for a cell with no text, so a blank column cannot be miscounted. */
const EMPTY_CELL = '∅';

/** Stands in for a position where the row has no cell at all. Not addressable. */
const NO_CELL = '—';

/**
 * A table, with its cells addressable.
 *
 * ## Why the row labels are worth their tokens
 *
 * The grid used to be plain Markdown, which meant a cell had no address at all. Reading it
 * told the agent *that* the third column was blank and gave it no way to say so — the only
 * expressible edit was to quote the second column's text, which is how a checklist ends up
 * with its answers in the wrong column.
 *
 * Adding a per-cell id to every cell would double the size of every table. Instead the
 * coordinates come from the axes: a leading `r1`/`r2` column and a `c1 c2 c3` head, from
 * which `t2r2c3` is derivable for any cell at a fixed cost of a few characters per row.
 *
 * ⚠️ `∅` marks an empty cell rather than leaving the space blank. `| a |  | c |` is
 * genuinely hard to count columns in — for a person and for a model — and mis-counting is
 * precisely the bug this rendering exists to prevent.
 *
 * ⚠️ Row and column numbers count `w:tr` and `w:tc` elements. With `gridSpan` or a vertical
 * merge that is not the visual grid, so a note says so. The numbering still round-trips,
 * because `blocks.ts` numbers cells from the same walk this renders from.
 */
function renderTable(
  doc: DocxDocument,
  block: Block,
  withStructure: boolean,
): string {
  const grid = tableGrid(doc, block);
  const columns = grid[0]?.length ?? 0;

  if (grid.length === 0 || columns === 0) {
    return `[${block.id} empty]`;
  }

  const cellText = (cell: CellText) =>
    !cell.exists ? NO_CELL : cell.text === '' ? EMPTY_CELL : cell.text;

  const notes = [
    `${grid.length}×${columns}`,
    `cells ${block.id}r1c1…, rows ${block.id}r1…`,
  ];
  if (grid.some((row) => row.some((cell) => cell.exists && cell.text === ''))) {
    notes.push(`${EMPTY_CELL} = empty, fill with set_text`);
  }
  if (grid.some((row) => row.some((cell) => !cell.exists))) {
    notes.push(`${NO_CELL} = no cell there`);
  }
  if (hasMergedCells(doc, block)) {
    notes.push('merged cells — r/c count cells, not the visual grid');
  }
  const header = `[${block.id} ${notes.join(' · ')}]`;

  if (!withStructure) {
    return `${header} ${grid.map((row) => row.map(cellText).join(' | ')).join(' / ')}`;
  }

  const lines = [
    `| r\\c | ${Array.from({ length: columns }, (_, i) => `c${i + 1}`).join(' | ')} |`,
    // A Markdown separator after the head, because without it the block does not read as a
    // table at all.
    `| --- | ${Array(columns).fill('---').join(' | ')} |`,
  ];

  grid.forEach((row, index) => {
    lines.push(`| r${index + 1} | ${row.map(cellText).join(' | ')} |`);
  });

  return `${header}\n${lines.join('\n')}`;
}

// ─── Range parsing ───────────────────────────────────────────────────────────

/**
 * Turn `p12-p48`, `p12`, `12-48`, `t3` or nothing into paragraph indices.
 *
 * Forgiving on purpose: the model writes all of these forms, and refusing `12-48`
 * because it lacks the `p` costs a whole round to correct something that has exactly
 * one meaning.
 */
/**
 * Peel an optional part prefix off a range.
 *
 * `hd1` alone means the whole of that part — headers and footers are a line or two, so
 * asking for a sub-range of one is not a case worth supporting. `fn:p3-p9` narrows within a
 * part. Anything without a prefix is a body range, which keeps every existing form working
 * unchanged.
 */
function splitRangeSpec(
  doc: DocxDocument,
  range: string | undefined,
): { part: DocPart; spec: string } {
  const raw = (range ?? '').trim().toLowerCase();
  const colon = raw.indexOf(':');

  if (colon !== -1) {
    const id = raw.slice(0, colon);
    const part = doc.parts.find((p) => p.id === id && p.kind !== 'body');
    if (!part) {
      throw new DocumentError(
        `This document has no part "${id}". It has: ${partList(doc)}.`,
      );
    }
    return { part, spec: raw.slice(colon + 1) };
  }

  const whole = doc.parts.find((p) => p.id === raw && p.kind !== 'body');
  if (whole) return { part: whole, spec: '' };

  return { part: doc.bodyPart, spec: raw };
}

function partList(doc: DocxDocument): string {
  return doc.parts
    .map((p) => (p.kind === 'body' ? 'the body (no prefix)' : `${p.id} (${p.label})`))
    .join(', ');
}

function resolveRange(
  doc: DocxDocument,
  part: DocPart,
  spec: string,
  total: number,
): { startIndex: number; endIndex: number } {
  if (total === 0) {
    throw new DocumentError(`${part.label} has no paragraphs.`);
  }

  if (spec === '' || spec === 'all') {
    return { startIndex: 0, endIndex: total - 1 };
  }

  // A table id names the paragraphs it contains, which is what "read t3" means. A cell
  // address is accepted for the same reason and narrows further, which is how the agent
  // confirms what it is about to fill in.
  const asCell = /^(t\d+)r(\d+)c(\d+)$/.exec(spec);
  if (asCell) {
    const cell = doc.cells.get(part.kind === 'body' ? spec : `${part.id}:${spec}`);
    if (!cell) {
      throw new DocumentError(
        `There is no ${spec} in this document. Read ${asCell[1]} to see its shape.`,
      );
    }
    const paragraphs = doc.blocks.filter((b) => b.part === part && b.kind === 'paragraph');
    const indices = paragraphs
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => cell.paragraphIds.includes(p.id))
      .map(({ index }) => index);
    if (indices.length === 0) {
      throw new DocumentError(`${spec} has no paragraph in it.`);
    }
    return { startIndex: indices[0], endIndex: indices[indices.length - 1] };
  }

  const asTable = /^t(\d+)$/.exec(spec);
  if (asTable) {
    const tableId = part.kind === 'body' ? spec : `${part.id}:${spec}`;
    const table = doc.byId.get(tableId);
    if (!table) throw new DocumentError(`There is no ${spec} in ${part.label}.`);
    const paragraphs = doc.blocks.filter((b) => b.part === part && b.kind === 'paragraph');
    const inside = paragraphs
      .map((p, index) => ({ p, index }))
      .filter(
        ({ p }) =>
          p.el.outerStart > table.el.outerStart && p.el.outerEnd < table.el.outerEnd,
      );
    if (inside.length === 0) {
      throw new DocumentError(`${spec} has no text in it.`);
    }
    return { startIndex: inside[0].index, endIndex: inside[inside.length - 1].index };
  }

  const match = /^p?(\d+)(?:\s*[-–~]\s*p?(\d+))?$/.exec(spec);
  if (!match) {
    throw new DocumentError(
      `Could not read "${spec}" as a range. Use a paragraph range like "p12-p48", a ` +
        'single paragraph like "p12", a table id like "t3", a cell like "t3r2c1", or a ' +
        `part like "hd1". This document has: ${partList(doc)}.`,
    );
  }

  const first = Number(match[1]);
  const second = match[2] ? Number(match[2]) : first;

  if (first < 1 || first > total) {
    throw new DocumentError(
      `p${first} is outside ${part.label}, which has ${total} paragraphs (p1–p${total}).`,
    );
  }

  return {
    startIndex: first - 1,
    endIndex: Math.min(Math.max(second, first), total) - 1,
  };
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Find text across the document, returning addresses and snippets.
 *
 * The point is not to read the document but to *locate* something in it, so the result
 * is deliberately narrow: the paragraph id and enough context to confirm it is the right
 * hit. The agent's next move is `mode: 'range'` on the id it picked.
 */
function search(
  doc: DocxDocument,
  path: string,
  request: DocReadRequest,
): DocProjectionResult {
  const query = (request.query ?? '').trim();
  if (query === '') {
    throw new DocumentError('doc_read with mode "search" needs a "query".');
  }

  const matcher = buildMatcher(query);
  const lines: string[] = [];
  let hits = 0;

  // Every part, deliberately: search is how the agent finds out *where* something is, and a
  // date that lives only in the page header is exactly the case a body-only search answered
  // with a confident "it is not in this document".
  for (const block of doc.blocks) {
    if (block.kind !== 'paragraph') continue;
    const text = paragraphText(block);
    if (text === '') continue;

    const at = matcher(text);
    if (at === -1) continue;

    hits++;
    if (hits > MAX_HITS) break;

    const from = Math.max(0, at - SNIPPET_CONTEXT);
    const to = Math.min(text.length, at + query.length + SNIPPET_CONTEXT);
    const snippet = `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? '…' : ''}`;
    // The cell address is the actionable half of a hit inside a table: it is what `set_text`
    // takes, and it is what tells the agent which column it is looking at.
    const where = block.cellId ? `${block.id} in ${block.cellId}` : block.id;
    lines.push(`[${where}] ${snippet}`);
  }

  const truncated = hits > MAX_HITS;
  const header =
    lines.length === 0
      ? `No paragraph contains "${query}".`
      : `${truncated ? `${MAX_HITS}+` : lines.length} paragraph(s) contain "${query}".`;

  return {
    kind: 'projection',
    path,
    format: 'docx',
    text: [header, ...lines].join('\n'),
    covered: `search for "${query}"`,
    truncated,
  };
}

/**
 * Case-insensitive literal search, with whitespace treated loosely.
 *
 * Not a regex, for the same reason `findInParagraph` is not: the query is text the user
 * or the agent quoted, and a bracket in a citation should not be a syntax error. The
 * whitespace tolerance matters because the projection joins Word's line breaks into
 * spaces, so a phrase the agent read may not have the spacing the document has.
 */
function buildMatcher(query: string): (text: string) => number {
  const needle = query.toLowerCase().replace(/\s+/g, ' ');
  return (text) => text.toLowerCase().replace(/\s+/g, ' ').indexOf(needle);
}
