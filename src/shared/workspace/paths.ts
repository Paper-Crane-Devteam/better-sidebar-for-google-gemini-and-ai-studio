/**
 * Workspace path handling — normalization and containment.
 *
 * Every path the agent supplies is untrusted text from a language model, so it
 * arrives here before anything touches the filesystem. Paths are POSIX-style and
 * always relative to the workspace root: `src/index.ts`, not `/src/index.ts` and
 * not `C:\src`.
 *
 * Containment is the whole point of this module. OPFS has no concept of a parent
 * directory — `getDirectoryHandle('..')` is a name lookup, not a traversal — so a
 * literal `..` would create a directory *called* `..` rather than escaping. That is
 * a silent wrong answer rather than an error, which is worse: the agent believes it
 * wrote outside the workspace and cannot read the file back. Resolving `..` here
 * turns it into either a legal path or a refusal.
 */

/** Thrown for a path that cannot be made safe. Carries no filesystem detail. */
export class PathError extends Error {}

/**
 * Turn an agent-supplied path into a clean array of segments.
 *
 * Rejects rather than sanitizes when the intent is unrecoverable: a path that
 * climbs above the root is a bug in the agent's reasoning, and quietly clamping it
 * to the root would hide that while writing to the wrong place.
 */
export function splitPath(input: string): string[] {
  if (typeof input !== 'string') throw new PathError('Path must be a string');

  // Backslashes are a Windows habit the model brings along; treat them as separators
  // rather than as part of a filename, which is never what was meant.
  const raw = input.replace(/\\/g, '/').trim();

  if (raw === '' || raw === '.' || raw === '/') return [];

  // A leading slash reads as "workspace root", not as the real filesystem root.
  // Accepting it is friendlier than refusing, and it cannot mean anything else here.
  const parts = raw.split('/');
  const out: string[] = [];

  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) {
        throw new PathError(`Path escapes the workspace root: "${input}"`);
      }
      out.pop();
      continue;
    }
    // NUL is the one character no filesystem accepts, and OPFS reports it as a
    // generic TypeError that would surface to the agent as an unexplained failure.
    if (part.includes('\0')) {
      throw new PathError(`Path contains a null byte: "${input}"`);
    }
    out.push(part);
  }

  return out;
}

/** The canonical form of a path, as the agent should see it echoed back. */
export function normalizePath(input: string): string {
  return splitPath(input).join('/');
}

/** Split a path into its parent segments and final name. Throws for the root. */
export function splitParent(input: string): { dir: string[]; name: string } {
  const parts = splitPath(input);
  if (parts.length === 0) {
    throw new PathError('Expected a file or directory path, got the workspace root');
  }
  return { dir: parts.slice(0, -1), name: parts[parts.length - 1] };
}

/** Join segments into a canonical workspace path. */
export function joinPath(...segments: string[]): string {
  return normalizePath(segments.join('/'));
}
