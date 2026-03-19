import { browser } from 'wxt/browser';

/**
 * Gemini native message IDs typically start with "r_" or "rc_" prefixes.
 * DB bulkInsert/generate IDs are 32-char uppercase hex or UUID v4 strings.
 */
function looksLikeGeminiId(id: string): boolean {
  return (
    !/^[0-9A-F]{32}$/i.test(id) &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

/**
 * Find and delete duplicate messages (both user and model) that have
 * fake IDs (UUID/hex) when a copy with a real Gemini ID exists with
 * the same content.
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
    const hasRealId = group.some((m: any) => looksLikeGeminiId(m.id));
    if (hasRealId) {
      for (const m of group) {
        if (!looksLikeGeminiId(m.id)) {
          idsToDelete.push(m.id);
        }
      }
    }
  }

  if (idsToDelete.length > 0) {
    console.log('SmartScrollbar: Cleaning duplicate messages:', idsToDelete);
    const placeholders = idsToDelete.map((id) => `'${id}'`).join(',');
    await browser.runtime.sendMessage({
      type: 'EXECUTE_SQL',
      payload: {
        sql: `DELETE FROM messages WHERE id IN (${placeholders})`,
      },
    });
  }

  return idsToDelete;
}
