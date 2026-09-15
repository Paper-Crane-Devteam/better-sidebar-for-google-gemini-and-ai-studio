import type { HighlightSegment } from '../types';

/** Characters kept before the hit when excerpting a message body. */
const LEADING_CONTEXT = 30;
/** Characters kept after the hit. Longer, because that is where the answer is. */
const TRAILING_CONTEXT = 140;

/**
 * Splits `text` into alternating plain and matched runs.
 *
 * Plain `indexOf` rather than a regex: the query is raw user input, so a regex
 * would need escaping, and the palette has no whole-word or case-sensitive modes
 * to justify one. Every literal occurrence is marked, not just the first.
 *
 * A query that does not literally occur yields a single unmatched run, which is
 * the right answer for scorer hits that came from a subsequence rather than a
 * substring.
 */
export function highlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle || !text) return [{ text, match: false }];

  const haystack = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (;;) {
    const index = haystack.indexOf(needle, cursor);
    if (index === -1) break;
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), match: false });
    }
    segments.push({ text: text.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
  }

  if (segments.length === 0) return [{ text, match: false }];
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }
  return segments;
}

/**
 * Flattens a message body into one line.
 *
 * Markdown is left alone beyond whitespace collapsing — stripping syntax risks
 * eating the very characters the user searched for, and a single truncated line
 * hides most of the noise anyway.
 */
function toSingleLine(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

/**
 * Builds the one-line excerpt shown under a chat title for a message hit:
 * a window around the first occurrence, ellipsed on whichever side was cut.
 *
 * Returns `null` only for empty content.
 */
export function buildSnippet(
  content: string,
  query: string,
): HighlightSegment[] | null {
  const line = toSingleLine(content ?? '');
  if (!line) return null;

  const needle = query.trim().toLowerCase();
  const index = needle ? line.toLowerCase().indexOf(needle) : -1;

  if (index === -1) {
    // FTS matches on tokens, so a hit whose body has no literal occurrence is
    // normal (folded case, stemmed word, trigram overlap). Showing the opening
    // beats dropping a row the database considers relevant.
    const limit = LEADING_CONTEXT + TRAILING_CONTEXT;
    const head = line.slice(0, limit);
    return [{ text: line.length > limit ? `${head}…` : head, match: false }];
  }

  const start = Math.max(0, index - LEADING_CONTEXT);
  const end = Math.min(line.length, index + needle.length + TRAILING_CONTEXT);
  const excerpt =
    (start > 0 ? '…' : '') +
    line.slice(start, end) +
    (end < line.length ? '…' : '');

  return highlightSegments(excerpt, query);
}
