/**
 * Runs — the one genuinely hard part of editing a Word document.
 *
 * ## The problem
 *
 * Word does not store a paragraph as a string. It stores a sequence of `<w:r>` runs,
 * split at every point where *anything* changes: bold, language, a spell-check marker,
 * a rebuilt field, an old revision. A sentence the user sees as
 *
 *     本文提出了一种改进的方法
 *
 * can be six runs, split mid-word, with a `<w:proofErr>` and a `<w:bookmarkStart>`
 * between two of them. So searching `word/document.xml` for the sentence the user
 * quoted finds nothing, and any editor built on "find the text in the XML" silently
 * does nothing on real documents.
 *
 * ## The approach
 *
 *     paragraph → flatten to visible text + a map from text offset to run
 *              → match against the flattened text (this is where `old_text` works)
 *              → map the hit back onto runs: split the first, split the last,
 *                drop the ones fully inside
 *
 * ## Two rules that keep it safe
 *
 * ⚠️ **Edits are per-run, never a single splice across a run span.** The material
 * *between* runs — `w:bookmarkStart`, `w:commentRangeStart`, `w:proofErr` — is not part
 * of any run, and replacing the whole span would delete it. Bookmarks are how a table
 * of contents, a cross-reference and every Zotero citation find their target; losing
 * them is a broken document that still opens, which is the worst kind of damage.
 *
 * ⚠️ **Non-text run content becomes U+FFFC, not an empty string.** A drawing, a field
 * instruction or an embedded object occupies one position in the flattened text. If it
 * mapped to nothing, a match could silently span across an image and the replacement
 * would delete it. U+FFFC (OBJECT REPLACEMENT CHARACTER) cannot appear in text a model
 * writes, so it acts as a wall that no `old_text` can cross by accident.
 */

import {
  type ElementRange,
  type Edit,
  type XmlPart,
  attr,
  elementAt,
  element,
  escapeXml,
  replaceElement,
  removeElement,
  unescapeXml,
  XmlError,
} from './xml-cursor';

/** Stands in for run content that is not text. See the header. */
export const OBJECT_CHAR = '\uFFFC';

/** One run's contribution to a paragraph's flattened text. */
export interface RunSlice {
  /** The `<w:r>` element. */
  run: ElementRange;
  /** The `<w:t>` inside it, when it has one. Null for a tab, break or drawing. */
  textEl: ElementRange | null;
  /** `<w:rPr>…</w:rPr>` exactly as written, or '' when the run has no properties. */
  rPr: string;
  /** Inclusive start of this run's text in the paragraph's flattened text. */
  from: number;
  /** Exclusive end. */
  to: number;
  /** True when the content is a drawing/field/object rather than characters. */
  opaque: boolean;
}

export interface FlatParagraph {
  /** The `<w:p>` element this describes. */
  paragraph: ElementRange;
  /** What the user sees, as one string. Offsets into this are the edit addresses. */
  text: string;
  slices: RunSlice[];
  /** Set when the paragraph contains someone else's tracked deletions. */
  hasDeletions: boolean;
  /** Set when the paragraph contains field codes, whose results must not be edited. */
  hasFields: boolean;
}

/** Elements whose presence in a run maps to a single visible character. */
const CHAR_EQUIVALENT: Record<string, string> = {
  'w:tab': '\t',
  'w:br': '\n',
  'w:cr': '\n',
  'w:noBreakHyphen': '-',
  'w:softHyphen': '',
};

/** Run children that stand for something we must never edit through. */
const OPAQUE_ELEMENTS = new Set([
  'w:drawing',
  'w:pict',
  'w:object',
  'w:instrText',
  'w:delInstrText',
  'w:fldChar',
  'w:sym',
  'w:footnoteReference',
  'w:endnoteReference',
  'w:commentReference',
]);

/**
 * Flatten one paragraph into visible text plus an offset map.
 *
 * Walks tokens rather than using `elements(part, 'w:r', paragraph)` for one reason:
 * a run can contain a text box (`w:txbxContent`), which contains its own paragraphs,
 * which contain their own runs. Those belong to the inner paragraph, and treating them
 * as part of this one would produce offsets that map an edit into the wrong paragraph.
 * The walk skips any subtree under a nested `w:p`.
 *
 * Runs inside `w:del` are skipped too: that text is already deleted as far as the
 * reader is concerned, and it lives in `w:delText`, not `w:t`.
 */
export function flattenParagraph(
  part: XmlPart,
  paragraph: ElementRange,
): FlatParagraph {
  const slices: RunSlice[] = [];
  let text = '';
  let hasDeletions = false;
  let hasFields = false;

  /** Depth of a subtree we are ignoring, or -1 when we are not. */
  let skipBelow = -1;

  for (let i = paragraph.openIndex + 1; i < paragraph.closeIndex; i++) {
    const token = part.tokens[i];

    if (skipBelow !== -1) {
      // Leave the skipped subtree when its closing tag comes back up to its depth.
      if (token.kind === 'close' && token.depth === skipBelow) skipBelow = -1;
      continue;
    }

    if (token.kind !== 'open' && token.kind !== 'self') continue;

    if (token.name === 'w:p') {
      // A paragraph inside a text box. Not ours.
      skipBelow = token.depth;
      continue;
    }

    if (token.name === 'w:del') {
      hasDeletions = true;
      if (token.kind === 'open') skipBelow = token.depth;
      continue;
    }

    if (token.name !== 'w:r') continue;

    const run = elementAt(part, i);
    const slice = describeRun(part, run, text.length);
    if (slice.contribution !== '') {
      text += slice.contribution;
      slices.push(slice.slice);
      if (slice.slice.opaque) hasFields = hasFields || slice.isField;
    }

    // Skip the run's own subtree: its children were accounted for by `describeRun`,
    // and a nested `w:r` (which happens inside `w:ins` inside `w:r`) would otherwise
    // be counted twice.
    i = run.closeIndex;
  }

  return { paragraph, text, slices, hasDeletions, hasFields };
}

/** What one run contributes, and the slice that records it. */
function describeRun(
  part: XmlPart,
  run: ElementRange,
  offset: number,
): { slice: RunSlice; contribution: string; isField: boolean } {
  const rPrEl = element(part, 'w:rPr', run);
  // Only count `w:rPr` that belongs to this run, not one from a nested run.
  const rPr =
    rPrEl && rPrEl.depth === run.depth + 1
      ? part.source.slice(rPrEl.outerStart, rPrEl.outerEnd)
      : '';

  let contribution = '';
  let textEl: ElementRange | null = null;
  let opaque = false;
  let isField = false;

  for (let i = run.openIndex + 1; i < run.closeIndex; i++) {
    const token = part.tokens[i];
    if (token.kind !== 'open' && token.kind !== 'self') continue;
    if (token.depth !== run.depth + 1) continue;

    if (token.name === 'w:t') {
      const el = elementAt(part, i);
      // Multiple `w:t` in one run is legal but vanishingly rare; the first one is the
      // editable target and the rest are treated as opaque so nothing is silently lost.
      if (!textEl) {
        textEl = el;
        contribution += unescapeXml(part.source.slice(el.innerStart, el.innerEnd));
      } else {
        contribution += OBJECT_CHAR;
        opaque = true;
      }
      continue;
    }

    const asChar = CHAR_EQUIVALENT[token.name];
    if (asChar !== undefined) {
      contribution += asChar;
      continue;
    }

    if (OPAQUE_ELEMENTS.has(token.name)) {
      contribution += OBJECT_CHAR;
      opaque = true;
      if (token.name === 'w:instrText' || token.name === 'w:fldChar') isField = true;
    }
  }

  return {
    slice: {
      run,
      textEl,
      rPr,
      from: offset,
      to: offset + contribution.length,
      opaque,
    },
    contribution,
    isField,
  };
}

// ─── Locating ────────────────────────────────────────────────────────────────

export interface TextHit {
  /** Inclusive start in the flattened text. */
  start: number;
  /** Exclusive end. */
  end: number;
}

/**
 * Every occurrence of `needle` in a paragraph's flattened text.
 *
 * Literal matching, like `edit_file`'s `old_string` — not a regex. The agent quotes
 * text it read; a regex would make every bracket and dot in a citation a syntax
 * hazard, and there is no upside for the one thing this is used for.
 *
 * Whitespace is normalised on both sides before matching: Word's own line wrapping,
 * `w:tab`, and the newlines our own projection inserts mean the agent's copy of a
 * sentence rarely has byte-identical spacing. ⚠️ The returned offsets are still into
 * the *original* flattened text, because that is what the run map is keyed on — the
 * normalisation is a lens for matching, never a rewrite of the address space.
 */
export function findInParagraph(flat: FlatParagraph, needle: string): TextHit[] {
  if (needle === '') return [];

  const direct = findLiteral(flat.text, needle);
  if (direct.length > 0) return direct;

  return findNormalised(flat.text, needle);
}

function findLiteral(haystack: string, needle: string): TextHit[] {
  const hits: TextHit[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    hits.push({ start: at, end: at + needle.length });
    from = at + Math.max(1, needle.length);
  }
  return hits;
}

/**
 * Match with runs of whitespace treated as equivalent.
 *
 * Builds an index from each position in the collapsed string back to the original, so
 * a hit found in collapsed space can be reported in original coordinates.
 */
function findNormalised(haystack: string, needle: string): TextHit[] {
  const { collapsed, map } = collapseWhitespace(haystack);
  const target = collapseWhitespace(needle).collapsed.trim();
  if (target === '') return [];

  const hits: TextHit[] = [];
  let from = 0;
  for (;;) {
    const at = collapsed.indexOf(target, from);
    if (at === -1) break;
    const start = map[at];
    // `map` has one extra entry at the end so a match ending at the last character can
    // still name an exclusive end offset.
    const end = map[at + target.length];
    hits.push({ start, end });
    from = at + target.length;
  }
  return hits;
}

function collapseWhitespace(text: string): { collapsed: string; map: number[] } {
  let collapsed = '';
  const map: number[] = [];
  let inSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\u00a0') {
      if (inSpace) continue;
      inSpace = true;
      map.push(i);
      collapsed += ' ';
      continue;
    }
    inSpace = false;
    map.push(i);
    collapsed += ch;
  }

  map.push(text.length);
  return { collapsed, map };
}

/** The slices a text range touches, in document order. Empty when out of bounds. */
export function slicesIn(flat: FlatParagraph, hit: TextHit): RunSlice[] {
  return flat.slices.filter((s) => s.to > hit.start && s.from < hit.end);
}

/**
 * Whether a range can be edited as text.
 *
 * Refuses rather than mangles. A hit that includes a drawing or a field instruction
 * cannot be expressed as a text replacement, and the honest answer is to say which
 * thing is in the way so the agent can pick a smaller range.
 */
export function checkEditable(flat: FlatParagraph, hit: TextHit): string | null {
  const touched = slicesIn(flat, hit);
  if (touched.length === 0) return 'the range is outside this paragraph';

  for (const slice of touched) {
    if (slice.opaque) {
      return 'the selected text spans an image, field code or footnote reference';
    }
    if (!slice.textEl) {
      // A tab or line break inside the range. Editable in principle, but only by
      // dropping the element, which changes layout in a way the user did not ask for.
      return 'the selected text spans a tab or line break';
    }
  }
  return null;
}

// ─── Splitting ───────────────────────────────────────────────────────────────

/**
 * One run, cut into the part before the hit, the part inside it, and the part after.
 *
 * Text, not XML, because the three callers want different things wrapped around the
 * middle piece: a direct edit replaces it, a tracked edit wraps it in `w:del` and puts a
 * `w:ins` beside it, a comment leaves it alone and brackets it with range markers. What
 * they share is the arithmetic, and the arithmetic is where an off-by-one silently
 * deletes a character of someone's thesis.
 */
export interface RunSplit {
  slice: RunSlice;
  /** This run's text that falls before the hit. '' when the hit starts at the run. */
  before: string;
  /** This run's text inside the hit. Never '' — a touched run overlaps by definition. */
  inside: string;
  /** This run's text that falls after the hit. '' when the hit ends past the run. */
  after: string;
}

/**
 * Cut every run the hit touches at the hit's boundaries.
 *
 * ⚠️ Refuses the same cases `checkEditable` refuses, and for the same reason: a range
 * covering a drawing or a field cannot be expressed as text surgery, and pretending
 * otherwise deletes the drawing.
 *
 * For a hit spanning several runs, only the first can have a non-empty `before` and only
 * the last a non-empty `after` — the ones in between are wholly inside. Callers may rely
 * on that, but they do not have to: handling all three pieces on every split is uniform
 * and comes out correct for the single-run case too.
 */
export function splitRunsAt(flat: FlatParagraph, hit: TextHit): RunSplit[] {
  const problem = checkEditable(flat, hit);
  if (problem) throw new XmlError(`Cannot edit here: ${problem}.`);

  return slicesIn(flat, hit).map((slice) => {
    const start = Math.max(slice.from, hit.start);
    const end = Math.min(slice.to, hit.end);
    return {
      slice,
      before: flat.text.slice(slice.from, start),
      inside: flat.text.slice(start, end),
      after: flat.text.slice(end, slice.to),
    };
  });
}

// ─── Rewriting ───────────────────────────────────────────────────────────────

/**
 * A complete `<w:r>` carrying `text`, in either the normal or the deleted flavour.
 *
 * `w:delText` rather than `w:t` is the whole of what makes text "deleted" inside a
 * `w:del`: keeping `w:t` there produces a document Word opens and then shows the text as
 * still present, which is the failure that looks like the edit silently did nothing.
 *
 * ⚠️ Returns '' for empty text rather than an empty run. An empty run is not invalid, but
 * it carries run properties and shows up later as a phantom edit point — and every caller
 * here is splicing pieces together where "nothing" is a legitimate piece.
 *
 * ⚠️ `xml:space="preserve"` whenever the text has an edge space. Without it Word collapses
 * it away, which reads as "the AI joined two words together" and is the single most common
 * bug in generated docx.
 */
export function runXml(
  text: string,
  rPr = '',
  tag: 'w:t' | 'w:delText' = 'w:t',
): string {
  if (text === '') return '';
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<w:r>${rPr}<${tag}${preserve}>${escapeXml(text)}</${tag}></w:r>`;
}

/**
 * Replace a text range in place, keeping formatting.
 *
 * The new text inherits the run properties of the *first* run it lands in. That is a
 * choice, and it is the right one for the case this exists for: a sentence that starts
 * in body text and happens to include an italic term should come back as body text, not
 * inherit whichever formatting the last run had.
 *
 * Returns one `Edit` per affected run — see the header for why this is not one splice.
 */
export function replaceTextEdits(
  part: XmlPart,
  flat: FlatParagraph,
  hit: TextHit,
  replacement: string,
  label?: string,
): Edit[] {
  const problem = checkEditable(flat, hit);
  if (problem) throw new XmlError(`Cannot edit here: ${problem}.`);

  const touched = slicesIn(flat, hit);
  const edits: Edit[] = [];

  if (touched.length === 1) {
    const only = touched[0];
    const before = flat.text.slice(only.from, hit.start);
    const after = flat.text.slice(hit.end, only.to);
    edits.push(
      replaceElement(only.textEl!, textElementXml(part, only.textEl!, before + replacement + after), label),
    );
    return edits;
  }

  for (let i = 0; i < touched.length; i++) {
    const slice = touched[i];

    if (i === 0) {
      const before = flat.text.slice(slice.from, hit.start);
      edits.push(
        replaceElement(slice.textEl!, textElementXml(part, slice.textEl!, before + replacement), label),
      );
      continue;
    }

    if (i === touched.length - 1) {
      const after = flat.text.slice(hit.end, slice.to);
      if (after === '') {
        edits.push(removeElement(slice.run, label));
      } else {
        edits.push(replaceElement(slice.textEl!, textElementXml(part, slice.textEl!, after), label));
      }
      continue;
    }

    // Fully inside the replaced range. Remove the run, not its text: an empty run left
    // behind still carries its properties and shows up as a phantom edit point later.
    edits.push(removeElement(slice.run, label));
  }

  return edits;
}

/**
 * Rebuild a `<w:t>` with new content.
 *
 * ⚠️ `xml:space="preserve"` is set whenever the content has leading or trailing
 * whitespace. Without it Word applies XML whitespace collapsing and the space
 * disappears — which reads as "the AI joined two words together" and is one of the most
 * common bugs in generated docx.
 */
function textElementXml(part: XmlPart, textEl: ElementRange, content: string): string {
  const needsPreserve = /^\s|\s$/.test(content) || content === '';
  const existing = attr(part, textEl, 'xml:space');
  const preserve = needsPreserve || existing === 'preserve';
  const open = preserve ? '<w:t xml:space="preserve">' : '<w:t>';
  return `${open}${escapeXml(content)}</w:t>`;
}

/** The run properties at a text offset, for a caller building a new run there. */
export function rPrAt(flat: FlatParagraph, offset: number): string {
  for (const slice of flat.slices) {
    if (offset >= slice.from && offset < slice.to) return slice.rPr;
  }
  return flat.slices.length > 0 ? flat.slices[flat.slices.length - 1].rPr : '';
}
