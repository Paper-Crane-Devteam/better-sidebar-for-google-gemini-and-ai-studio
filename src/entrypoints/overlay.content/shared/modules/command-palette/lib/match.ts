/**
 * Scoring for the command palette's single search box.
 *
 * Substring only, deliberately. An earlier version fell back to subsequence
 * matching — every query character present in order, gaps allowed — which sounds
 * generous and behaves like a broken filter:
 *
 * - CJK titles have no word boundaries, so a two-character query matches almost
 *   any title long enough to contain both characters somewhere.
 * - Every row is highlighted now, and a subsequence hit highlights nothing. A row
 *   with no visible reason for being in the list is worse than a missing row.
 *
 * Higher score = better match. `null` means "no match at all".
 */
export function scoreMatch(text: string, query: string): number | null {
  if (!query) return 0;
  if (!text) return null;

  const haystack = text.toLowerCase();
  const index = haystack.indexOf(query.toLowerCase());
  if (index === -1) return null;
  if (index === 0) return 1000 - Math.min(haystack.length, 200);

  // Matching right after a separator reads as a word start, which is a stronger
  // signal than landing in the middle of one.
  const atWordStart = /[\s\-_/·,.:;([{"'|]/.test(haystack[index - 1]);
  return (atWordStart ? 700 : 500) - Math.min(index, 200);
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
