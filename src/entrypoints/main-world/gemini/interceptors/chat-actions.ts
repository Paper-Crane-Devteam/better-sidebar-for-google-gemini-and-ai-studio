/**
 * Chat mutations the user makes in Gemini's own UI: delete, rename, branch.
 *
 * Each one is mirrored into the sidebar from the RPC that carries it, so the sidebar
 * never waits for the next list sync to notice.
 */

import type { RpcCall } from '../lib/batchexecute';

const stripC = (id: string) => id.replace(/^c_/, '');

/** `GzXR5e` — request `["c_<id>"]`. The response carries nothing useful. */
export function handleDeleteChat(call: RpcCall): void {
  const rawId = (call.request as any)?.[0];
  if (typeof rawId !== 'string' || !rawId) return;
  const id = stripC(rawId);

  console.log(`Better Sidebar (Gemini): Detected chat deletion: ${id}`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_CHAT_DELETE', { detail: { id, originalUrl: call.url } }),
  );
}

/** `MUAZcd` — response `[_, ["c_<id>", "<new title>"]]`. */
export function handleRenameChat(call: RpcCall): void {
  const rawId = (call.response as any)?.[1]?.[0];
  const newName = (call.response as any)?.[1]?.[1];
  if (typeof rawId !== 'string' || typeof newName !== 'string') return;
  const id = stripC(rawId);

  console.log(`Better Sidebar (Gemini): Detected chat rename: ${id} -> ${newName}`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_CHAT_RENAME', { detail: { id, newName, originalUrl: call.url } }),
  );
}

/**
 * `KDNZr` — branch a conversation at one message into a new conversation.
 *
 * Nothing else signals it: no generation, no rename, and the chat list is not
 * re-fetched, so without this a branch stays invisible until the page reloads.
 *
 * Request `["c_<source>", "r_<message branched at>"]`. Response `[[entry]]`, the new
 * conversation's own list entry:
 *
 *   [0]  "c_<new id>"
 *   [1]  title (Gemini prefixes the source title with "Branch • ")
 *   [5]  [seconds, nanos] creation time
 *   [17] [<r_ id>, "c_<source>", "r_<branch point>", <source title>]
 *
 * [17][1] and [17][2] echo the request, which is what makes the lineage trustworthy
 * rather than inferred. [17][0] is passed through unread rather than guessed at.
 */
export function handleBranchChat(call: RpcCall): void {
  const entry = (call.response as any)?.[0];
  if (!Array.isArray(entry)) {
    console.warn('Better Sidebar (Gemini): Branch response had no entry', call.response);
    return;
  }

  const rawId = entry[0];
  if (typeof rawId !== 'string' || !rawId) return;
  const id = stripC(rawId);
  const title = typeof entry[1] === 'string' ? entry[1] : null;

  // Seconds only: `conversations.created_at` is unix seconds everywhere.
  const time = entry[5];
  const createdAt =
    Array.isArray(time) && typeof time[0] === 'number' ? time[0] : Math.floor(Date.now() / 1000);

  const lineage = Array.isArray(entry[17]) ? entry[17] : [];
  const sourceConversationId = typeof lineage[1] === 'string' ? stripC(lineage[1]) : null;
  const sourceMessageId = typeof lineage[2] === 'string' ? lineage[2] : null;
  const sourceTitle = typeof lineage[3] === 'string' ? lineage[3] : null;

  console.log(
    `Better Sidebar (Gemini): Detected branch ${sourceConversationId ?? '?'} -> ${id}`,
    { title, createdAt, sourceMessageId, sourceTitle },
  );
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_CHAT_BRANCH', {
      detail: {
        id,
        title,
        createdAt,
        sourceConversationId,
        sourceMessageId,
        sourceTitle,
        originalUrl: call.url,
      },
    }),
  );
}
