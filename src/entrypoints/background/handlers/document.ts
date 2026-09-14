/**
 * DOCUMENT_OP handler — a pass-through, and nothing more.
 *
 * The background does no parsing. It exists on this path for one reason: a content script
 * cannot talk to the offscreen document (responses travel over `runtime.sendMessage`,
 * which never lands in a content script), so something at the extension origin has to
 * relay. That is the whole job.
 *
 * ⚠️ Deliberately *not* placed behind `ensureDbReady()` in `message-handler.ts`, for the
 * same reason `handleWorkspace` is not: documents live in OPFS, so a database that is
 * still opening — or has failed to open — must not stop the agent from reading a file.
 */

import type { ExtensionMessage, ExtensionResponse } from '@/shared/types/messages';
import { runDocumentOp } from '@/shared/documents/bridge';

export async function handleDocument(
  message: ExtensionMessage,
): Promise<ExtensionResponse | null> {
  if (message.type !== 'DOCUMENT_OP') return null;

  try {
    const data = await runDocumentOp(message.workspaceId, message.payload);
    return { success: true, data };
  } catch (e: unknown) {
    // The worker already phrases its failures for the agent to read (see
    // `doc-worker.ts`'s `describe`), so this passes the message through rather than
    // wrapping it in another layer of "an error occurred".
    return { success: false, error: (e as Error)?.message ?? String(e) };
  }
}
