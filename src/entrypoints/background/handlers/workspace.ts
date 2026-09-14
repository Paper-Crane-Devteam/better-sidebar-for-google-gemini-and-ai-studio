/**
 * WORKSPACE_FS handler — the agent's file operations, at the extension origin.
 *
 * The whole handler exists to put OPFS calls in a context where `navigator.storage`
 * means the extension rather than gemini.google.com. See the message type's comment.
 *
 * Errors are returned as `{ success: false, error }` rather than thrown: the tool
 * layer turns them into text the AI reads and retries from, so a missing file has to
 * be a normal answer, not a crash. `PathError` and OPFS's `NotFoundError` are
 * translated here, where the operation and path are both still in scope.
 */

import type { ExtensionMessage, ExtensionResponse } from '@/shared/types/messages';
import * as fs from '@/shared/workspace/fs';
import { PathError } from '@/shared/workspace/paths';
import { base64ToBytes, bytesToBase64 } from '@/shared/workspace/base64';

export async function handleWorkspace(
  message: ExtensionMessage,
): Promise<ExtensionResponse | null> {
  if (message.type !== 'WORKSPACE_FS') return null;

  const p = message.payload;
  const scope: fs.Scope = { workspaceId: message.workspaceId };

  try {
    switch (p.op) {
      case 'read':
        return {
          success: true,
          data: await fs.readFile(scope, p.path, p.offset, p.limit),
        };

      case 'write':
        return {
          success: true,
          data: { bytes: await fs.writeFile(scope, p.path, p.content) },
        };

      // Encoding happens at the boundary, not in `fs`: the filesystem layer deals in
      // `Uint8Array`, and base64 is a property of the transport it happens to be
      // behind. A future direct caller in this context would not want it.
      case 'readBytes': {
        const result = await fs.readBytes(scope, p.path);
        return {
          success: true,
          data: {
            base64: bytesToBase64(result.bytes),
            size: result.size,
            modified: result.modified,
          },
        };
      }

      case 'writeBytes':
        return {
          success: true,
          data: {
            bytes: await fs.writeBytes(scope, p.path, base64ToBytes(p.base64)),
          },
        };

      case 'edit':
        return {
          success: true,
          data: await fs.editFile(
            scope,
            p.path,
            p.oldString,
            p.newString,
            p.replaceAll,
          ),
        };

      case 'list':
        return { success: true, data: await fs.listFiles(scope, p.path, p.recursive) };

      case 'glob':
        return { success: true, data: await fs.globFiles(scope, p.pattern, p.base) };

      case 'grep':
        return {
          success: true,
          data: await fs.grepFiles(scope, p.pattern, {
            path: p.path,
            include: p.include,
            caseSensitive: p.caseSensitive,
          }),
        };

      case 'delete':
        await fs.remove(scope, p.path, p.recursive);
        return { success: true };

      case 'mkdir':
        await fs.makeDir(scope, p.path);
        return { success: true };

      case 'move':
        await fs.movePath(scope, p.from, p.to);
        return { success: true };

      case 'stat':
        return { success: true, data: await fs.stat(scope, p.path) };

      case 'stats':
        return { success: true, data: await fs.getStats(scope) };

      case 'clear':
        await fs.clearWorkspace(scope);
        return { success: true };

      default:
        return { success: false, error: `Unknown workspace op` };
    }
  } catch (e: unknown) {
    return { success: false, error: describeError(e, p) };
  }
}

/**
 * Turn a filesystem rejection into something the agent can act on.
 *
 * OPFS reports a missing intermediate directory and a missing file with the same
 * bare `NotFoundError`, whose message names no path at all. Handed back verbatim,
 * the AI cannot tell "you have not created this yet" from "you typed the name wrong",
 * so it tends to retry the identical call.
 */
function describeError(e: unknown, payload: { op: string } & Record<string, any>): string {
  if (e instanceof PathError) return e.message;

  if (e instanceof DOMException) {
    const target = payload.path ?? payload.from ?? '';
    switch (e.name) {
      case 'NotFoundError':
        return `Not found: "${target}". Check the path with list or glob first.`;
      case 'TypeMismatchError':
        return `"${target}" is a directory, not a file (or the reverse).`;
      case 'InvalidModificationError':
        return `"${target}" is not empty — pass recursive to delete it.`;
      case 'NoModificationAllowedError':
        return `"${target}" is locked by another operation still in flight.`;
      case 'QuotaExceededError':
        return 'Out of storage quota. Delete files from the workspace first.';
      default:
        return `${e.name}: ${e.message}`;
    }
  }

  return (e as Error)?.message ?? String(e);
}
