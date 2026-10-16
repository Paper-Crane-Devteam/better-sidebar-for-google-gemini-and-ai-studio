import type { RpcCall } from '../lib/batchexecute';
import { classifyChatParentId } from '@/shared/lib/gemini-context';
import { trace } from '@/shared/lib/trace';

/**
 * `MaZiqc` — a page of the chat list.
 *
 * Response `[_, _, [item, …]]`, each item
 * `["c_<id>", "<title>", _, _, _, [seconds, nanos], _, <parent id>, …]`:
 *
 * - `[5]` is the LAST ACTIVE time, not creation. The list exposes no creation
 *   timestamp at all, so never map this into `created_at` downstream.
 * - `[7]` is the parent when the chat belongs to a gem or a notebook; notebook ids
 *   arrive as `notebooks/<uuid>`.
 */
export function handleListChat(call: RpcCall): void {
  const list = (call.response as any)?.[2];
  const items: Record<string, unknown>[] = [];

  if (Array.isArray(list)) {
    for (const chat of list) {
      const id = chat?.[0];
      if (typeof id !== 'string' || !id) continue;

      const time = chat?.[5];
      const { gemId, notebookId } = classifyChatParentId(chat?.[7]);
      items.push({
        id: id.replace(/^c_/, ''),
        title: chat?.[1],
        last_active_at: Array.isArray(time) && time.length > 0 ? time[0] : null,
        type: notebookId ? 'notebook' : gemId ? 'gem' : 'conversation',
        gem_id: gemId,
        notebook_id: notebookId,
      });
    }
  }

  if (items.length > 0) {
    console.log(`Better Sidebar (Gemini): Parsed ${items.length} chats`);
    trace('Better Sidebar (Gemini): Parsed chats:', items);
  }

  // Dispatched even when empty: an empty page is still an answer the scanner waits on.
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_LIST_CHAT_RESPONSE', {
      detail: { items, originalUrl: call.url },
    }),
  );
}
