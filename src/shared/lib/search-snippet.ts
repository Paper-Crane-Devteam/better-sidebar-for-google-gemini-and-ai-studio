/**
 * Builds the short previews shown under each search result.
 *
 * The list is narrow and clamped to a few visual lines, so the snippet has to be
 * made for that: markdown is flattened to plain prose first (raw newlines would
 * push the hit below the clamp and into the "…"), the hit sits near the start of
 * the snippet, and cut points land on word / grapheme boundaries so CJK text and
 * emoji don't get split mid-character.
 *
 * Highlights are computed once on the full text and clipped to each window, so
 * `^`, `$` and `\b` mean the same thing they meant when the DB matched.
 */

export interface SnippetPart {
  text: string;
  isMatch: boolean;
}

export interface SearchSnippets {
  /** One or more windows, each a run of plain / matched parts. */
  snippets: SnippetPart[][];
  /** Total hits in the message, capped at MATCH_LIMIT. */
  matchCount: number;
}

/** Context kept before a hit, in display width (CJK counts double). */
const BEFORE_WIDTH = 28;
/** Text kept after a hit. Generous: the CSS clamp trims what doesn't fit. */
const AFTER_CHARS = 220;
/** Preview length when there is no query. */
const PREVIEW_CHARS = 240;
/** Furthest a cut point may move to reach a word boundary. */
const MAX_SNAP = 16;
const MATCH_LIMIT = 999;
const ELLIPSIS = '…';

/**
 * Markdown → single-line plain text. Keeps the words, drops the syntax. Not a
 * parser — just enough that `**`, `#`, fences, link targets and table pipes stop
 * showing up in a two-line preview.
 */
export function flattenMarkdown(md: string): string {
  return (
    md
      // Fence lines go, their body stays.
      .replace(/^\s*(?:```|~~~)[^\n]*$/gm, ' ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      // Table separator rows and horizontal rules.
      .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|?)+\s*$/gm, ' ')
      .replace(/^\s*(?:[*_]\s*){3,}$/gm, ' ')
      // Table rows: pipes become spaces.
      .replace(/^\s*\|.*$/gm, (row) => row.replace(/\|/g, ' '))
      // List markers and task boxes.
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
      .replace(/(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/g, '$2')
      .replace(/(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])/g, '$1')
      .replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

let wordSegmenter: Intl.Segmenter | null | undefined;
function getSegmenter(): Intl.Segmenter | null {
  if (wordSegmenter === undefined) {
    wordSegmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'word' })
        : null;
  }
  return wordSegmenter;
}

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** Never cut between the two halves of a surrogate pair. */
function fixSurrogate(text: string, pos: number): number {
  if (pos > 0 && pos < text.length && isLowSurrogate(text.charCodeAt(pos))) {
    return pos - 1;
  }
  return pos;
}

/** Move `pos` back to the start of the word it falls in, if that word is short. */
function snapStart(text: string, pos: number): number {
  if (pos <= 0) return 0;
  const seg = getSegmenter();
  if (seg) {
    const from = Math.max(0, pos - MAX_SNAP);
    const local = text.slice(from, Math.min(text.length, pos + MAX_SNAP));
    const hit = seg.segment(local).containing(pos - from);
    // index 0 with from > 0: the word runs past the slice, so it's too long to snap to.
    if (hit && (hit.index > 0 || from === 0)) return from + hit.index;
  }
  return fixSurrogate(text, pos);
}

/** Move `pos` forward to the end of the word it falls in, if that word is short. */
function snapEnd(text: string, pos: number): number {
  if (pos >= text.length) return text.length;
  const seg = getSegmenter();
  if (seg) {
    const from = Math.max(0, pos - MAX_SNAP);
    const to = Math.min(text.length, pos + MAX_SNAP);
    const local = text.slice(from, to);
    const hit = seg.segment(local).containing(pos - from - 1);
    if (hit) {
      const end = from + hit.index + hit.segment.length;
      if (end < from + local.length || to === text.length) return end;
    }
  }
  return fixSurrogate(text, pos);
}

const charWidth = (code: number) => (code >= 0x2e80 ? 2 : 1);
const CJK_STOPS = '。！？；';
const LATIN_STOPS = '.!?;';

/**
 * Where the window should start for a hit at `index`: up to BEFORE_WIDTH back,
 * stopping early at a sentence boundary so the snippet starts on a clean clause.
 */
function findStart(text: string, index: number): { start: number; clean: boolean } {
  let width = 0;
  let i = index;
  while (i > 0) {
    const prev = text[i - 1];
    if (CJK_STOPS.includes(prev)) return { start: i, clean: true };
    if (prev === ' ' && i >= 2 && LATIN_STOPS.includes(text[i - 2])) {
      return { start: i, clean: true };
    }
    width += charWidth(text.charCodeAt(i - 1));
    if (width > BEFORE_WIDTH) break;
    i--;
  }
  if (i <= 0) return { start: 0, clean: true };
  let start = snapStart(text, i);
  // Don't start on the space after a word.
  while (start < index && text[start] === ' ') start++;
  return { start, clean: false };
}

function collectMatches(text: string, regex: RegExp): [number, number][] {
  const re = regex.global ? regex : new RegExp(regex.source, regex.flags + 'g');
  const ranges: [number, number][] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && ranges.length < MATCH_LIMIT) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

/** Render [start, end) of `text`, marking the parts covered by `ranges`. */
function sliceWithMatches(
  text: string,
  start: number,
  end: number,
  ranges: [number, number][],
  leading: boolean,
): SnippetPart[] {
  const parts: SnippetPart[] = [];
  const push = (s: string, isMatch: boolean) => {
    // Only the raw fallback still has newlines; the clamp needs one line of prose.
    const flat = s.replace(/\s+/g, ' ');
    if (flat) parts.push({ text: flat, isMatch });
  };
  if (leading) parts.push({ text: ELLIPSIS, isMatch: false });
  let cursor = start;
  for (const [ms, me] of ranges) {
    if (me <= start) continue;
    if (ms >= end) break;
    const s = Math.max(ms, start);
    const e = Math.min(me, end);
    if (s > cursor) push(text.slice(cursor, s), false);
    push(text.slice(s, e), true);
    cursor = e;
  }
  if (cursor < end) push(text.slice(cursor, end), false);
  if (end < text.length) parts.push({ text: ELLIPSIS, isMatch: false });
  return parts;
}

/**
 * Snippets for `content` around the hits of `regex`, or null when nothing in the
 * message matches (the DB matched something we can't see, e.g. a regex that only
 * hits across markdown syntax — the caller falls back to a plain preview).
 */
export function buildSearchSnippets(
  content: string,
  regex: RegExp,
  maxSnippets = 2,
): SearchSnippets | null {
  // Flattened first for readability; raw as a fallback for patterns that only
  // match the markdown source (a regex on `**`, a URL inside a link…).
  for (const text of [flattenMarkdown(content), content]) {
    const ranges = collectMatches(text, regex);
    if (ranges.length === 0) continue;

    const snippets: SnippetPart[][] = [];
    let windowEnd = -1;
    for (const [ms, me] of ranges) {
      if (snippets.length >= maxSnippets) break;
      if (ms < windowEnd) continue;
      const found = findStart(text, ms);
      // Never reach back into the previous window's text.
      const start = Math.max(found.start, windowEnd);
      const clean = found.clean && start === found.start;
      // Later windows get a shorter tail so two of them fit the same space.
      const tail = snippets.length === 0 ? AFTER_CHARS : AFTER_CHARS / 2;
      const end = snapEnd(text, Math.min(text.length, me + tail));
      snippets.push(sliceWithMatches(text, start, end, ranges, start > 0 && !clean));
      windowEnd = end;
    }
    return { snippets, matchCount: ranges.length };
  }
  return null;
}

/** Plain preview when there is no query or no visible hit. */
export function buildPlainPreview(content: string): string {
  const text = flattenMarkdown(content) || content.replace(/\s+/g, ' ').trim();
  if (text.length <= PREVIEW_CHARS) return text;
  return text.slice(0, snapEnd(text, PREVIEW_CHARS)) + ELLIPSIS;
}
