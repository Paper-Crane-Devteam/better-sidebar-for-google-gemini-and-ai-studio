/**
 * Workspace client — the content script's view of the filesystem.
 *
 * A thin typed wrapper over `browser.runtime.sendMessage({ type: 'WORKSPACE_FS' })`.
 * It exists so callers read like ordinary file calls instead of assembling message
 * payloads, and so the "must not run OPFS here" rule has exactly one place it could be
 * violated (it isn't: nothing in this file touches `navigator.storage`).
 *
 * ## Bound to a workspace, by construction
 *
 * `forWorkspace(id)` returns a client fixed to one workspace, rather than every method
 * taking an id. Two reasons: a caller cannot forget to pass it, and the id is resolved
 * once at the top of an operation instead of per call — so a multi-step tool cannot
 * have its second call land somewhere else.
 *
 * Deliberately no default client. Which workspace applies depends on the conversation's
 * binding, which lives in the agent module; `shared/` must not reach into that, so the
 * caller resolves it and passes it in.
 *
 * Every method rejects with a plain `Error` carrying the background's already
 * translated message, so tools can put `e.message` straight into their result text.
 */

import type { FileEntry, GrepMatch, ReadResult, WorkspaceStats } from './fs';
import { base64ToBytes, bytesToBase64 } from './base64';

type Payload = Extract<
  import('@/shared/types/messages').ExtensionMessage,
  { type: 'WORKSPACE_FS' }
>['payload'];

async function call<T>(workspaceId: string, payload: Payload): Promise<T> {
  const response = await browser.runtime.sendMessage({
    type: 'WORKSPACE_FS',
    workspaceId,
    payload,
  });

  // A background that threw before reaching the handler answers `undefined`, which
  // would otherwise surface as "cannot read property success of undefined" — a stack
  // trace where the caller needed a sentence.
  if (!response) {
    throw new Error('Workspace is unavailable (no response from the extension)');
  }
  if (!response.success) {
    throw new Error(response.error || 'Workspace operation failed');
  }
  return response.data as T;
}

export interface WorkspaceClient {
  readonly workspaceId: string;
  read(path: string, offset?: number, limit?: number): Promise<ReadResult>;
  write(path: string, content: string): Promise<{ bytes: number }>;
  /**
   * Read a file's exact bytes.
   *
   * For download and for zipping. `read` decodes as UTF-8, which replaces every
   * invalid sequence with U+FFFD — fine for the text an agent reads, destructive for
   * an image or an archive.
   */
  readBytes(path: string): Promise<{ bytes: Uint8Array; size: number; modified: number }>;
  /** Write exact bytes. The only correct way to store an uploaded file. */
  writeBytes(path: string, bytes: Uint8Array): Promise<{ bytes: number }>;
  edit(
    path: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean,
  ): Promise<{ replacements: number }>;
  list(
    path?: string,
    recursive?: boolean,
  ): Promise<{ entries: FileEntry[]; truncated: boolean }>;
  glob(
    pattern: string,
    base?: string,
  ): Promise<{ paths: string[]; truncated: boolean }>;
  grep(
    pattern: string,
    options?: { path?: string; include?: string; caseSensitive?: boolean },
  ): Promise<{ matches: GrepMatch[]; truncated: boolean; filesSearched: number }>;
  delete(path: string, recursive?: boolean): Promise<void>;
  mkdir(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  stat(path: string): Promise<FileEntry | null>;
  stats(): Promise<WorkspaceStats>;
  clear(): Promise<void>;
}

/** A filesystem client fixed to one workspace. */
export function forWorkspace(workspaceId: string): WorkspaceClient {
  const run = <T>(payload: Payload) => call<T>(workspaceId, payload);

  return {
    workspaceId,

    read: (path, offset, limit) =>
      run<ReadResult>({ op: 'read', path, offset, limit }),

    write: (path, content) => run<{ bytes: number }>({ op: 'write', path, content }),

    // Base64 is an artefact of the bridge, so it is encoded and decoded here rather
    // than exposed. Callers deal in `Uint8Array` and never see the wire format.
    readBytes: async (path) => {
      const data = await run<{ base64: string; size: number; modified: number }>({
        op: 'readBytes',
        path,
      });
      return {
        bytes: base64ToBytes(data.base64),
        size: data.size,
        modified: data.modified,
      };
    },

    writeBytes: (path, bytes) =>
      run<{ bytes: number }>({
        op: 'writeBytes',
        path,
        base64: bytesToBase64(bytes),
      }),

    edit: (path, oldString, newString, replaceAll) =>
      run<{ replacements: number }>({
        op: 'edit',
        path,
        oldString,
        newString,
        replaceAll,
      }),

    list: (path, recursive) =>
      run<{ entries: FileEntry[]; truncated: boolean }>({
        op: 'list',
        path,
        recursive,
      }),

    glob: (pattern, base) =>
      run<{ paths: string[]; truncated: boolean }>({ op: 'glob', pattern, base }),

    grep: (pattern, options = {}) =>
      run<{ matches: GrepMatch[]; truncated: boolean; filesSearched: number }>({
        op: 'grep',
        pattern,
        ...options,
      }),

    delete: (path, recursive) => run<void>({ op: 'delete', path, recursive }),

    mkdir: (path) => run<void>({ op: 'mkdir', path }),

    move: (from, to) => run<void>({ op: 'move', from, to }),

    stat: (path) => run<FileEntry | null>({ op: 'stat', path }),

    stats: () => run<WorkspaceStats>({ op: 'stats' }),

    clear: () => run<void>({ op: 'clear' }),
  };
}

export type { FileEntry, GrepMatch, ReadResult, WorkspaceStats };
