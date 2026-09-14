/**
 * Tracked changes — why an edit to someone's thesis is a suggestion, not a rewrite.
 *
 * ## The reason this module exists at all
 *
 * Nobody proofreads a document their AI rewrote. If `doc_edit` overwrote the text, the
 * user's only options would be to trust it completely or to re-read 30 pages — and they
 * will pick trusting it. So the default is `w:ins` / `w:del`: Word shows every change
 * inline, attributed, with Accept and Reject on each one. The user reviews in the tool
 * they already use, at the granularity they already understand.
 *
 * That is a product decision, and it is the reason `mode: 'direct'` has to be asked for
 * explicitly rather than being the shorter path.
 *
 * ## What a tracked change actually is
 *
 * Deleted text stays in the file. It moves inside `<w:del>` and its `<w:t>` becomes
 * `<w:delText>`; new text goes inside `<w:ins>` as ordinary runs. Rejecting is Word
 * unwrapping the `w:del`, accepting is Word dropping it. Nothing is destroyed either way,
 * which is exactly the property that makes this safe to do automatically.
 *
 * ⚠️ A paragraph that is inserted or deleted as a whole needs its **paragraph mark**
 * marked too — `<w:pPr><w:rPr><w:ins/></w:rPr></w:pPr>`. Without it Word shows the text as
 * inserted but treats the paragraph break as pre-existing, so accepting the change leaves
 * a stray empty paragraph and rejecting it leaves two paragraphs merged. It looks like a
 * cosmetic detail and is the difference between an edit that round-trips and one that does
 * not.
 */

import {
  type Edit,
  type ElementRange,
  type XmlPart,
  attr,
  appendChild,
  childElements,
  elements,
  escapeXml,
  insertBefore,
  replaceElement,
} from '../ooxml/xml-cursor';
import {
  type FlatParagraph,
  type TextHit,
  replaceTextEdits,
  rPrAt,
  runXml,
  splitRunsAt,
} from '../ooxml/runs';
import { ownChild, type Block, type DocxDocument } from './model';

/** Shown as the change's author in Word's review pane. */
export const DEFAULT_AUTHOR = 'AI (Better Sidebar)';

/**
 * Author, timestamp and an id source, shared by every change in one `doc_edit` call.
 *
 * One timestamp for the whole call is deliberate: Word groups changes made "at the same
 * time" in its review pane, and a batch of edits the agent made in one step *is* one
 * action from the user's point of view.
 */
export interface Revisions {
  author: string;
  date: string;
  next(): number;
}

/**
 * Start numbering above every id already in the document.
 *
 * ⚠️ Scans for **any** `w:id` rather than only the ones on `w:ins` / `w:del`. Bookmarks,
 * comment ranges and `w:pPrChange` all use the same attribute name, and a revision id
 * that collides with a bookmark id is the kind of thing Word repairs silently — meaning
 * the user is told their file was damaged, by us, for nothing. Overshooting costs zero.
 */
export function openRevisions(doc: DocxDocument, author?: string): Revisions {
  let highest = 0;
  // ⚠️ Across **every** part, not just the body. Revision ids are package-wide as far as
  // Word's review pane is concerned, and a header edit numbered from 1 collides with the
  // body's bookmarks — which Word "repairs" silently, telling the user we damaged their file.
  for (const part of doc.parts) {
    const pattern = /\sw:id\s*=\s*"(\d+)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(part.xml.source)) !== null) {
      const value = Number(match[1]);
      if (value > highest) highest = value;
    }
  }

  let cursor = highest;
  return {
    author: (author ?? '').trim() || DEFAULT_AUTHOR,
    // Second precision, no milliseconds: that is the form Word writes, and some readers
    // are strict about the lexical shape of `xsd:dateTime` here.
    date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    next: () => ++cursor,
  };
}

/**
 * `w:id="7" w:author="…" w:date="…"` — the attribute trio every revision carries.
 *
 * ⚠️ **One call per logical change, not per element.** A revision id identifies a change,
 * and Word groups `w:ins` / `w:del` elements that share one. Since a single replaced
 * sentence routinely spans three or four runs, allocating an id inside the per-run loop
 * would turn one correction into four separate revisions — the user then has to click
 * Accept four times for something they read as one edit, and rejecting only some of them
 * leaves a half-applied sentence. So callers take the attributes once and reuse the string.
 */
export function revisionAttrs(rev: Revisions): string {
  return `w:id="${rev.next()}" w:author="${escapeXml(rev.author)}" w:date="${rev.date}"`;
}

// ─── Replacing text ──────────────────────────────────────────────────────────

/**
 * Rewrite a text range as an insertion beside a deletion.
 *
 * One `Edit` per touched run, never a single splice across the span — the material
 * *between* runs (`w:bookmarkStart`, `w:commentRangeStart`, `w:proofErr`) belongs to no
 * run, and a span replacement would take it with it. Bookmarks are how a table of
 * contents, every cross-reference and every Zotero citation find their target.
 *
 * The new text is placed **before** the deleted text and inherits the run properties at
 * the start of the range. Order matters for how the change reads in Word: "new (old
 * struck through)" is how a human marks up a correction, and it is what Word's own
 * "Show changes inline" produces.
 */
export function trackedReplaceEdits(
  flat: FlatParagraph,
  hit: TextHit,
  replacement: string,
  rev: Revisions,
  label?: string,
): Edit[] {
  const splits = splitRunsAt(flat, hit);
  const insertionRPr = rPrAt(flat, hit.start);

  // Two ids for the whole replacement — one for the insertion, one shared by every
  // `w:del` it spans. See `revisionAttrs`.
  const insAttrs = revisionAttrs(rev);
  const delAttrs = revisionAttrs(rev);

  return splits.map((split, index) => {
    const rPr = split.slice.rPr;
    let xml = runXml(split.before, rPr);

    if (index === 0 && replacement !== '') {
      xml += `<w:ins ${insAttrs}>${runXml(replacement, insertionRPr)}</w:ins>`;
    }

    xml += `<w:del ${delAttrs}>${runXml(split.inside, rPr, 'w:delText')}</w:del>`;
    xml += runXml(split.after, rPr);

    // Everything this run held is now expressed by `xml`, so replacing the run element
    // (not its `w:t`) is what lets the deleted half be wrapped.
    return replaceElement(split.slice.run, xml, label);
  });
}

/** The same replacement, applied outright. Only when the caller asked for `direct`. */
export function directReplaceEdits(
  part: XmlPart,
  flat: FlatParagraph,
  hit: TextHit,
  replacement: string,
  label?: string,
): Edit[] {
  return replaceTextEdits(part, flat, hit, replacement, label);
}

// ─── Whole paragraphs ────────────────────────────────────────────────────────

/**
 * A new paragraph, marked as inserted.
 *
 * The `w:rPr/w:ins` inside `w:pPr` is the paragraph mark's own revision — see the header
 * for why leaving it out breaks Accept and Reject rather than merely looking untidy.
 *
 * `rPr` is the run formatting to copy from the neighbouring paragraph. Inheriting it is
 * what keeps an inserted sentence in the document's own font instead of Word's default,
 * and it is also what makes CJK text come out right: the East Asian font lives in
 * `w:rFonts/@w:eastAsia`, and carrying the whole `w:rPr` over carries that with it.
 */
export function insertedParagraphXml(
  text: string,
  rev: Revisions,
  options: { styleId?: string; rPr?: string; tracked: boolean },
): string {
  const style = options.styleId
    ? `<w:pStyle w:val="${escapeXml(options.styleId)}"/>`
    : '';

  if (!options.tracked) {
    const pPr = style ? `<w:pPr>${style}</w:pPr>` : '';
    return `<w:p>${pPr}${runXml(text, options.rPr ?? '')}</w:p>`;
  }

  // One id for the paragraph mark and its content: inserting a paragraph is one change,
  // and splitting it in two lets the user accept the text while rejecting the break.
  const attrs = revisionAttrs(rev);
  const pPr = `<w:pPr>${style}<w:rPr><w:ins ${attrs}/></w:rPr></w:pPr>`;
  const body = `<w:ins ${attrs}>${runXml(text, options.rPr ?? '')}</w:ins>`;
  return `<w:p>${pPr}${body}</w:p>`;
}

/**
 * Delete a whole paragraph as a tracked change.
 *
 * Two halves, and both are required: every run's text becomes `w:delText` inside a
 * `w:del`, and the paragraph mark is marked deleted so that accepting the change actually
 * closes the paragraph up rather than leaving a blank line behind.
 *
 * ⚠️ A paragraph with no runs at all (an empty line) still gets its mark marked, which is
 * the entire change — that is how you delete a blank paragraph, and skipping it because
 * "there is no text" is why an empty line is the one thing an editor cannot remove.
 */
export function trackedDeleteParagraphEdits(
  block: Block,
  flat: FlatParagraph,
  rev: Revisions,
  label?: string,
): Edit[] {
  // One id for the whole paragraph, its runs and its mark alike: this is one deletion, and
  // Word must offer it as one Accept.
  return deleteParagraphEdits(block, flat, revisionAttrs(rev), label);
}

/**
 * The same, against a revision id the caller already allocated.
 *
 * ⚠️ Exists so that deleting a **row** — which is a dozen paragraphs across a dozen cells —
 * is one revision rather than a dozen. Allocating an id per paragraph would make the user
 * click Accept once per cell, and let them accept half a row, which leaves the table with a
 * row that is partly gone.
 */
export function deleteParagraphEdits(
  block: Block,
  flat: FlatParagraph,
  attrs: string,
  label?: string,
): Edit[] {
  const edits: Edit[] = [];

  for (const slice of flat.slices) {
    // An opaque run holds a drawing or a field, which cannot become `w:delText`. Leaving
    // it in place is the honest outcome: the text around it is struck through and the
    // image stays, which the user can see and finish by hand.
    if (slice.opaque || !slice.textEl) continue;
    const text = flat.text.slice(slice.from, slice.to);
    edits.push(
      replaceElement(
        slice.run,
        `<w:del ${attrs}>${runXml(text, slice.rPr, 'w:delText')}</w:del>`,
        label,
      ),
    );
  }

  edits.push(markParagraphMark(block, `<w:del ${attrs}/>`, label));
  return edits;
}

// ─── Filling an empty paragraph ──────────────────────────────────────────────

/**
 * Put text into a paragraph that has none — the op that was missing.
 *
 * Every other text edit is addressed by quoting the text it replaces, which is what makes
 * a wrong edit impossible to write. An empty cell has nothing to quote, so it was
 * unreachable: the blank "result" column of a checklist could not be filled, and the
 * agent's only expressible move was to replace the *neighbouring* cell's text and put the
 * answer in the wrong column.
 *
 * ⚠️ This is the one op addressed purely by id, so it is restricted to targets that are
 * genuinely empty (`docxEdit` checks). Writing over existing text by id would reintroduce
 * exactly the silent-wrong-paragraph failure that `old_text` addressing exists to prevent,
 * and `replace_text` already covers that case safely.
 */
export function fillParagraphEdits(
  block: Block,
  text: string,
  rPr: string,
  rev: Revisions,
  tracked: boolean,
  label?: string,
): Edit[] {
  const run = runXml(text, rPr);
  const body = tracked ? `<w:ins ${revisionAttrs(rev)}>${run}</w:ins>` : run;

  // ⚠️ An empty paragraph is very often written `<w:p/>`, and a self-closing element has no
  // inside — `innerStart` points *past* the `/>`. Inserting there would put the run between
  // two paragraphs: still balanced, still tokenisable, and rejected by Word as unreadable
  // content. The tag has to be expanded instead.
  if (block.el.selfClosing) {
    return [replaceElement(block.el, `<w:p>${body}</w:p>`, label)];
  }

  // After `w:pPr` when there is one, because `w:pPr` must stay the first child of `w:p`.
  const pPr = ownChild(block.part, block.el, 'w:pPr');
  const at = pPr ? pPr.outerEnd : block.el.innerStart;
  return [{ start: at, end: at, text: body, label }];
}

/**
 * Run properties for text being added to an empty paragraph.
 *
 * The paragraph mark's own `w:rPr` is the best available answer: it is the formatting Word
 * itself would apply to a character typed there, so a filled-in table cell comes out in the
 * same font and size as the rest of the column instead of in Word's default.
 *
 * ⚠️ `w:pPr/w:rPr` is `CT_ParaRPr`, not `CT_RPr`. It may carry `w:ins`, `w:del`,
 * `w:moveFrom`, `w:moveTo` and `w:rPrChange`, none of which are legal inside a run's
 * `w:rPr`. Copying it wholesale produces a schema violation — and since the file still
 * tokenises and still balances, nothing downstream catches it; Word reports the document as
 * damaged. Those five children are stripped.
 */
export function markRunProperties(block: Block): string {
  const part = block.part.xml;
  const pPr = ownChild(block.part, block.el, 'w:pPr');
  if (!pPr) return '';

  const rPr = ownChild(block.part, pPr, 'w:rPr');
  if (!rPr || rPr.selfClosing) return '';

  const kept = childElements(part, rPr)
    .filter((child) => !PARA_ONLY_RPR.has(child.name))
    .map((child) => part.source.slice(child.outerStart, child.outerEnd))
    .join('');

  return kept === '' ? '' : `<w:rPr>${kept}</w:rPr>`;
}

/** `CT_ParaRPr` children with no place in a run's `w:rPr`. See `markRunProperties`. */
const PARA_ONLY_RPR = new Set([
  'w:ins',
  'w:del',
  'w:moveFrom',
  'w:moveTo',
  'w:rPrChange',
]);

/**
 * Put a `w:ins` or `w:del` on the paragraph mark, creating the wrappers it needs.
 *
 * ⚠️ Element order inside `w:pPr` and `w:rPr` is not free — OOXML uses sequences, not
 * choices, and Word rejects a part whose children are out of order with "unreadable
 * content". Two orderings matter here:
 *
 * - inside `w:rPr` (the paragraph-mark flavour, `CT_ParaRPr`) the revision marks come
 *   **first**, before `w:rStyle` and everything else — so this inserts at the front.
 * - inside `w:pPr`, `w:rPr` comes late but still **before** `w:sectPr` — so a paragraph
 *   that ends a section needs the new `w:rPr` placed before it, not appended.
 */
function markParagraphMark(
  block: Block,
  markXml: string,
  label?: string,
): Edit {
  // ⚠️ An empty paragraph is written `<w:p/>`, and a self-closing element has no inside —
  // `innerStart` points *past* the `/>`. Inserting there puts the properties between two
  // paragraphs, which is invalid and is exactly the case that arises from "delete this blank
  // line". The tag has to be expanded.
  if (block.el.selfClosing) {
    return replaceElement(
      block.el,
      `<w:p><w:pPr><w:rPr>${markXml}</w:rPr></w:pPr></w:p>`,
      label,
    );
  }

  const pPr = ownChild(block.part, block.el, 'w:pPr');

  if (!pPr) {
    // `w:pPr` must be the first child of `w:p`, so the paragraph's content start is the
    // only legal place for it.
    return {
      start: block.el.innerStart,
      end: block.el.innerStart,
      text: `<w:pPr><w:rPr>${markXml}</w:rPr></w:pPr>`,
      label,
    };
  }

  const rPr = ownChild(block.part, pPr, 'w:rPr');
  if (rPr) {
    if (rPr.selfClosing) {
      return replaceElement(rPr, `<w:rPr>${markXml}</w:rPr>`, label);
    }
    return { start: rPr.innerStart, end: rPr.innerStart, text: markXml, label };
  }

  const sectPr = ownChild(block.part, pPr, 'w:sectPr');
  const wrapped = `<w:rPr>${markXml}</w:rPr>`;
  if (sectPr) return insertBefore(sectPr, wrapped, label);
  if (pPr.selfClosing) return replaceElement(pPr, `<w:pPr>${wrapped}</w:pPr>`, label);
  return appendChild(pPr, wrapped, label);
}

// ─── Paragraph properties ────────────────────────────────────────────────────

/**
 * Set a paragraph's style, recording the previous properties when tracking.
 *
 * `w:pPrChange` stores the pPr as it *was*, which is what lets Word offer Reject on a
 * style change at all. Building it means copying the old children **minus** `w:rPr` and
 * any earlier `w:pPrChange`: `CT_PPrBase` has neither, and including them is a schema
 * violation — the symptom is again "Word found unreadable content", on a change that
 * looked trivial.
 */
export function setStyleEdits(
  block: Block,
  styleId: string,
  rev: Revisions,
  tracked: boolean,
  label?: string,
): Edit[] {
  const part = block.part.xml;
  const pStyleXml = `<w:pStyle w:val="${escapeXml(styleId)}"/>`;
  const pPr = ownChild(block.part, block.el, 'w:pPr');

  if (!pPr) {
    const change = tracked
      ? `<w:pPrChange ${revisionAttrs(rev)}><w:pPr/></w:pPrChange>`
      : '';
    const properties = `<w:pPr>${pStyleXml}${change}</w:pPr>`;

    // Same self-closing trap as `markParagraphMark`: `<w:p/>` has no inside to insert into.
    if (block.el.selfClosing) {
      return [replaceElement(block.el, `<w:p>${properties}</w:p>`, label)];
    }

    return [
      {
        start: block.el.innerStart,
        end: block.el.innerStart,
        text: properties,
        label,
      },
    ];
  }

  const previous = tracked
    ? `<w:pPrChange ${revisionAttrs(rev)}><w:pPr>${basePPrChildren(part, pPr)}</w:pPr></w:pPrChange>`
    : '';

  // Rebuilding the whole `w:pPr` rather than splicing `w:pStyle` in place: `w:pStyle` is
  // the first child in the sequence and `w:pPrChange` the last, so a correct result needs
  // both ends moved anyway, and one replacement cannot collide with itself.
  const kept = childElements(part, pPr)
    .filter((child) => child.name !== 'w:pStyle' && child.name !== 'w:pPrChange')
    .map((child) => part.source.slice(child.outerStart, child.outerEnd))
    .join('');

  return [replaceElement(pPr, `<w:pPr>${pStyleXml}${kept}${previous}</w:pPr>`, label)];
}

/** A `w:pPr`'s children as they may appear inside `w:pPrChange`. See `setStyleEdits`. */
function basePPrChildren(part: XmlPart, pPr: ElementRange): string {
  return childElements(part, pPr)
    .filter((child) => child.name !== 'w:rPr' && child.name !== 'w:pPrChange')
    .map((child) => part.source.slice(child.outerStart, child.outerEnd))
    .join('');
}

// ─── Reporting ───────────────────────────────────────────────────────────────

/**
 * Whether the document already carried revisions before we touched it.
 *
 * The edit result says so when it does, because "I made 6 tracked changes" is misleading
 * in a file that already had 40 from the user's supervisor — they will open it, see 46,
 * and have no way to tell which are ours.
 */
export function countExistingRevisions(doc: DocxDocument): number {
  let total = 0;
  for (const part of doc.parts) {
    total += elements(part.xml, 'w:ins').length + elements(part.xml, 'w:del').length;
  }
  return total;
}

/** The `w:author` values already present, so the result can name whose changes they are. */
export function existingAuthors(doc: DocxDocument): string[] {
  const authors = new Set<string>();
  for (const part of doc.parts) {
    for (const name of ['w:ins', 'w:del'] as const) {
      for (const el of elements(part.xml, name)) {
        const author = attr(part.xml, el, 'w:author');
        if (author) authors.add(author);
      }
    }
  }
  return [...authors];
}
