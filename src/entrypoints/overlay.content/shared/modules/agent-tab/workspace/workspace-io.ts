/**
 * Getting data in and out of a workspace.
 *
 * OPFS is unreachable from outside the browser — no path, no Finder, nothing an editor
 * can open. Without this module the workspace is a room with no doors: the agent writes
 * to it and only the agent ever reads it back. Upload and export are what make it a
 * place you can actually keep work.
 *
 * ## Everything moves as bytes
 *
 * Never as strings. A `.png` decoded as UTF-8 loses every invalid sequence to U+FFFD and
 * cannot be recovered, so a "text-only" upload path implemented with the string API
 * would not reject binary — it would accept it and quietly ruin it. `writeBytes` and
 * `readBytes` are used throughout for that reason, which also means text files with an
 * unusual encoding survive untouched rather than being normalised on the way through.
 *
 * ## Uploads never overwrite
 *
 * A colliding name gets a numeric suffix instead. There is no undo here and no version
 * history: dragging a folder in a second time to add one file must not silently replace
 * whatever the agent wrote in the meantime. The report says how many were renamed, so
 * the outcome is visible rather than merely safe.
 */

import { zipSync } from 'fflate';
import { forWorkspace } from '@/shared/workspace/client';
import { basenameOf, looksBinary } from '@/shared/workspace/file-kinds';

/**
 * Per-file ceiling, matching the filesystem's transfer cap.
 *
 * The real constraint is the message bridge: bytes cross it base64-encoded, so the JSON
 * payload is a third larger again. Checked here as well as there so an oversized file is
 * reported by name alongside the others rather than aborting the batch.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** A file waiting to be written, with the path it should land on. */
export interface PickedFile {
  /** Path relative to the upload destination. May contain `/` for a folder upload. */
  relativePath: string;
  file: File;
}

export interface UploadReport {
  written: string[];
  /** Renamed because something was already at that path. */
  renamed: Array<{ from: string; to: string }>;
  /** Stored intact, but the agent's text tools cannot read them. */
  binary: string[];
  /** Rejected, with the reason. */
  failed: Array<{ path: string; error: string }>;
}

// ─── Picking ─────────────────────────────────────────────────────────────────

/**
 * Read a `FileList` from an `<input type="file">`.
 *
 * `webkitRelativePath` is populated only for a `webkitdirectory` input, and is the one
 * way to learn the structure a person selected — a plain `FileList` has no nesting.
 * Empty for a normal multi-file pick, where the name alone is the whole path.
 */
export function collectFromInput(files: FileList | null): PickedFile[] {
  if (!files) return [];
  return Array.from(files).map((file) => ({
    relativePath: (file as any).webkitRelativePath || file.name,
    file,
  }));
}

/**
 * Read a drop, descending into any folders.
 *
 * ⚠️ The `DataTransferItem` list is only valid for the synchronous portion of the drop
 * handler. Awaiting anything before touching it leaves every item neutered, which is why
 * `webkitGetAsEntry()` is called for all items in one pass *before* the first `await`.
 * This is the single most common way folder drops end up silently empty.
 */
export async function collectFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<PickedFile[]> {
  const entries: any[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  // No entry API — a plain file drop, or a browser without it. `files` still works, and
  // gives the flat list a folder-less drop would have produced anyway.
  if (entries.length === 0) {
    return Array.from(dataTransfer.files).map((file) => ({
      relativePath: file.name,
      file,
    }));
  }

  const picked: PickedFile[] = [];
  for (const entry of entries) {
    await walkEntry(entry, '', picked);
  }
  return picked;
}

async function walkEntry(entry: any, prefix: string, out: PickedFile[]): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) =>
      entry.file(resolve, () => resolve(null)),
    );
    if (file) out.push({ relativePath: path, file });
    return;
  }

  if (!entry.isDirectory) return;

  // `readEntries` returns at most 100 per call and signals the end with an empty batch.
  // Calling it once — the obvious reading of the API — silently truncates any folder
  // with more than 100 children.
  const reader = entry.createReader();
  for (;;) {
    const batch = await new Promise<any[]>((resolve) =>
      reader.readEntries(resolve, () => resolve([])),
    );
    if (batch.length === 0) break;
    for (const child of batch) {
      await walkEntry(child, path, out);
    }
  }
}

// ─── Upload ──────────────────────────────────────────────────────────────────

/** Split a name into stem and extension, so a suffix lands before the extension. */
function splitExtension(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot <= 0
    ? { stem: name, ext: '' }
    : { stem: name.slice(0, dot), ext: name.slice(dot) };
}

/** First free variant of `path`, as `name-1.ext`, `name-2.ext`, … */
function freePath(path: string, taken: Set<string>): string {
  if (!taken.has(path)) return path;

  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash + 1);
  const { stem, ext } = splitExtension(path.slice(slash + 1));

  for (let n = 1; ; n++) {
    const candidate = `${dir}${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Strip characters a path segment cannot carry.
 *
 * A picked file name is host-OS text and can hold anything the local filesystem allowed.
 * `paths.ts` would reject a NUL and resolve a `..`, but doing it here keeps the
 * destination predictable rather than leaving it to be refused mid-batch.
 */
function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[\0/\\]/g, '_').trim();
  // A segment of only dots would be read as a traversal rather than a name.
  return /^\.+$/.test(cleaned) ? '_' : cleaned || '_';
}

function sanitizeRelativePath(relativePath: string): string {
  return relativePath
    .split('/')
    .map(sanitizeSegment)
    .filter((s) => s !== '')
    .join('/');
}

/**
 * Write picked files into `destDir`.
 *
 * One `list` up front rather than a `stat` per file: conflict detection needs to know
 * about names allocated earlier in this same batch as well as what was already on disk,
 * so the set has to be held in memory regardless — and once it is, the round trips add
 * nothing.
 */
export async function uploadFiles(
  workspaceId: string,
  picked: PickedFile[],
  destDir = '',
  onProgress?: (done: number, total: number) => void,
): Promise<UploadReport> {
  const ws = forWorkspace(workspaceId);
  const report: UploadReport = { written: [], renamed: [], binary: [], failed: [] };
  if (picked.length === 0) return report;

  const taken = new Set<string>();
  try {
    const { entries } = await ws.list('', true);
    for (const entry of entries) taken.add(entry.path);
  } catch {
    // An unreadable listing is not a reason to refuse the upload; it only means
    // conflicts cannot be detected, so treat the workspace as empty.
  }

  const prefix = destDir ? `${destDir}/` : '';
  let done = 0;

  for (const { relativePath, file } of picked) {
    const wanted = `${prefix}${sanitizeRelativePath(relativePath)}`;

    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the ${
            MAX_UPLOAD_BYTES / 1024 / 1024
          } MB limit`,
        );
      }

      const target = freePath(wanted, taken);
      const bytes = new Uint8Array(await file.arrayBuffer());

      await ws.writeBytes(target, bytes);

      // Reserve it before the next iteration, or two files with the same name in one
      // batch would both resolve to the same free path.
      taken.add(target);
      report.written.push(target);
      if (target !== wanted) report.renamed.push({ from: wanted, to: target });
      // Sniffed rather than guessed from the extension: this is the one moment the bytes
      // are already in hand, and the answer decides what the user is told.
      if (looksBinary(bytes)) report.binary.push(target);
    } catch (e) {
      report.failed.push({ path: wanted, error: (e as Error).message });
    }

    onProgress?.(++done, picked.length);
  }

  return report;
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Hand a blob to the browser's downloader.
 *
 * The anchor is attached to the document before clicking and the URL is revoked on a
 * later task. Both are needed outside Chrome: a detached anchor's click is ignored, and
 * revoking in the same task can cancel the download before it starts.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Save one file, byte for byte. */
export async function downloadFile(workspaceId: string, path: string): Promise<void> {
  const { bytes } = await forWorkspace(workspaceId).readBytes(path);
  // A generic type rather than a guessed one: the extension already tells the OS what
  // this is, and a wrong MIME type is worse than none.
  triggerDownload(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
    basenameOf(path),
  );
}

/** Strip what a download filename cannot carry. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\0/\\:*?"<>|]/g, '_').trim() || 'workspace';
}

/**
 * Zip a subtree and save it.
 *
 * Files are fetched one at a time and zipped in the content script rather than in the
 * background. Zipping where OPFS lives would need only one message, but that message
 * would carry the entire archive base64-encoded — the same total bytes as the per-file
 * reads, in one payload large enough to be refused. Sequential reads also make progress
 * reportable, which a single opaque call is not.
 *
 * `zipSync` blocks. fflate's async variants spawn a Worker, which is more machinery than
 * a workspace of notes justifies; if archives ever grow enough to drop a frame, that is
 * the knob to turn.
 *
 * Empty directories are included as explicit entries, so the structure survives a round
 * trip instead of collapsing to only the paths that happened to hold a file.
 */
export async function downloadZip(
  workspaceId: string,
  options: {
    /** Subtree to archive. '' for the whole workspace. */
    base?: string;
    /** Archive filename, without the `.zip`. */
    name: string;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<{ files: number; failed: Array<{ path: string; error: string }> }> {
  const ws = forWorkspace(workspaceId);
  const base = options.base ?? '';
  const { entries } = await ws.list(base, true);

  const prefixLength = base ? base.length + 1 : 0;
  const files = entries.filter((e) => e.kind === 'file');
  const failed: Array<{ path: string; error: string }> = [];
  const archive: Record<string, Uint8Array> = {};

  // Directory entries come first so an empty one is not lost. fflate reads a trailing
  // slash with empty content as a directory record.
  for (const entry of entries) {
    if (entry.kind !== 'directory') continue;
    archive[`${entry.path.slice(prefixLength)}/`] = new Uint8Array(0);
  }

  let done = 0;
  let added = 0;
  for (const entry of files) {
    try {
      const { bytes } = await ws.readBytes(entry.path);
      archive[entry.path.slice(prefixLength)] = bytes;
      added++;
    } catch (e) {
      // One unreadable file should not cost the other forty. It is named in the result
      // so the archive is not quietly incomplete.
      failed.push({ path: entry.path, error: (e as Error).message });
    }
    options.onProgress?.(++done, files.length);
  }

  const zipped = zipSync(archive, { level: 6 });
  triggerDownload(
    new Blob([zipped as BlobPart], { type: 'application/zip' }),
    `${sanitizeFilename(options.name)}.zip`,
  );

  return { files: added, failed };
}
