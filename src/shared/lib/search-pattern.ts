/**
 * One place that turns a search query plus its toggles into a RegExp.
 *
 * The same query is matched in four places — the DB filter, the result snippets,
 * the preview modal and the on-page highlight after a jump — and they must agree,
 * or a result shows up with nothing highlighted, or the jump lands on the wrong
 * spot. Each of them used to build its own regex; they all go through here now.
 */

export interface SearchMatchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  /** Treat the query as a JS regular expression instead of literal text. */
  useRegex?: boolean;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pattern source and flags, without compiling. */
export function buildSearchSource(
  query: string,
  { caseSensitive, wholeWord, useRegex }: SearchMatchOptions,
): { source: string; flags: string } {
  let source = useRegex ? query : escapeRegExp(query);
  // Grouped so `\b` binds to the whole alternation, not just its first and last branch.
  if (wholeWord) source = `\\b(?:${source})\\b`;
  let flags = caseSensitive ? '' : 'i';
  // Messages are multi-line. `^` / `$` mean line start / end, as in VS Code's search.
  if (useRegex) flags += 'm';
  return { source, flags };
}

/**
 * Compiled regex for the query, or null when the query is empty or not a valid
 * regular expression. `extraFlags` is usually `'g'` for callers that iterate.
 */
export function buildSearchRegex(
  query: string,
  options: SearchMatchOptions,
  extraFlags = '',
): RegExp | null {
  if (!query.trim()) return null;
  const { source, flags } = buildSearchSource(query, options);
  try {
    return new RegExp(source, flags + extraFlags);
  } catch {
    return null;
  }
}

/** Error message when `query` is not a valid regex in regex mode, else null. */
export function getSearchRegexError(
  query: string,
  options: SearchMatchOptions,
): string | null {
  if (!options.useRegex || !query.trim()) return null;
  const { source, flags } = buildSearchSource(query, options);
  try {
    new RegExp(source, flags);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * Split `text` into alternating plain / matched segments.
 *
 * Used instead of `text.split(/(pattern)/)`: in regex mode the user's pattern can
 * contain its own capture groups, which `split` would splice into the output and
 * throw the "odd index = match" convention off.
 */
export function splitByMatches(
  text: string,
  regex: RegExp,
): { text: string; isMatch: boolean }[] {
  const re = regex.global ? regex : new RegExp(regex.source, regex.flags + 'g');
  const parts: { text: string; isMatch: boolean }[] = [];
  let last = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      // Empty match (e.g. `a*`): step past it or exec loops forever.
      re.lastIndex++;
      continue;
    }
    if (m.index > last) parts.push({ text: text.slice(last, m.index), isMatch: false });
    parts.push({ text: m[0], isMatch: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), isMatch: false });
  return parts;
}

/** Position of the first non-empty match, or null. */
export function findFirstMatch(
  text: string,
  regex: RegExp,
): { index: number; length: number } | null {
  const re = regex.global ? regex : new RegExp(regex.source, regex.flags + 'g');
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[0].length > 0) return { index: m.index, length: m[0].length };
    re.lastIndex++;
  }
  return null;
}
