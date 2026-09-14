/**
 * Loading and saving a document, with a way back.
 *
 * ## Why this is not just `readBytes` / `writeBytes`
 *
 * The workspace has no undo. `undo/snapshot-store.ts` snapshots database tables and
 * nothing else, so a file the agent overwrites is simply gone. For a text file that is
 * survivable — the agent can usually write it back. For a `.docx` it is not: a
 * half-written archive does not open *at all*, and what the user lost is their thesis.
 *
 * So every mutation goes through `saveDocument`, which does four things a plain write
 * does not:
 *
 * 1. **Verifies the new bytes before touching the original.** The check is a pure
 *    function of the new bytes (can it be re-opened, are the declared parts present),
 *    so a bug in the edit layer is caught while the file on disk is still intact.
 * 2. **Keeps a copy** under `.history/`, once per agent session — the same "first write
 *    is the session's starting state" reasoning as `snapshot-store.ts`.
 * 3. **Reads back what landed** and verifies that too. This is what catches a write
 *    that was cut short (quota, storage handle revoked mid-write).
 * 4. **Restores from the copy** when step 3 fails, so a failed save leaves the file as
 *    it was rather than as rubble.
 *
 * ⚠️ `.history/` must never count against `FREE_MAX_FILES`. A safety net that pushes a
 * free user into a paywall is a safety net they will find a way to turn off.
 */

import * as fs from '@/shared/workspace/fs';
import { splitParent, joinPath } from '@/shared/workspace/paths';
import { DocumentError } from './types';
import { HISTORY_DIR, isHistoryPath } from './history-path';

export { HISTORY_DIR, isHistoryPath };

/** Copies kept per file. Enough to undo a session's worth of mistakes, not an archive. */
const HISTORY_KEEP = 3;

/**
 * A document opened for reading or editing.
 *
 * `modified` is carried so a projection can be cached against it: an outline is
 * expensive to build and the file usually has not changed between two reads.
 */
export interface LoadedDocument {
  path: string;
  bytes: Uint8Array;
  size: number;
  modified: number;
}

/** What a format handler must be able to say about bytes it produced. */
export type Verifier = (bytes: Uint8Array) => void | Promise<void>;

export async function loadDocument(
  scope: fs.Scope,
  path: string,
): Promise<LoadedDocument> {
  const info = await fs.stat(scope, path);
  if (!info) {
    throw new DocumentError(
      `Not found: "${path}". List the workspace first — the file may be under a folder.`,
    );
  }
  if (info.kind !== 'file') {
    throw new DocumentError(`"${path}" is a folder, not a document.`);
  }

  const { bytes, size, modified } = await fs.readBytes(scope, path, fs.MAX_LOCAL_BYTES);
  return { path, bytes, size, modified };
}

/**
 * Sessions that have already backed up a given file.
 *
 * Keyed by session so the copy is the state at the *start of the task*, not the state
 * before the most recent of twelve consecutive edits — which is what a per-write backup
 * would give, and is useless for the question the user actually asks ("put it back the
 * way it was").
 *
 * Lives in worker memory. A worker restart loses it and the next write takes one extra
 * copy, which is the harmless direction to fail in.
 */
const backedUp = new Set<string>();

/**
 * Ceiling on remembered marks.
 *
 * There is deliberately **no** "session ended" message to clear this. The key already
 * contains the session id, so an entry from a finished task can never be mistaken for the
 * current one — which means the only thing accumulation costs is memory, and a bound fixes
 * that without a whole reset channel to keep in sync. Passing the cap forgets everything;
 * the worst outcome is one redundant copy on the next write.
 */
const MAX_MARKS = 200;

export interface SaveOptions {
  /** Agent session this edit belongs to, for once-per-session backup. */
  sessionId?: string;
  /** Format-specific structural check. Runs before anything on disk changes. */
  verify?: Verifier;
}

export interface SaveResult {
  bytes: number;
  /** Where the previous version went, when this was the session's first write. */
  backupPath?: string;
}

/**
 * Replace a document's bytes, keeping a way back.
 *
 * Never partially applies: either the new bytes are on disk and verified, or the file
 * is exactly what it was.
 */
export async function saveDocument(
  scope: fs.Scope,
  path: string,
  bytes: Uint8Array,
  options: SaveOptions = {},
): Promise<SaveResult> {
  // ① Check the new bytes while the old ones are still safe.
  if (options.verify) {
    try {
      await options.verify(bytes);
    } catch (e) {
      throw new DocumentError(
        `The edited file did not pass its own structure check, so nothing was written ` +
          `(${(e as Error).message}). This is a bug in the edit, not in your input — ` +
          'try a smaller or simpler change.',
      );
    }
  }

  // Keep the immediate pre-write bytes for rollback, including later writes in a session.
  const previous = await fs.readBytes(scope, path, fs.MAX_LOCAL_BYTES);

  // ② Copy the current version aside, once per session.
  const key = `${options.sessionId ?? 'no-session'}\u0000${scope.workspaceId}\u0000${path}`;
  let backupPath: string | undefined;
  if (!options.sessionId || !backedUp.has(key)) {
    backupPath = (await archiveCurrent(scope, path)) ?? undefined;
    if (!backupPath) throw new DocumentError('Could not back up the document; nothing was written.');
    if (backedUp.size >= MAX_MARKS) backedUp.clear();
    backedUp.add(key);
  }

  // ③ Write, then ④ confirm what landed.
  try {
    await fs.writeBytes(scope, path, bytes, fs.MAX_LOCAL_BYTES);
    const readBack = await fs.readBytes(scope, path, fs.MAX_LOCAL_BYTES);
    if (readBack.size !== bytes.byteLength) {
      throw new Error(
        `only ${readBack.size} of ${bytes.byteLength} bytes were written`,
      );
    }
    if (!readBack.bytes.every((value, i) => value === bytes[i])) throw new Error("Written bytes differ from the verified output");
    await options.verify?.(readBack.bytes);
  } catch (e) {
    let restored = false;
    try {
      await fs.writeBytes(scope, path, previous.bytes, fs.MAX_LOCAL_BYTES);
      const check = await fs.readBytes(scope, path, fs.MAX_LOCAL_BYTES);
      restored = check.size === previous.size && check.bytes.every((value, i) => value === previous.bytes[i]);
    } catch { /* Report recovery failure below. */ }
    throw new DocumentError(
      `The write did not complete (${(e as Error).message}). ` +
        (restored
          ? `${path} has been restored to its state before this write.`
          : `⚠️ ${path} may be damaged; a copy of the previous version is at ` +
            `${backupPath ?? 'no backup was taken'}.`),
    );
  }

  return { bytes: bytes.byteLength, backupPath };
}

/**
 * Copy a file into `.history/`, and prune older copies of it.
 *
 * Returns the backup path, or null when there was nothing to copy (a brand new file has
 * no previous version, which is not a failure).
 *
 * Returns null on backup failure; the caller refuses to overwrite the original.
 */
async function archiveCurrent(
  scope: fs.Scope,
  path: string,
): Promise<string | null> {
  try {
    const info = await fs.stat(scope, path);
    if (!info || info.kind !== 'file') return null;

    const { dir, name } = splitParent(path);
    const stamp = timestamp();
    const target = joinPath(HISTORY_DIR, ...dir, `${name}.${stamp}`);

    const { bytes } = await fs.readBytes(scope, path, fs.MAX_LOCAL_BYTES);
    await fs.writeBytes(scope, target, bytes, fs.MAX_LOCAL_BYTES);

    await prune(scope, joinPath(HISTORY_DIR, ...dir), name);
    return target;
  } catch (e) {
    console.warn('[Documents] Could not archive the previous version:', e);
    return null;
  }
}

/** Drop all but the newest `HISTORY_KEEP` copies of one file. */
async function prune(
  scope: fs.Scope,
  dir: string,
  baseName: string,
): Promise<void> {
  const { entries } = await fs.listFiles(scope, dir, false);
  // Names are `<original name>.<stamp>`, and the stamp sorts lexicographically in time
  // order, so a plain descending sort puts the newest first.
  const copies = entries
    .filter((e) => e.kind === 'file')
    .map((e) => e.path)
    .filter((p) => p.slice(p.lastIndexOf('/') + 1).startsWith(`${baseName}.`))
    .sort()
    .reverse();

  for (const stale of copies.slice(HISTORY_KEEP)) {
    try {
      await fs.remove(scope, stale);
    } catch {
      // A copy we could not delete is clutter, not a failure worth reporting.
    }
  }
}

/**
 * `20260905-143012` — sortable, readable, and legal as a filename everywhere.
 *
 * Deliberately not `Date.now()`: the user sees these names in the file tree, and
 * `main.docx.1757068212000` tells them nothing about which copy is which.
 */
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}-${crypto.randomUUID()}`
  );
}
