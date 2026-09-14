/**
 * Deduplication of messages in the conversation messages store.
 *
 * Finds and deletes duplicate messages that have synthetic IDs (UUID/hex)
 * when a copy with a native platform ID exists with the same content.
 * This is primarily relevant for Gemini where messages come from both
 * the interceptor (with native r_xxx IDs) and DB bulk inserts (with hex IDs).
 *
 * For AI Studio this is a no-op (no duplicates exist).
 */

import { browser } from 'wxt/browser';

/**
 * Native platform IDs (e.g. Gemini's "r_xxx" / "rc_xxx") don't match
 * the patterns of generated IDs (32-char hex or UUID v4).
 */
function looksLikeNativeId(id: string): boolean {
  return (
    !/^[0-9A-F]{32}$/i.test(id) &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

/**
 * Find and delete duplicate messages that have synthetic IDs when a copy
 * with a native platform ID exists with the same content.
 *
 * Returns the list of deleted IDs so the caller can exclude them.
 */
export async function dedupModelMessages(messages: any[]): Promise<string[]> {
  // Group all messages by trimmed content (both user and model)
  const contentGroups = new Map<string, any[]>();
  for (const m of messages) {
    if (!m.content) continue;
    const key = `${m.role}:${m.content.trim()}`;
    const arr = contentGroups.get(key) || [];
    arr.push(m);
    contentGroups.set(key, arr);
  }

  const idsToDelete: string[] = [];
  for (const [, group] of contentGroups) {
    if (group.length <= 1) continue;
    const hasNativeId = group.some((m: any) => looksLikeNativeId(m.id));
    if (hasNativeId) {
      for (const m of group) {
        if (!looksLikeNativeId(m.id)) {
          idsToDelete.push(m.id);
        }
      }
    }
  }

  if (idsToDelete.length > 0) {
    // Callers pass the rows of a single conversation, so any row carries the id.
    const conversationId = messages.find((m) => m.conversation_id)?.conversation_id;
    if (!conversationId) {
      console.warn('ConversationMessages: no conversation_id on rows, skipping dedup');
      return [];
    }

    console.log('ConversationMessages: Cleaning duplicate messages:', idsToDelete);

    // DELETE_MESSAGES_BY_IDS rather than raw SQL: it binds parameters and scopes
    // the statement to one conversation. Both matter now that message ids repeat
    // across branched conversations — an unscoped `id IN (...)` would delete the
    // copies living in other conversations too.
    const response = await browser.runtime.sendMessage({
      type: 'DELETE_MESSAGES_BY_IDS',
      payload: { conversationId, ids: idsToDelete },
    });
    if (!response?.success) {
      console.error('ConversationMessages: dedup delete failed', response?.error);
      return [];
    }
  }

  return idsToDelete;
}
