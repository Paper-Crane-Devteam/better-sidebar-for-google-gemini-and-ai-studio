/**
 * Workspace filesystem — OPFS operations, extension origin.
 *
 * ⚠️ This module must only ever run in the background service worker or another
 * extension-origin context. `navigator.storage.getDirectory()` is origin-scoped, and
 * a content script's origin is the *host page* (gemini.google.com), not the
 * extension. Calling this from a content script would silently create a separate
 * workspace per platform and write into Google's storage quota. The message bridge
 * in `client.ts` exists for that reason.
 *
 * Everything is async: `createSyncAccessHandle` needs a dedicated Worker, and the
 * only thing it buys here is throughput on large files, which an agent editing
 * source files does not need.
 */

import { splitPath, splitParent, PathError } from './paths';
import { compileGlob, matchesAny, type GlobMatcher } from './glob';

/** Root directory holding every workspace, inside the extension's OPFS. */
const WORKSPACE_ROOT = 'agent-workspace';

/**
 * Which workspace an operation applies to.
 *
 * Passed in on every call rather than held as background state. The selection lives in
 * a content-script store, and a background copy of it would be a second source of truth
 * that can lag: a user switching workspaces mid-session would have the next tool call
 * land in the previous one, writing a file the agent then cannot find. As a parameter,
 * the caller's answer is always the one used.
 */
export interface Scope {
  workspaceId: string;
}

/** Reject an id that would escape its directory. */
function scopeSegment(scope: Scope): string {
  const id = scope?.workspaceId?.trim();
  if (!id) throw new Error('No workspace selected');
  // Ids are generated (`default` or `ws-<hex>`), so a separator or dot-only segment is
  // malformed rather than merely unusual — refuse instead of sanitising.
  if (/[/\\]|\0/.test(id) || /^\.+$/.test(id)) {
    throw new Error(`Invalid workspace id: "${id}"`);
  }
  return id;
}

/** Guard against an agent reading a binary blob into the conversation. */
const MAX_READ_BYTES = 2 * 1024 * 1024;

/**
 * Cap on a single raw-byte transfer, for upload and download.
 *
 * Higher than `MAX_READ_BYTES` because the two limits protect different things: that
 * one keeps a large file out of the model's context window, this one keeps a base64
 * string inside what `runtime.sendMessage` will carry. A person downloading an
 * attachment has no context window to blow.
 */
const MAX_TRANSFER_BYTES = 20 * 1024 * 1024;

/**
 * Cap for byte access that never crosses the message bridge.
 *
 * The document engine (`shared/documents/`) runs at the extension origin and opens
 * these files itself, so the base64 round trip `MAX_TRANSFER_BYTES` protects does not
 * happen — and 20 MB is a real limit for a deck with video in it. Callers pass this
 * explicitly rather than it being the default: an accidental 64 MB base64 string is
 * exactly the failure the smaller cap exists to prevent.
 */
export const MAX_LOCAL_BYTES = 64 * 1024 * 1024;

/** Cap on entries returned by a single list/glob call. */
const MAX_ENTRIES = 1000;

/** Cap on matches returned by a single grep call. */
const MAX_GREP_MATCHES = 200;

// ─── Handles ─────────────────────────────────────────────────────────────────

async function getRoot(scope: Scope): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error('OPFS is not available in this context');
  }
  const opfs = await navigator.storage.getDirectory();
  const all = await opfs.getDirectoryHandle(WORKSPACE_ROOT, { create: true });
  // `create: true` on the workspace directory too: a workspace exists in the registry
  // from the moment it is created, but its directory only needs to appear when
  // something first touches it. Listing an untouched workspace should read as empty,
  // not fail.
  return all.getDirectoryHandle(scopeSegment(scope), { create: true });
}

/**
 * Walk to a directory, optionally creating the chain.
 *
 * `create: false` maps a missing segment to a `NotFoundError` DOMException, which
 * callers translate into their own message — the raw text names OPFS internals the
 * agent has no way to act on.
 */
async function resolveDir(
  scope: Scope,
  segments: string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = await getRoot(scope);
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}

async function resolveFile(
  scope: Scope,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const { dir, name } = splitParent(path);
  const parent = await resolveDir(scope, dir, create);
  return parent.getFileHandle(name, { create });
}

/** Whether a rejection is OPFS's "no such entry". */
function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotFoundError';
}

// ─── Results ─────────────────────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  kind: 'file' | 'directory';
  /** Bytes; omitted for directories. */
  size?: number;
  /** Epoch millis of last write; omitted for directories. */
  modified?: number;
}

export interface ReadResult {
  path: string;
  content: string;
  /** 1-based line the content starts at. */
  startLine: number;
  /** Total lines in the file, regardless of the slice returned. */
  totalLines: number;
  truncated: boolean;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface WorkspaceStats {
  files: number;
  directories: number;
  bytes: number;
}

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Read a text file, optionally a line range.
 *
 * Line numbers are 1-based and inclusive, matching what every editor and every
 * grep output shows — the agent gets `line: 42` from a search and passes 42 back.
 */
export async function readFile(
  scope: Scope,
  path: string,
  offset?: number,
  limit?: number,
): Promise<ReadResult> {
  const handle = await resolveFile(scope, path, false);
  const file = await handle.getFile();

  if (file.size > MAX_READ_BYTES) {
    throw new Error(
      `File is ${file.size} bytes, over the ${MAX_READ_BYTES}-byte read limit. ` +
        'Use offset/limit to read part of it.',
    );
  }

  const text = await file.text();
  const lines = text.split('\n');
  const totalLines = lines.length;

  const start = Math.max(1, offset ?? 1);
  const count = limit ?? totalLines;
  const slice = lines.slice(start - 1, start - 1 + count);

  return {
    path,
    content: slice.join('\n'),
    startLine: start,
    totalLines,
    truncated: start > 1 || slice.length < totalLines,
  };
}

// ─── Write ───────────────────────────────────────────────────────────────────

/** Write a file, creating parent directories as needed. Returns bytes written. */
export async function writeFile(
  scope: Scope,
  path: string,
  content: string,
): Promise<number> {
  const handle = await resolveFile(scope, path, true);
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
  } finally {
    // `close()` is what commits the write. Skipping it on the error path would
    // leave the file empty *and* leak the writable, locking the file for the rest
    // of the session.
    await writable.close();
  }
  return new TextEncoder().encode(content).length;
}

/**
 * Write raw bytes, creating parent directories as needed.
 *
 * The byte-level counterpart to `writeFile`, and the only correct way to store an
 * uploaded file. `writeFile` takes a JS string, so anything that reached it would first
 * have to be decoded as UTF-8 — and every invalid sequence in a PNG or a PDF becomes
 * U+FFFD, which is not recoverable. Whatever arrives here is what comes back out.
 */
export async function writeBytes(
  scope: Scope,
  path: string,
  bytes: Uint8Array,
  maxBytes = MAX_TRANSFER_BYTES,
): Promise<number> {
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `File is ${bytes.byteLength} bytes, over the ${maxBytes}-byte limit.`,
    );
  }
  const handle = await resolveFile(scope, path, true);
  const writable = await handle.createWritable();
  try {
    // `write` needs its own buffer view, not the caller's — a subarray of a larger
    // buffer would otherwise write the whole backing store.
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
  return bytes.byteLength;
}

/** Read a file as raw bytes. Used for download, where a text decode would corrupt. */
export async function readBytes(
  scope: Scope,
  path: string,
  maxBytes = MAX_TRANSFER_BYTES,
): Promise<{ bytes: Uint8Array; size: number; modified: number }> {
  const handle = await resolveFile(scope, path, false);
  const file = await handle.getFile();

  if (file.size > maxBytes) {
    throw new Error(
      `File is ${file.size} bytes, over the ${maxBytes}-byte transfer limit.`,
    );
  }

  return {
    bytes: new Uint8Array(await file.arrayBuffer()),
    size: file.size,
    modified: file.lastModified,
  };
}

/**
 * Replace literal text in an existing file.
 *
 * Refuses an ambiguous match rather than guessing. This is the constraint that makes
 * the tool trustworthy: the agent has to supply enough surrounding context to name
 * one location, and a stale assumption fails loudly instead of editing the wrong
 * line. `replaceAll` is the explicit opt-out.
 */
export async function editFile(
  scope: Scope,
  path: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): Promise<{ replacements: number }> {
  if (oldString === '') {
    throw new Error('old_string must not be empty — use write to create a file');
  }

  const handle = await resolveFile(scope, path, false);
  const text = await (await handle.getFile()).text();

  // `split` rather than a regex: the strings are literal, and escaping a multi-line
  // block for a regex is a source of bugs with no upside here.
  const parts = text.split(oldString);
  const count = parts.length - 1;

  if (count === 0) {
    throw new Error(`old_string not found in ${path}`);
  }
  if (count > 1 && !replaceAll) {
    throw new Error(
      `old_string appears ${count} times in ${path}. Provide more surrounding ` +
        'context to identify one occurrence, or set replace_all to true.',
    );
  }

  const updated = replaceAll
    ? parts.join(newString)
    : parts[0] + newString + parts.slice(1).join(oldString);

  await writeFile(scope, path, updated);
  return { replacements: replaceAll ? count : 1 };
}

// ─── Traverse ────────────────────────────────────────────────────────────────

/**
 * Walk the tree below `segments`, yielding every entry.
 *
 * Depth-first and iterative rather than recursive-with-await-in-loop, so one very
 * deep directory cannot blow the stack. Directories are yielded before their
 * contents, which is the order a tree view wants.
 */
async function* walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
): AsyncGenerator<{ path: string; handle: FileSystemHandle }> {
  const stack: Array<{ dir: FileSystemDirectoryHandle; prefix: string }> = [
    { dir, prefix },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;
    // `values()` is an async iterator; it is the only way to enumerate OPFS.
    for await (const handle of (current.dir as any).values()) {
      const path = current.prefix ? `${current.prefix}/${handle.name}` : handle.name;
      yield { path, handle };
      if (handle.kind === 'directory') {
        stack.push({ dir: handle as FileSystemDirectoryHandle, prefix: path });
      }
    }
  }
}

/** List a directory. `recursive` walks the whole subtree. */
export async function listFiles(
  scope: Scope,
  path = '',
  recursive = false,
): Promise<{ entries: FileEntry[]; truncated: boolean }> {
  const segments = splitPath(path);
  const dir = await resolveDir(scope, segments, false);
  const prefix = segments.join('/');
  const entries: FileEntry[] = [];
  let truncated = false;

  if (recursive) {
    for await (const { path: p, handle } of walk(dir, prefix)) {
      if (entries.length >= MAX_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push(await describe(p, handle));
    }
  } else {
    for await (const handle of (dir as any).values()) {
      if (entries.length >= MAX_ENTRIES) {
        truncated = true;
        break;
      }
      const p = prefix ? `${prefix}/${handle.name}` : handle.name;
      entries.push(await describe(p, handle));
    }
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { entries, truncated };
}

async function describe(path: string, handle: FileSystemHandle): Promise<FileEntry> {
  if (handle.kind === 'directory') {
    return { path, kind: 'directory' };
  }
  const file = await (handle as FileSystemFileHandle).getFile();
  return { path, kind: 'file', size: file.size, modified: file.lastModified };
}

/** Find files by glob pattern. Files only — a directory is never a glob result. */
export async function globFiles(
  scope: Scope,
  pattern: string,
  base = '',
): Promise<{ paths: string[]; truncated: boolean }> {
  const segments = splitPath(base);
  const dir = await resolveDir(scope, segments, false);
  const prefix = segments.join('/');
  const matcher = compileGlob(pattern);
  const paths: string[] = [];
  let truncated = false;

  for await (const { path, handle } of walk(dir, prefix)) {
    if (handle.kind !== 'file') continue;
    // Match against the path relative to `base`, so a pattern the agent wrote for a
    // subdirectory does not have to repeat the subdirectory's name.
    const relative = prefix && path.startsWith(`${prefix}/`)
      ? path.slice(prefix.length + 1)
      : path;
    if (!matcher.test(relative)) continue;
    if (paths.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    paths.push(path);
  }

  paths.sort();
  return { paths, truncated };
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** Search file contents by regex, returning matching lines with line numbers. */
export async function grepFiles(
  scope: Scope,
  pattern: string,
  options: { path?: string; include?: string; caseSensitive?: boolean } = {},
): Promise<{ matches: GrepMatch[]; truncated: boolean; filesSearched: number }> {
  let re: RegExp;
  try {
    re = new RegExp(pattern, options.caseSensitive ? '' : 'i');
  } catch (e) {
    throw new Error(`Invalid regular expression: ${(e as Error).message}`);
  }

  const segments = splitPath(options.path ?? '');
  const dir = await resolveDir(scope, segments, false);
  const prefix = segments.join('/');

  const includes: GlobMatcher[] = options.include
    ? [compileGlob(options.include)]
    : [];

  const matches: GrepMatch[] = [];
  let truncated = false;
  let filesSearched = 0;

  outer: for await (const { path, handle } of walk(dir, prefix)) {
    if (handle.kind !== 'file') continue;

    const relative = prefix && path.startsWith(`${prefix}/`)
      ? path.slice(prefix.length + 1)
      : path;
    if (!matchesAny(relative, includes)) continue;

    const file = await (handle as FileSystemFileHandle).getFile();
    // Skip anything too large to be source text. Reading a 50 MB blob to regex it
    // would stall the service worker and cannot produce a useful match.
    if (file.size > MAX_READ_BYTES) continue;

    const text = await file.text();
    // A NUL byte in the first chunk is the standard binary heuristic; grepping a
    // binary file produces line noise, not answers.
    if (text.indexOf('\0') !== -1) continue;

    filesSearched++;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      if (matches.length >= MAX_GREP_MATCHES) {
        truncated = true;
        break outer;
      }
      // Long lines are truncated: a minified bundle would otherwise return one
      // match that fills the entire result budget.
      const text_ = lines[i].length > 500 ? `${lines[i].slice(0, 500)}…` : lines[i];
      matches.push({ path, line: i + 1, text: text_ });
    }
  }

  return { matches, truncated, filesSearched };
}

// ─── Mutate ──────────────────────────────────────────────────────────────────

/** Delete a file or directory. Directories need `recursive` when non-empty. */
export async function remove(
  scope: Scope,
  path: string,
  recursive = false,
): Promise<void> {
  const { dir, name } = splitParent(path);
  const parent = await resolveDir(scope, dir, false);
  await parent.removeEntry(name, { recursive });
}

/** Create a directory, including missing parents. */
export async function makeDir(scope: Scope, path: string): Promise<void> {
  const segments = splitPath(path);
  if (segments.length === 0) return; // root always exists
  await resolveDir(scope, segments, true);
}

/**
 * Copy one file's bytes to a new path, creating parents.
 *
 * Writes the `File` blob straight into the writable rather than reading it into memory
 * first. That is what makes this size-unbounded: the browser streams it, so a move is
 * not limited by whatever cap a read would impose. It is also the reason a move cannot
 * corrupt anything — no text decode happens at any point.
 */
async function copyFileTo(
  scope: Scope,
  source: FileSystemFileHandle,
  to: string,
): Promise<void> {
  const file = await source.getFile();
  const target = await resolveFile(scope, to, true);
  const writable = await target.createWritable();
  try {
    await writable.write(file);
  } finally {
    await writable.close();
  }
}

/**
 * Move or rename a file or a directory.
 *
 * Copy-then-delete rather than `FileSystemHandle.move()`: that method is Chrome-only
 * and still moving through the spec, and this path also has to work for a
 * cross-directory move where the destination's parents do not exist yet.
 *
 * Three things it refuses rather than attempts:
 *
 * - Moving a directory beneath itself, which would recurse into the copy it is making.
 * - Writing over something already at the destination. OPFS would happily overwrite,
 *   so a rename that collides with an existing name would destroy that file with no
 *   indication — the tree offers no undo, and neither does the agent.
 * - Touching the workspace root, which has no parent to be moved within.
 */
export async function movePath(
  scope: Scope,
  from: string,
  to: string,
): Promise<void> {
  const fromSegments = splitPath(from);
  const toSegments = splitPath(to);

  if (fromSegments.length === 0) throw new Error('Cannot move the workspace root');
  if (toSegments.length === 0) {
    throw new Error('Cannot move something onto the workspace root');
  }

  const fromPath = fromSegments.join('/');
  const toPath = toSegments.join('/');
  if (fromPath === toPath) return;

  const source = await stat(scope, fromPath);
  if (!source) throw new Error(`Not found: "${fromPath}"`);

  if (source.kind === 'directory' && toPath.startsWith(`${fromPath}/`)) {
    throw new Error(`Cannot move "${fromPath}" into itself`);
  }
  if (await stat(scope, toPath)) {
    throw new Error(`"${toPath}" already exists`);
  }

  if (source.kind === 'file') {
    await copyFileTo(scope, await resolveFile(scope, fromPath, false), toPath);
    await remove(scope, fromPath);
    return;
  }

  // A directory move is the same operation applied to every descendant. `walk` yields
  // a directory before its contents, so an empty subdirectory is recreated rather than
  // dropped for having no files to imply it.
  const dir = await resolveDir(scope, fromSegments, false);
  await makeDir(scope, toPath);

  for await (const { path, handle } of walk(dir, fromPath)) {
    const target = `${toPath}/${path.slice(fromPath.length + 1)}`;
    if (handle.kind === 'directory') {
      await makeDir(scope, target);
    } else {
      await copyFileTo(scope, handle as FileSystemFileHandle, target);
    }
  }

  await remove(scope, fromPath, true);
}

/** Whether a path exists, and what it is. */
export async function stat(scope: Scope, path: string): Promise<FileEntry | null> {
  const segments = splitPath(path);
  if (segments.length === 0) return { path: '', kind: 'directory' };

  const { dir, name } = splitParent(path);
  let parent: FileSystemDirectoryHandle;
  try {
    parent = await resolveDir(scope, dir, false);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }

  try {
    const handle = await parent.getFileHandle(name);
    return describe(segments.join('/'), handle);
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }

  try {
    const handle = await parent.getDirectoryHandle(name);
    return describe(segments.join('/'), handle);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

/** Aggregate counts and size for one workspace. */
export async function getStats(scope: Scope): Promise<WorkspaceStats> {
  const root = await getRoot(scope);
  const stats: WorkspaceStats = { files: 0, directories: 0, bytes: 0 };

  for await (const { handle } of walk(root, '')) {
    if (handle.kind === 'directory') {
      stats.directories++;
    } else {
      stats.files++;
      stats.bytes += (await (handle as FileSystemFileHandle).getFile()).size;
    }
  }

  return stats;
}

/**
 * Delete everything in *one* workspace.
 *
 * Removes that workspace's directory and lets the next call recreate it: fewer
 * operations than emptying it entry by entry, and immune to a partially-failed loop.
 *
 * ⚠️ Scoped deliberately. Removing `WORKSPACE_ROOT` here would wipe every workspace,
 * which is what an earlier version did — a "clear this workspace" button that emptied
 * all of them.
 */
export async function clearWorkspace(scope: Scope): Promise<void> {
  const opfs = await navigator.storage.getDirectory();
  const segment = scopeSegment(scope);
  try {
    const all = await opfs.getDirectoryHandle(WORKSPACE_ROOT);
    await all.removeEntry(segment, { recursive: true });
  } catch (e) {
    // Nothing there is the goal state, not a failure.
    if (!isNotFound(e)) throw e;
  }
}

export { PathError };
