/**
 * Glob matching for workspace paths.
 *
 * Hand-written rather than pulling in `minimatch`/`micromatch`: those carry Node
 * built-in dependencies (`path`, `util`) that need polyfilling in a content script,
 * and they bring brace expansion, extglobs and POSIX classes that a file-listing
 * tool has no use for. What the agent actually needs is the four constructs below,
 * which are one regex translation.
 *
 * Supported:
 *   `*`       — any run of characters except `/`
 *   `**`      — any run of characters including `/` (crosses directories)
 *   `?`       — exactly one character except `/`
 *   `{a,b,c}` — alternation, no nesting
 *
 * A pattern with no `/` matches the *basename* at any depth, so `*.ts` finds
 * `src/deep/file.ts`. This mirrors what the model expects from ripgrep and from
 * every coding agent's file tool, and it is the difference between `*.ts` returning
 * the whole tree's TypeScript files and returning only the root's.
 */

/** Escape the characters that mean something to a regex but not to a glob. */
function escapeLiteral(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Translate a glob into a regex source string.
 *
 * `**` is handled with its surrounding slashes rather than on its own, because
 * `a/**​/b` has to match `a/b` — the pattern means "zero or more directories", and
 * translating `**` to `.*` alone would require the slash to be present and leave
 * `a/b` unmatched.
 */
function globToRegexSource(pattern: string): string {
  let out = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*') {
      const isDouble = pattern[i + 1] === '*';
      if (isDouble) {
        // Consume the run — `***` is treated as `**` rather than as an error.
        while (pattern[i] === '*') i++;
        if (pattern[i] === '/') {
          // `**/` — any number of leading directories, including none.
          out += '(?:.*/)?';
          i++;
        } else if (i >= pattern.length) {
          // Trailing `**` — everything below here.
          out += '.*';
        } else {
          out += '.*';
        }
        continue;
      }
      out += '[^/]*';
      i++;
      continue;
    }

    if (ch === '?') {
      out += '[^/]';
      i++;
      continue;
    }

    if (ch === '{') {
      const close = pattern.indexOf('}', i);
      if (close === -1) {
        // Unbalanced brace: the model meant a literal, not an alternation.
        out += '\\{';
        i++;
        continue;
      }
      const body = pattern.slice(i + 1, close);
      const alts = body.split(',').map((alt) => globToRegexSource(alt));
      out += `(?:${alts.join('|')})`;
      i = close + 1;
      continue;
    }

    out += escapeLiteral(ch);
    i++;
  }

  return out;
}

/** A compiled matcher. Built once, applied to every candidate path. */
export interface GlobMatcher {
  pattern: string;
  test(path: string): boolean;
}

export function compileGlob(pattern: string): GlobMatcher {
  const trimmed = pattern.replace(/\\/g, '/').replace(/^\.\//, '').trim();

  // No separator anywhere means "match the basename at any depth" (see module note).
  // `**` is excluded from that rule: `**` alone already means everything, and
  // `{a,b}/c` contains a slash inside a brace group, so the check is on the raw text.
  const basenameOnly = !trimmed.includes('/');

  const source = globToRegexSource(trimmed);
  // Case-insensitive: the agent guesses at capitalization it has not read yet, and a
  // file tool that answers "no matches" for `*.TS` is answering the wrong question.
  const re = new RegExp(`^${source}$`, 'i');

  return {
    pattern: trimmed,
    test(path: string): boolean {
      if (re.test(path)) return true;
      if (basenameOnly) {
        const base = path.slice(path.lastIndexOf('/') + 1);
        return re.test(base);
      }
      return false;
    },
  };
}

/** Whether `path` matches any of the patterns. An empty list matches everything. */
export function matchesAny(path: string, matchers: GlobMatcher[]): boolean {
  if (matchers.length === 0) return true;
  return matchers.some((m) => m.test(path));
}
