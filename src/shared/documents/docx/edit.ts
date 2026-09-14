/**
 * Applying edits to a Word document.
 *
 * ## Edits are addressed by quoted text, never by paragraph number
 *
 * `p12` is navigation. It is *not* an edit address, and the difference is the most
 * important rule in this file. Insert one paragraph and every later number shifts, so a
 * `pN` the agent read in a previous round may already mean a different paragraph — and
 * nothing about the result would look wrong. An address that can silently drift is a
 * source of "it edited the wrong section" bugs that are invisible in the tool output.
 *
 * So the address is `old_text`, with exactly the semantics `edit_file` already
 * established: match it character for character against what was read, refuse when it
 * matches more than once, and let `scope` narrow the search when the same sentence
 * genuinely appears twice. Refusing an ambiguous match is the check that prevents the
 * wrong edit; `all: true` exists for the deliberate global rename and says so.
 *
 * `scope` takes a paragraph (`p12`), a table (`t3`), a **table cell** (`t3r2c1`) or a
 * **part** (`hd1` for a header, `fn` for footnotes). The last two are how text outside the
 * main body is reached at all — `locate` searches the body by default, for the reason given
 * there.
 *
 * ## `set_text` is the one exception, and it is deliberately narrow
 *
 * An empty table cell has no text to quote, which made it unaddressable: filling in a blank
 * column was impossible, and the only expressible move was to replace the neighbouring
 * cell's text — which is how an answer ends up in the wrong column. `set_text` addresses by
 * id and therefore **refuses any target that is not empty**, so it adds the missing
 * capability without reopening the silent-wrong-paragraph failure that `old_text` prevents.
 *
 * ## An op touches exactly one part
 *
 * Offsets only mean something against the string they were computed from. Each op reports
 * which part its edits belong to, `docxEdit` groups them, and an op whose hits straddle two
 * parts is refused rather than applied to either.
 *
 * ## Every op resolves against the document as it was loaded
 *
 * Ops do not see each other's results. Each one produces splices into the *original*
 * `document.xml`, and `applyEdits` applies them right-to-left at the end, refusing any
 * overlap. Two ops that touch the same sentence therefore fail loudly instead of
 * composing into something neither intended.
 *
 * ⚠️ The consequence is worth stating: an op cannot be written against text that an
 * earlier op in the same call produced. Two calls, in that case.
 *
 * ## One failed op does not fail the call
 *
 * A refused op goes into `skipped` with the reason, and the rest still apply. The agent
 * usually sends four or five ops from one reading pass, and losing all of them because one
 * quote had a typo costs a whole round to rebuild work that was fine.
 */

import { DocumentError, type DocEditRequest, type DocOp } from '../types';
import type { LoadedDocument } from '../storage';
import type { EditOutcome } from '../registry';
import { type Edit, XmlError, applyEdits } from '../ooxml/xml-cursor';
import {
  type FlatParagraph,
  type TextHit,
  checkEditable,
  findInParagraph,
  rPrAt,
} from '../ooxml/runs';
import {
  cellParagraphs,
  cellsOfRow,
  flatten,
  openDocx,
  resolveBlock,
  resolveTarget,
  rowsOf,
  type Block,
  type Cell,
  type DocPart,
  type DocxDocument,
  type Row,
} from './model';
import {
  type Revisions,
  countExistingRevisions,
  deleteParagraphEdits,
  directReplaceEdits,
  existingAuthors,
  fillParagraphEdits,
  insertedParagraphXml,
  markRunProperties,
  openRevisions,
  revisionAttrs,
  setStyleEdits,
  trackedDeleteParagraphEdits,
  trackedReplaceEdits,
} from './revisions';
import {
  clonedRowXml,
  newTableXml,
  removeRowOrTable,
  rowDeletionMark,
  tableSpacers,
  wouldMergeNeighbours,
} from './tables';
import {
  type CommentWriter,
  commentOnParagraphEdits,
  commentOnTextEdits,
  initialsFor,
  openComments,
} from './comments';

/**
 * Ceiling on one `all: true` replacement.
 *
 * A global rename across a thesis is a legitimate ~50 hits. Four hundred means the quote
 * was a word like "the", and the agent should hear that rather than produce a document
 * with four hundred tracked changes in it.
 */
const MAX_BULK_HITS = 120;

/** Characters of text quoted back in the result summary. */
const SNIPPET = 40;

export function docxEdit(loaded: LoadedDocument, request: DocEditRequest): EditOutcome {
  const doc = openDocx(loaded.bytes);
  const tracked = (request.mode ?? 'track') === 'track';
  const rev = openRevisions(doc, request.author);
  const comments = openComments(
    doc,
    { name: rev.author, initials: initialsFor(rev.author) },
    rev.date,
  );

  /**
   * Edits grouped by the part they splice into.
   *
   * ⚠️ Offsets are only meaningful against the part they were computed from, so a header
   * edit and a body edit must never be applied to the same string. Keying by part is what
   * makes "change the date in the footer and the title in the body" one call — and what
   * stops it from writing the footer's offsets into `document.xml`.
   */
  const byPart = new Map<DocPart, Edit[]>();
  const applied: string[] = [];
  const skipped: string[] = [];
  const context: OpContext = {
    doc,
    tracked,
    rev,
    comments,
    label: '',
    claimed: new Map(),
  };

  request.ops.forEach((op, index) => {
    // The label travels into every `Edit` so an overlap can name which two ops collided —
    // "op 2 and op 4" is actionable, "two changes overlap" is not.
    context.label = `op ${index + 1} (${String(op.op ?? '?')})`;
    try {
      const outcome = applyOp(op, context);
      const list = byPart.get(outcome.part) ?? [];
      list.push(...outcome.edits);
      byPart.set(outcome.part, list);
      applied.push(...outcome.summaries);
    } catch (e) {
      skipped.push(`${context.label}: ${describe(e)}`);
    }
  });

  // Counted, not `byPart.size`: an op can report a part and contribute no edits, and a call
  // that reported changes while writing none is the one failure mode the summary cannot be
  // trusted about.
  const totalEdits = [...byPart.values()].reduce((n, list) => n + list.length, 0);
  if (totalEdits === 0) {
    // No bytes change hands, so the engine skips the write and the backup entirely.
    return { bytes: loaded.bytes, applied: [], skipped };
  }

  const rewritten = new Map<DocPart, string>();
  for (const [part, edits] of byPart) {
    if (edits.length === 0) continue;
    try {
      rewritten.set(part, applyEdits(part.xml.source, edits));
    } catch (e) {
      // ⚠️ Nothing is staged until every part succeeds. A call that half-applied would
      // leave a document whose body says one thing and whose header says another, with no
      // record of which half landed.
      throw new DocumentError(
        `${describe(e)} Nothing was written — the file is unchanged. Send the conflicting ` +
          'changes in separate doc_edit calls.',
      );
    }
  }

  for (const [part, source] of rewritten) {
    doc.archive.setText(part.name, source);
  }
  comments.commit();

  return {
    bytes: doc.archive.save(),
    applied: [...applied, ...notes(doc, comments, tracked)],
    skipped,
  };
}

/**
 * Lines appended after the per-op summaries.
 *
 * Both exist so the agent's report to the user is not misleading. Telling someone "I made
 * 6 tracked changes" in a document that already carried 40 from their supervisor leaves
 * them unable to tell which are which, and claiming the changes are tracked when the call
 * ran in `direct` mode is the more dangerous half of the same problem.
 */
function notes(
  doc: DocxDocument,
  comments: CommentWriter,
  tracked: boolean,
): string[] {
  const lines: string[] = [];

  if (!tracked) {
    lines.push(
      'These edits were written directly, not as tracked changes, so the user cannot ' +
        'accept or reject them one by one. Say so when you report back.',
    );
  }

  const existing = countExistingRevisions(doc);
  if (existing > 0) {
    const others = existingAuthors(doc).filter((a) => a !== 'AI (Better Sidebar)');
    lines.push(
      `The document already contained ${existing} tracked changes` +
        (others.length > 0 ? ` from ${others.join(', ')}` : '') +
        ', so yours are mixed in with theirs.',
    );
  }

  if (comments.count > 0) {
    lines.push(
      `${comments.count} comment${comments.count === 1 ? '' : 's'} added. They appear in ` +
        "Word's review pane and change no text.",
    );
  }

  return lines;
}

function describe(e: unknown): string {
  if (e instanceof DocumentError || e instanceof XmlError) return e.message;
  return `unexpected failure — ${(e as Error)?.message ?? String(e)}`;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

interface OpContext {
  doc: DocxDocument;
  tracked: boolean;
  rev: Revisions;
  comments: CommentWriter;
  label: string;
  /** Paragraphs already changed at the properties level in this call. See `claim`. */
  claimed: Map<string, string>;
}

/**
 * Reserve a paragraph's *structure* for one op, refusing a second claim on it.
 *
 * ⚠️ This closes a hole `applyEdits` cannot see. Ops that work at the `w:pPr` level — a
 * whole-paragraph comment, a tracked delete, a style change — insert at the same offset in a
 * paragraph that has no `w:pPr` yet. Two zero-length insertions at one offset do not
 * *overlap*, so the overlap check passes, and the result can be a `w:commentRangeStart`
 * emitted ahead of the `w:pPr` the other op created. `w:pPr` must be the first child of
 * `w:p`, so that is a schema violation — and it is the kind Word reports as "unreadable
 * content", after a call that said it succeeded.
 *
 * Refusing is also the right answer on the merits: commenting on a paragraph while deleting
 * it, or restyling it while deleting it, are contradictory instructions.
 */
function claim(ctx: OpContext, id: string, what: string): void {
  const holder = ctx.claimed.get(id);
  if (holder) {
    throw new DocumentError(
      `${id} is already being changed by ${holder} in this call, so it cannot also be ` +
        `${what}. Put the two changes in separate doc_edit calls.`,
    );
  }
  ctx.claimed.set(id, ctx.label);
}

interface OpOutcome {
  /** The part these edits splice into. Every op touches exactly one. */
  part: DocPart;
  edits: Edit[];
  /** One line per change, phrased for the summary the user reads. */
  summaries: string[];
}

/** Every verb this handler understands, for the error message when one is misspelled. */
const OPS = [
  'replace_text',
  'set_text',
  'insert_paragraph',
  'delete_paragraph',
  'comment',
  'set_style',
  'insert_table',
  'delete_table',
  'insert_row',
  'delete_row',
] as const;

function applyOp(op: DocOp, ctx: OpContext): OpOutcome {
  switch (String(op.op ?? '').trim()) {
    case 'replace_text':
      return replaceText(op, ctx);
    case 'set_text':
      return setText(op, ctx);
    case 'insert_paragraph':
      return insertParagraph(op, ctx);
    case 'delete_paragraph':
      return deleteParagraph(op, ctx);
    case 'comment':
      return comment(op, ctx);
    case 'set_style':
      return setStyle(op, ctx);
    case 'insert_table':
      return insertTable(op, ctx);
    case 'delete_table':
      return deleteTable(op, ctx);
    case 'insert_row':
      return insertRow(op, ctx);
    case 'delete_row':
      return deleteRow(op, ctx);
    default:
      throw new DocumentError(
        `"${String(op.op ?? '')}" is not a Word document operation. ` +
          `Use one of: ${OPS.join(', ')}.`,
      );
  }
}

// ─── replace_text ────────────────────────────────────────────────────────────

/**
 * Rewrite a stretch of text, as a tracked change unless the call asked otherwise.
 *
 * An empty `new_text` is a deletion, not a missing parameter — the same convention
 * `edit_file` uses for `new_string`, and the natural way to say "cut this clause".
 */
function replaceText(op: DocOp, ctx: OpContext): OpOutcome {
  const oldText = required(op, 'old_text');
  const newText = optional(op, 'new_text') ?? '';
  const all = flag(op, 'all');

  const targets = locate(ctx.doc, {
    oldText,
    scope: optional(op, 'scope'),
    all,
    what: 'replace',
  });

  const part = onePart(targets.map((t) => t.block), ctx.label);
  const edits: Edit[] = [];
  const summaries: string[] = [];

  for (const target of targets) {
    edits.push(
      ...(ctx.tracked
        ? trackedReplaceEdits(target.flat, target.hit, newText, ctx.rev, ctx.label)
        : directReplaceEdits(part.xml, target.flat, target.hit, newText, ctx.label)),
    );
    summaries.push(
      newText === ''
        ? `${target.block.id}: deleted “${clip(oldText)}”`
        : `${target.block.id}: “${clip(oldText)}” → “${clip(newText)}”`,
    );
  }

  // Same text elsewhere in the package is worth one line: the agent asked to change a term
  // and would otherwise report success on a document whose running head still says the old
  // one. The advice differs per part, because the body is reached by *omitting* scope.
  const elsewhere = alsoInOtherParts(ctx.doc, oldText, part);
  if (elsewhere.length > 0) {
    const how = elsewhere
      .map((other) =>
        other.kind === 'body'
          ? 'the body (an op with no scope)'
          : `${other.label} (scope="${other.id}")`,
      )
      .join(', ');
    summaries.push(
      `“${clip(oldText)}” also appears in ${how} and was left alone — send another op if it ` +
        'should change there too.',
    );
  }

  // One line for a bulk rename instead of 50 near-identical ones, which would eat the
  // round's budget with no information in it.
  if (targets.length > 4) {
    return {
      part,
      edits,
      summaries: [
        `Replaced “${clip(oldText)}” with “${clip(newText)}” in ${targets.length} ` +
          `places (${targets.map((t) => t.block.id).slice(0, 8).join(', ')}` +
          `${targets.length > 8 ? ', …' : ''}).`,
        ...summaries.slice(targets.length),
      ],
    };
  }

  return { part, edits, summaries };
}

/**
 * Parts other than the one being edited that contain the same text.
 *
 * Reported, never edited. Silently widening a replacement to the header would be a
 * surprise; saying nothing leaves the agent claiming a term was renamed throughout a
 * document where the running head still carries the old one.
 */
function alsoInOtherParts(
  doc: DocxDocument,
  oldText: string,
  edited: DocPart,
): DocPart[] {
  return doc.parts.filter(
    (part) =>
      part !== edited &&
      doc.blocks.some(
        (b) =>
          b.part === part &&
          b.kind === 'paragraph' &&
          findInParagraph(flatten(b), oldText).length > 0,
      ),
  );
}

/**
 * The single part a set of blocks lives in.
 *
 * ⚠️ An `all: true` rename whose hits straddle the body and a header cannot be one op,
 * because its edits would be offsets into two different strings. Refusing is the honest
 * answer and names the fix; the alternative is applying one part's offsets to the other,
 * which corrupts the file.
 */
function onePart(blocks: Block[], label: string): DocPart {
  const first = blocks[0].part;
  const other = blocks.find((b) => b.part !== first);
  if (other) {
    const how = (part: DocPart) =>
      part.kind === 'body' ? 'no scope' : `scope="${part.id}"`;
    throw new DocumentError(
      `${label} spans ${first.label} and ${other.part.label}, which have to be changed in ` +
        `separate ops — one with ${how(first)} and one with ${how(other.part)}.`,
    );
  }
  return first;
}

// ─── set_text ────────────────────────────────────────────────────────────────

/**
 * Put text into an empty paragraph or an empty table cell.
 *
 * This is the op the address space existed for and the tools did not have. Filling in a
 * blank column of a checklist — "自查评估结果" against each row of "检查内容" — has no text
 * to quote, so every other op refused it, and the only expressible alternative was to
 * replace the neighbouring cell's text, which put the answer in the wrong column.
 *
 * ⚠️ **Refuses a target that already has text.** This is the one op addressed purely by an
 * id, and ids drift: a stale `p12` would overwrite a sentence with no quote to check it
 * against, which is the exact failure `old_text` addressing exists to prevent. Existing
 * text is `replace_text`'s job and it does it safely. Whitespace-only counts as empty,
 * because a cell holding a single space is blank to the user.
 */
function setText(op: DocOp, ctx: OpContext): OpOutcome {
  const scope = required(op, 'scope');
  const text = required(op, 'text');

  const target = resolveTarget(ctx.doc, scope);

  if (target.kind === 'row') {
    throw new DocumentError(
      `${target.row.id} is a whole row, and set_text writes one value. Name a cell ` +
        `(${target.row.cellIds.slice(0, 3).join(', ')}), or use insert_row with "cells" to ` +
        'fill a whole row at once.',
    );
  }

  const block =
    target.kind === 'cell' ? emptyParagraphOfCell(ctx.doc, target.cell) : target.block;

  if (block.kind !== 'paragraph') {
    throw new DocumentError(
      `${block.id} is a table. Name a cell (${block.id}r1c1) or a paragraph inside it.`,
    );
  }

  const flat = flatten(block);
  if (flat.text.trim() !== '') {
    throw new DocumentError(
      `${block.id} already contains “${clip(flat.text)}”. set_text only fills empty ` +
        'paragraphs and cells — use replace_text with old_text to change text that is ' +
        'already there.',
    );
  }

  // Structural: it inserts at the paragraph's content start, where a comment or a tracked
  // delete would also insert. Two zero-length insertions at one offset do not *overlap*, so
  // `applyEdits` would let both through and silently concatenate them.
  claim(ctx, block.id, 'filled in');

  const where = target.kind === 'cell' ? target.cell.id : block.id;

  return {
    part: block.part,
    edits: fillParagraphEdits(
      block,
      text,
      markRunProperties(block),
      ctx.rev,
      ctx.tracked,
      ctx.label,
    ),
    summaries: [`${where}: filled in “${clip(text)}”`],
  };
}

/**
 * The paragraph inside a cell that `set_text` should write into.
 *
 * A cell always holds at least one paragraph — Word refuses to open a file where one does
 * not. The empty one is the target; a cell with text in every paragraph is refused by the
 * caller's own check, which produces the better message.
 */
function emptyParagraphOfCell(doc: DocxDocument, cell: Cell): Block {
  const paragraphs = cellParagraphs(doc, cell);
  if (paragraphs.length === 0) {
    throw new DocumentError(
      `${cell.id} has no paragraph to write into, which means the file is malformed.`,
    );
  }
  return paragraphs.find((b) => flatten(b).text.trim() === '') ?? paragraphs[0];
}

// ─── insert_paragraph ────────────────────────────────────────────────────────

/**
 * Add a paragraph next to an existing one.
 *
 * Addressed by id rather than by quoted text, and it has to be: the address names a *gap*,
 * and a gap has no text to quote. (`set_text` is the other such op, for the same reason —
 * an empty cell has nothing to quote either.) The drift risk is real but bounded: the worst
 * outcome is a paragraph landing one place away, which the user sees immediately, as opposed
 * to a replacement silently rewriting the wrong sentence.
 *
 * Run properties are inherited from the anchor paragraph so the new text arrives in the
 * document's own font rather than Word's default. For a CJK document that is not cosmetic:
 * the East Asian typeface lives in the run properties, and a paragraph without them
 * renders in a fallback font that is obvious on the page.
 */
function insertParagraph(op: DocOp, ctx: OpContext): OpOutcome {
  const text = required(op, 'text');
  const afterId = optional(op, 'after');
  const beforeId = optional(op, 'before');

  if (!afterId && !beforeId) {
    throw new DocumentError(
      'insert_paragraph needs "after" or "before" naming a paragraph id, e.g. after="p12".',
    );
  }
  if (afterId && beforeId) {
    throw new DocumentError(
      'insert_paragraph takes "after" or "before", not both.',
    );
  }

  const anchor = resolveBlock(ctx.doc, (afterId ?? beforeId)!);
  const rPr = anchor.kind === 'paragraph' ? inheritedRPr(flatten(anchor)) : '';

  const xml = insertedParagraphXml(text, ctx.rev, {
    styleId: optional(op, 'style'),
    rPr,
    tracked: ctx.tracked,
  });

  const at = afterId ? anchor.el.outerEnd : anchor.el.outerStart;

  return {
    part: anchor.part,
    edits: [{ start: at, end: at, text: xml, label: ctx.label }],
    summaries: [
      `${afterId ? 'after' : 'before'} ${anchor.id}: inserted “${clip(text)}”`,
    ],
  };
}

/** The run properties to copy onto new text, or '' when the paragraph is empty. */
function inheritedRPr(flat: FlatParagraph): string {
  return flat.slices.length > 0 ? rPrAt(flat, flat.text.length - 1) : '';
}

// ─── delete_paragraph ────────────────────────────────────────────────────────

/**
 * Remove a whole paragraph.
 *
 * Addressed by `scope` (an id) or by `old_text` matching somewhere in it. Both are offered
 * because the two intents differ: "drop p47" comes from reading the outline, "drop the
 * paragraph that says X" comes from reading the text.
 *
 * ⚠️ In `direct` mode a paragraph inside a table keeps its shell. A table cell must contain
 * at least one paragraph — removing the last one produces a file Word refuses to open, and
 * an empty cell is what the user meant anyway.
 */
function deleteParagraph(op: DocOp, ctx: OpContext): OpOutcome {
  const scope = optional(op, 'scope');
  const oldText = optional(op, 'old_text');

  if (!scope && !oldText) {
    throw new DocumentError(
      'delete_paragraph needs "scope" (a paragraph id like "p47") or "old_text" from the ' +
        'paragraph to remove.',
    );
  }

  const targets = oldText
    ? locate(ctx.doc, { oldText, scope, all: flag(op, 'all'), what: 'delete' })
    : [wholeParagraph(resolveBlock(ctx.doc, scope!))];

  const part = onePart(targets.map((t) => t.block), ctx.label);
  const edits: Edit[] = [];
  const summaries: string[] = [];

  for (const target of targets) {
    claim(ctx, target.block.id, 'deleted');

    if (ctx.tracked) {
      edits.push(
        ...trackedDeleteParagraphEdits(target.block, target.flat, ctx.rev, ctx.label),
      );
    } else if (target.block.inTable) {
      edits.push({
        start: target.block.el.innerStart,
        end: target.block.el.innerEnd,
        text: '',
        label: ctx.label,
      });
    } else {
      edits.push({
        start: target.block.el.outerStart,
        end: target.block.el.outerEnd,
        text: '',
        label: ctx.label,
      });
    }

    const quoted = clip(target.flat.text);
    summaries.push(
      quoted === ''
        ? `${target.block.id}: deleted an empty paragraph`
        : `${target.block.id}: deleted the paragraph “${quoted}”`,
    );
  }

  return { part, edits, summaries };
}

// ─── comment ─────────────────────────────────────────────────────────────────

/**
 * Attach a margin comment, changing no text.
 *
 * `old_text` anchors it to an exact phrase; `scope` alone anchors it to the whole
 * paragraph. The paragraph form is the reliable fallback and is worth reaching for
 * deliberately: it works on a paragraph whose text runs through an image, an equation or a
 * citation field, where an exact-phrase anchor has to be refused.
 */
function comment(op: DocOp, ctx: OpContext): OpOutcome {
  const body = required(op, 'text');
  const scope = optional(op, 'scope');
  const oldText = optional(op, 'old_text');

  if (!scope && !oldText) {
    throw new DocumentError(
      'comment needs "old_text" (the phrase to attach it to) or "scope" (a paragraph id).',
    );
  }

  if (!oldText) {
    const block = resolveBlock(ctx.doc, scope!);
    if (block.kind !== 'paragraph') {
      throw new DocumentError(
        `${block.id} is a table. Comment on a paragraph inside it instead — doc_read with ` +
          `range="${block.id}" lists their ids.`,
      );
    }
    requireBody(block, 'comment on');
    // A whole-paragraph comment brackets the paragraph's content, so it is structural.
    claim(ctx, block.id, 'commented on as a whole');

    const id = ctx.comments.add(body);
    return {
      part: block.part,
      edits: commentOnParagraphEdits(block, id, ctx.label),
      summaries: [`${block.id}: commented on the paragraph — “${clip(body)}”`],
    };
  }

  const [target] = locate(ctx.doc, {
    oldText,
    scope,
    all: false,
    what: 'comment on',
  });
  requireBody(target.block, 'comment on');

  // ⚠️ Checked *before* staging the comment body. `commentOnTextEdits` refuses a range
  // spanning an image or a field, and a body staged for edits that then throw would be
  // written into comments.xml with nothing in the document pointing at it.
  const problem = checkEditable(target.flat, target.hit);
  if (problem) {
    throw new DocumentError(
      `Cannot anchor a comment there: ${problem}. Use scope="${target.block.id}" to ` +
        'comment on the whole paragraph instead.',
    );
  }

  const id = ctx.comments.add(body);
  return {
    part: target.block.part,
    edits: commentOnTextEdits(target.flat, target.hit, id, ctx.label),
    summaries: [`${target.block.id}: commented on “${clip(oldText)}” — “${clip(body)}”`],
  };
}

/**
 * Refuse an op that only works in the main document part.
 *
 * ⚠️ Comments are the case: `word/comments.xml` is related from the main part, and Word
 * shows nothing at all for a `w:commentReference` sitting in a header or a footnote. The
 * file opens, the tool reports success, and the comment does not exist as far as the user
 * can tell — the worst of the available failures, so it is refused up front.
 */
function requireBody(block: Block, what: string): void {
  if (block.part.kind !== 'body') {
    throw new DocumentError(
      `Word does not show comments in ${block.part.label}, so ${block.id} cannot be ` +
        `${what}. Change its text with replace_text, or comment on the body paragraph ` +
        'that refers to it.',
    );
  }
}

// ─── set_style ───────────────────────────────────────────────────────────────

/**
 * Change a paragraph's style — in practice, promote a line to a heading.
 *
 * The case this exists for: a thesis whose headings are direct bold-and-bigger formatting
 * rather than styles, so it has no navigable outline at all. `doc_read` says as much in its
 * warnings, and this is the fix.
 *
 * ⚠️ `style` is a style **id**, not the name shown in Word's gallery, and the two differ in
 * a localised document — Chinese Word writes ids like `2` for what it displays as `标题 2`.
 * An unknown id is refused rather than written, because Word silently falls back to Normal
 * and the result looks like the call did nothing.
 */
function setStyle(op: DocOp, ctx: OpContext): OpOutcome {
  const scope = required(op, 'scope');
  const styleId = required(op, 'style');
  const block = resolveBlock(ctx.doc, scope);

  if (block.kind !== 'paragraph') {
    throw new DocumentError(`${block.id} is a table; styles apply to paragraphs.`);
  }

  claim(ctx, block.id, 'restyled');

  if (ctx.doc.styles.size > 0 && !ctx.doc.styles.has(styleId)) {
    const headings = [...ctx.doc.styles.values()]
      .filter((s) => s.headingLevel !== null)
      .map((s) => s.id)
      .slice(0, 12);
    throw new DocumentError(
      `This document has no style with id "${styleId}". Heading style ids in it: ` +
        `${headings.join(', ') || 'none — it has no heading styles at all'}.`,
    );
  }

  return {
    part: block.part,
    edits: setStyleEdits(block, styleId, ctx.rev, ctx.tracked, ctx.label),
    summaries: [
      `${block.id}: style set to ${styleId}` +
        (block.styleId ? ` (was ${block.styleId})` : ''),
    ],
  };
}

// ─── Tables ──────────────────────────────────────────────────────────────────

/**
 * Insert a whole new table.
 *
 * Pure output — there is nothing in the document to preserve, which is what makes this the
 * one table op with no way to lose formatting. `rows` is a JSON array of arrays; the first
 * row is treated as a header unless `header: false`.
 */
function insertTable(op: DocOp, ctx: OpContext): OpOutcome {
  const rows = matrix(op, 'rows');
  const afterId = optional(op, 'after');
  const beforeId = optional(op, 'before');

  if (!afterId && !beforeId) {
    throw new DocumentError(
      'insert_table needs "after" or "before" naming a paragraph or table id, e.g. after="p12".',
    );
  }
  if (afterId && beforeId) {
    throw new DocumentError('insert_table takes "after" or "before", not both.');
  }

  const anchor = resolveBlock(ctx.doc, (afterId ?? beforeId)!);
  const styleId = optional(op, 'style');
  if (styleId && ctx.doc.styles.size > 0 && !ctx.doc.styles.has(styleId)) {
    throw new DocumentError(
      `This document has no style with id "${styleId}". Omit "style" to get a plain ` +
        'bordered table.',
    );
  }

  const xml = newTableXml(
    {
      rows,
      // Defaults to true: the first row of a table a model writes is a header far more often
      // than not, and a header row that repeats across pages is what makes a long table
      // readable.
      header: flagOr(op, 'header', true),
      styleId,
      tracked: ctx.tracked,
    },
    ctx.rev,
  );

  // ⚠️ Two adjacent tables are one table as far as Word is concerned, and a body may not end
  // with one. Both are silent — the file opens and is simply not the document we produced.
  const spacers = tableSpacers(anchor.part, anchor.el, Boolean(afterId));
  const at = afterId ? anchor.el.outerEnd : anchor.el.outerStart;

  return {
    part: anchor.part,
    edits: [
      { start: at, end: at, text: `${spacers.lead}${xml}${spacers.trail}`, label: ctx.label },
    ],
    summaries: [
      `${afterId ? 'after' : 'before'} ${anchor.id}: inserted a ${rows.length}×` +
        `${rows.reduce((max, row) => Math.max(max, row.length), 0)} table`,
    ],
  };
}

/**
 * Remove a whole table.
 *
 * ⚠️ In `track` mode this marks every row deleted rather than removing the element, so the
 * user can still reject it. All rows share one revision id — a table is one thing to accept.
 */
function deleteTable(op: DocOp, ctx: OpContext): OpOutcome {
  const block = resolveBlock(ctx.doc, required(op, 'scope'));
  if (block.kind !== 'table') {
    throw new DocumentError(
      `${block.id} is a paragraph, not a table. Use delete_paragraph for it.`,
    );
  }

  const rows = rowsOf(ctx.doc, block);
  claim(ctx, block.id, 'deleted');
  for (const row of rows) claim(ctx, row.id, 'deleted with its table');

  if (!ctx.tracked) {
    // Removing a table between two other tables would join them into one.
    const edit = wouldMergeNeighbours(block.part, block.el)
      ? { start: block.el.outerStart, end: block.el.outerEnd, text: '<w:p/>', label: ctx.label }
      : removeRowOrTable(block.el, ctx.label);
    return {
      part: block.part,
      edits: [edit],
      summaries: [`${block.id}: deleted the whole table (${rows.length} rows)`],
    };
  }

  const attrs = revisionAttrs(ctx.rev);
  const edits: Edit[] = [];
  for (const row of rows) edits.push(...rowDeletionEdits(ctx, row, attrs));

  return {
    part: block.part,
    edits,
    summaries: [`${block.id}: marked the whole table deleted (${rows.length} rows)`],
  };
}

/**
 * Add a row to an existing table, shaped like one that is already there.
 *
 * Anchored on a row (`after="t3r4"`), or on the table itself — in which case it goes at the
 * end, which is what "add another line to this checklist" means and is almost always a data
 * row rather than the header.
 */
function insertRow(op: DocOp, ctx: OpContext): OpOutcome {
  const afterId = optional(op, 'after');
  const beforeId = optional(op, 'before');
  const tableId = optional(op, 'table');

  if (afterId && beforeId) {
    throw new DocumentError('insert_row takes "after" or "before", not both.');
  }
  if (!afterId && !beforeId && !tableId) {
    throw new DocumentError(
      'insert_row needs "after" or "before" naming a row (e.g. after="t3r4"), or "table" ' +
        'naming a table to append to.',
    );
  }

  const { template, at } = rowAnchor(ctx.doc, { afterId, beforeId, tableId });
  const cells = cellsOfRow(ctx.doc, template);
  const text = list(op, 'cells');

  if (text.length > cells.length) {
    throw new DocumentError(
      `That row has ${cells.length} cells but "cells" has ${text.length} values. Extra ` +
        'values would have nowhere to go — a table\'s column count is fixed.',
    );
  }

  const xml = clonedRowXml(template, cells, text, ctx.rev, ctx.tracked);

  return {
    part: template.part,
    edits: [{ start: at, end: at, text: xml, label: ctx.label }],
    summaries: [
      `${template.tableId}: added a row ${afterId || tableId ? 'after' : 'before'} ` +
        `${template.id}` +
        (text.length > 0 ? ` — ${text.map((t) => `“${clip(t)}”`).join(', ')}` : ' (empty)'),
    ],
  };
}

/** Resolve where a new row goes, and which existing row it should be shaped like. */
function rowAnchor(
  doc: DocxDocument,
  request: { afterId?: string; beforeId?: string; tableId?: string },
): { template: Row; at: number } {
  if (request.tableId && !request.afterId && !request.beforeId) {
    const table = resolveBlock(doc, request.tableId);
    if (table.kind !== 'table') {
      throw new DocumentError(`${table.id} is not a table, so it has no rows.`);
    }
    const rows = rowsOf(doc, table);
    if (rows.length === 0) {
      throw new DocumentError(`${table.id} has no rows to copy the shape of.`);
    }
    const last = rows[rows.length - 1];
    return { template: last, at: last.el.outerEnd };
  }

  const target = resolveTarget(doc, (request.afterId ?? request.beforeId)!);
  if (target.kind !== 'row') {
    throw new DocumentError(
      `"${request.afterId ?? request.beforeId}" is not a row address. Rows are written ` +
        'like "t3r4" — read the table to see how many it has.',
    );
  }

  return {
    template: target.row,
    at: request.afterId ? target.row.el.outerEnd : target.row.el.outerStart,
  };
}

/** Remove one row. */
function deleteRow(op: DocOp, ctx: OpContext): OpOutcome {
  const scope = required(op, 'scope');
  const target = resolveTarget(ctx.doc, scope);
  if (target.kind !== 'row') {
    throw new DocumentError(
      `"${scope}" is not a row address. Rows are written like "t3r4".`,
    );
  }

  const row = target.row;
  const table = ctx.doc.byId.get(row.tableId);
  const siblings = table ? rowsOf(ctx.doc, table) : [];

  // ⚠️ A `w:tbl` with no `w:tr` is not a valid table and Word refuses to open the file.
  if (siblings.length <= 1) {
    throw new DocumentError(
      `${row.id} is the only row in ${row.tableId}, and a table cannot have none. Use ` +
        `delete_table with scope="${row.tableId}" instead.`,
    );
  }

  claim(ctx, row.id, 'deleted');

  if (!ctx.tracked) {
    return {
      part: row.part,
      edits: [removeRowOrTable(row.el, ctx.label)],
      summaries: [`${row.id}: deleted the row`],
    };
  }

  return {
    part: row.part,
    edits: rowDeletionEdits(ctx, row, revisionAttrs(ctx.rev)),
    summaries: [`${row.id}: marked the row deleted`],
  };
}

/**
 * A tracked row deletion: the row mark plus every paragraph in every cell.
 *
 * All three parts share `attrs`, so Word offers the row as a single Accept. Marking only the
 * row shows it struck through and then brings it back when the change is accepted.
 */
function rowDeletionEdits(ctx: OpContext, row: Row, attrs: string): Edit[] {
  const edits: Edit[] = [rowDeletionMark(row, attrs, ctx.label)];

  for (const cell of cellsOfRow(ctx.doc, row)) {
    for (const block of cellParagraphs(ctx.doc, cell)) {
      // Claimed because marking a paragraph deleted inserts at its properties position, the
      // same offset a comment or a `set_text` would use. Two zero-length insertions there do
      // not overlap, so `applyEdits` would accept both and concatenate them.
      claim(ctx, block.id, `deleted with ${row.id}`);
      edits.push(...deleteParagraphEdits(block, flatten(block), attrs, ctx.label));
    }
  }

  return edits;
}

// ─── Locating ────────────────────────────────────────────────────────────────

interface Target {
  block: Block;
  flat: FlatParagraph;
  hit: TextHit;
}

/**
 * Turn `old_text` (+ optional `scope`) into the ranges to act on.
 *
 * The three outcomes and why each is phrased the way it is:
 *
 * - **No match.** The likeliest cause is quoting from the model's own paraphrase rather
 *   than from the projection, so the message says to read the range again. Whitespace is
 *   already forgiven by `findInParagraph`, so a failure here is a real content mismatch.
 * - **One match.** Proceed.
 * - **Several matches.** Refused, with the ids listed. This is the check that stops the
 *   wrong sentence being edited, so the message offers the two legitimate ways forward —
 *   more surrounding words, or `scope` — and `all: true` only for a rename that really is
 *   meant to be global.
 */
function locate(
  doc: DocxDocument,
  request: { oldText: string; scope?: string; all: boolean; what: string },
): Target[] {
  if (request.oldText.trim() === '') {
    throw new DocumentError('"old_text" is empty, so there is nothing to find.');
  }

  // ⚠️ Body only when no scope is given. Widening the default to headers and footnotes
  // would turn a term that appears in the body *and* in the running head into "2 matches,
  // refused" — an ambiguity no amount of extra context can resolve, because the two really
  // are the same sentence. Other parts are reachable by naming them in `scope`, and
  // `alsoOutsideBody` makes sure they are never silently forgotten.
  const candidates: Block[] = request.scope
    ? scopeParagraphs(doc, request.scope)
    : doc.bodyBlocks.filter((b) => b.kind === 'paragraph');

  const found: Target[] = [];
  for (const block of candidates) {
    const flat = flatten(block);
    for (const hit of findInParagraph(flat, request.oldText)) {
      found.push({ block, flat, hit });
    }
  }

  if (found.length === 0) {
    const where = request.scope ? ` in ${request.scope}` : '';
    const hint = request.scope
      ? ''
      : outsideBodyHint(doc, request.oldText);
    throw new DocumentError(
      `Nothing${where} matches “${clip(request.oldText)}”.${hint} Re-read that range with ` +
        'doc_read and copy the text from the output — spacing is forgiven, wording is not.',
    );
  }

  if (found.length > 1 && !request.all) {
    // A cell address disambiguates far better than the paragraph id inside it: "t3r2c1 and
    // t3r3c1" tells the agent it is looking at two rows of one column, where "p41 and p47"
    // tells it nothing it can act on.
    const ids = [...new Set(found.map((t) => t.block.cellId ?? t.block.id))];
    throw new DocumentError(
      `“${clip(request.oldText)}” appears ${found.length} times (${ids.slice(0, 10).join(', ')}` +
        `${ids.length > 10 ? ', …' : ''}), so it is not safe to ${request.what} one of them. ` +
        'Add surrounding words until the quote is unique, or pass scope to pick one — a ' +
        'paragraph ("p12"), a table cell ("t3r2c1") or a table ("t3"). Only use all=true ' +
        'when every occurrence really should change.',
    );
  }

  if (found.length > MAX_BULK_HITS) {
    throw new DocumentError(
      `“${clip(request.oldText)}” appears ${found.length} times, past the ${MAX_BULK_HITS} ` +
        'limit for one call. That many hits usually means the quote is too short to be ' +
        'the thing you meant.',
    );
  }

  return found;
}

/**
 * The paragraphs a `scope` names.
 *
 * A table id expands to the paragraphs inside it, which is what "replace this in t3" has
 * to mean — the text of a table lives in its cells' paragraphs, and refusing the id would
 * leave a results table unaddressable.
 */
function scopeParagraphs(doc: DocxDocument, scope: string): Block[] {
  const trimmed = scope.trim().toLowerCase();

  // A bare part id — `hd1`, `fn` — means "everywhere in that part". This is how a header or
  // a footnote is edited at all, since its paragraphs are not in the default search set.
  const part = doc.parts.find((p) => p.id === trimmed && p.kind !== 'body');
  if (part) {
    const inside = doc.blocks.filter((b) => b.part === part && b.kind === 'paragraph');
    if (inside.length === 0) {
      throw new DocumentError(`${part.label} has no text in it.`);
    }
    return inside;
  }

  const target = resolveTarget(doc, scope);

  if (target.kind === 'cell') {
    const inside = cellParagraphs(doc, target.cell);
    if (inside.length === 0) {
      throw new DocumentError(`${target.cell.id} has no paragraph in it.`);
    }
    return inside;
  }

  // A row scope is "this line of the table", which is how a value is disambiguated when the
  // same word appears in several rows of one column.
  if (target.kind === 'row') {
    const inside = cellsOfRow(doc, target.row).flatMap((cell) => cellParagraphs(doc, cell));
    if (inside.length === 0) {
      throw new DocumentError(`${target.row.id} has no text in it.`);
    }
    return inside;
  }

  if (target.block.kind === 'paragraph') return [target.block];

  // A table id expands to the paragraphs inside it, which is what "replace this in t3" has
  // to mean — the text of a table lives in its cells' paragraphs. Comparing offsets is safe
  // here because a table and its contents are always in the same part.
  const inside = doc.blocks.filter(
    (b) =>
      b.part === target.block.part &&
      b.kind === 'paragraph' &&
      b.el.outerStart > target.block.el.outerStart &&
      b.el.outerEnd < target.block.el.outerEnd,
  );
  if (inside.length === 0) {
    throw new DocumentError(`${target.block.id} has no text in it.`);
  }
  return inside;
}

/**
 * A note naming the parts that *do* contain text the body does not.
 *
 * The failure this exists for: the user asks to change a date that lives in the page
 * header. Before, the body search found nothing and the agent concluded the date was not in
 * the document — a confident wrong answer. Naming the part turns that into a second call
 * that works.
 */
function outsideBodyHint(doc: DocxDocument, oldText: string): string {
  const parts = new Set<string>();

  for (const block of doc.blocks) {
    if (block.part.kind === 'body' || block.kind !== 'paragraph') continue;
    if (findInParagraph(flatten(block), oldText).length === 0) continue;
    parts.add(`${block.part.id} (${block.part.label})`);
  }

  if (parts.size === 0) return '';
  return ` It is in ${[...parts].join(', ')} — pass scope="${[...parts][0].split(' ')[0]}".`;
}

/** A target covering a whole paragraph, for the ops addressed by id alone. */
function wholeParagraph(block: Block): Target {
  if (block.kind !== 'paragraph') {
    throw new DocumentError(`${block.id} is a table, not a paragraph.`);
  }
  const flat = flatten(block);
  return { block, flat, hit: { start: 0, end: flat.text.length } };
}

// ─── Parameters ──────────────────────────────────────────────────────────────

/**
 * Read a string parameter off an op.
 *
 * Values arrive as JSON the model wrote, so a number or a boolean where a string was
 * expected is routine and coercing is kinder than refusing. `null` and `undefined` both
 * mean absent.
 */
function optional(op: DocOp, key: string): string | undefined {
  const value = op[key];
  if (value == null) return undefined;
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new DocumentError(
    `"${key}" must be text, but it arrived as ${Array.isArray(value) ? 'a list' : typeof value}.`,
  );
}

function required(op: DocOp, key: string): string {
  const value = optional(op, key);
  if (value === undefined) {
    throw new DocumentError(`"${String(op.op)}" needs a "${key}" value.`);
  }
  return value;
}

/** A boolean the model may have written as `true`, `"true"`, `"yes"` or `1`. */
function flag(op: DocOp, key: string): boolean {
  const value = op[key];
  if (typeof value === 'boolean') return value;
  if (value == null) return false;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

/** The same, for a flag whose absence means something other than false. */
function flagOr(op: DocOp, key: string, fallback: boolean): boolean {
  return op[key] == null || op[key] === '' ? fallback : flag(op, key);
}

/**
 * A list of strings, for the ops that take cell values.
 *
 * The whole `ops` payload arrives through one `JSON.parse`, so a nested array survives as a
 * real array — no second parse. A single string is accepted as a one-element list, and
 * numbers are stringified: a model filling a column of counts writes `[1, 2, 3]`, and
 * refusing that would be pedantry with a round's cost attached.
 */
function list(op: DocOp, key: string): string[] {
  const value = op[key];
  if (value == null) return [];
  if (typeof value === 'string') return value === '' ? [] : [value];
  if (!Array.isArray(value)) {
    throw new DocumentError(`"${key}" must be a list of values, e.g. ["1","ok",""].`);
  }
  return value.map((entry) => cellValue(entry, key));
}

/** A list of rows of strings, for `insert_table`. */
function matrix(op: DocOp, key: string): string[][] {
  const value = op[key];
  if (!Array.isArray(value) || value.length === 0) {
    throw new DocumentError(
      `"${key}" must be a non-empty array of arrays — one inner array per row, e.g. ` +
        '[["Item","Result"],["A",""]].',
    );
  }

  return value.map((row, index) => {
    if (!Array.isArray(row)) {
      // A flat array of strings is a plausible mistake with an ambiguous meaning — one row,
      // or one column? Refusing and saying so costs less than guessing wrong.
      throw new DocumentError(
        `Row ${index + 1} of "${key}" is not an array. Every row must be its own array, ` +
          'even a single-column one: [["a"],["b"]].',
      );
    }
    return row.map((entry) => cellValue(entry, key));
  });
}

function cellValue(entry: unknown, key: string): string {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry);
  throw new DocumentError(
    `"${key}" may only contain text, numbers or empty values — not ` +
      `${Array.isArray(entry) ? 'a nested list' : 'an object'}.`,
  );
}

/** A short, single-line quote of some text, for the summary lines. */
function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET ? `${flat.slice(0, SNIPPET)}…` : flat;
}
