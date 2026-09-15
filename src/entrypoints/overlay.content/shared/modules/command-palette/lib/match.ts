/**
 * Scoring for the command palette's single search box.
 *
 * Kept deliberately small: substring first, subsequence as a fallback. A real
 * fuzzy library would buy little here — the haystacks are chat titles and a
 * fixed list of commands, and CJK titles have no word boundaries for a
 * camel-case/initialism scorer to exploit anyway.
 *
 * Higher score = better match. `null` means "no match at all".
 */
export function scoreMatch(text: string, query: string): number | null {
  if (!query) return 0;
  if (!text) return null;

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  const index = haystack.indexOf(needle);
  if (index === 0) return 1000 - Math.min(haystack.length, 200);
  if (index > 0) {
    // Matching right after a separator reads as a word start, which is a
    // stronger signal than landing in the middle of one.
    const prev = haystack[index - 1];
    const atWordStart = /[\s\-_/·,.:;([{"'|]/.test(prev);
    return (atWordStart ? 700 : 500) - Math.min(index, 200);
  }

  // Subsequence: every query character appears in order, gaps allowed.
  let cursor = 0;
  let gaps = 0;
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    gaps += found - cursor;
    cursor = found + 1;
  }
  return Math.max(1, 200 - gaps);
}

/**
 * Best score across several haystacks, with a weight per haystack so a hit in
 * the title outranks a hit in a tag or description.
 */
export function scoreFields(
  fields: { text: string | null | undefined; weight: number }[],
  query: string,
): number | null {
  if (!query) return 0;

  let best: number | null = null;
  for (const field of fields) {
    if (!field.text) continue;
    const score = scoreMatch(field.text, query);
    if (score === null) continue;
    const weighted = score * field.weight;
    if (best === null || weighted > best) best = weighted;
  }
  return best;
}
