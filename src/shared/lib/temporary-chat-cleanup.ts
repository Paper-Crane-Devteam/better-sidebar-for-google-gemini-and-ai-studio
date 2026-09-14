import { runQuery, runCommand } from '../db';

/**
 * Purges expired Gemini temporary chats.
 *
 * ── Why Gemini only ─────────────────────────────────────────────────────────
 * Gemini genuinely does not keep temporary chats, so they exist in exactly one
 * place: our database. Nothing can bring a purged row back, which is what makes
 * deleting safe — and what makes it worth doing, since the rows are invisible by
 * design and would otherwise accumulate forever.
 *
 * AI Studio is the opposite case and is deliberately excluded. Our "temporary
 * chat" there is only a sidebar-side flag; the prompt itself lives in the user's
 * Drive and a library scan will re-import it. Deleting the row would strip the one
 * thing marking it as temporary, so the next scan would resurrect it as a normal,
 * fully visible conversation — the exact outcome the feature exists to prevent.
 * The marked row is load-bearing there and has to be kept indefinitely.
 *
 * ── Why hard delete ─────────────────────────────────────────────────────────
 * The usual `conversationRepo.delete` is a soft delete, which serves sync (other
 * devices need to learn about the removal). Temporary chats never sync as anything
 * a user can act on, and a tombstone would leave exactly the row growth this is
 * meant to stop.
 */

/** How long a Gemini temporary chat is kept before it is purged. */
const RETENTION_DAYS = 7;

const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

/** Minimum gap between runs, so a service-worker restart loop cannot thrash the DB. */
const MIN_RUN_INTERVAL_MS = 12 * 60 * 60 * 1000;

const LAST_RUN_KEY = 'better-sidebar-temp-chat-purge-last-run';

/**
 * Rows older than the cutoff, by whichever timestamp we actually have.
 *
 * `last_active_at` rather than `created_at`: a temporary chat the user is still
 * using should not vanish mid-conversation just because it started a week ago.
 * `created_at` is nullable on paths that never observed a creation time, so it is
 * only a fallback.
 */
const expiredIdsSql = `
  SELECT id FROM conversations
  WHERE platform = 'gemini'
    AND is_temporary = 1
    AND COALESCE(last_active_at, created_at, 0) < ?
`;

/**
 * Delete one conversation and everything hanging off it.
 *
 * Messages are removed explicitly instead of leaning on `ON DELETE CASCADE`
 * because the FTS index is maintained by an `AFTER DELETE ON messages` trigger.
 * Deleting them directly makes it unambiguous that the trigger fires and the
 * conversation's text leaves the search index with it.
 */
async function purgeConversation(id: string): Promise<void> {
  await runCommand('DELETE FROM messages WHERE conversation_id = ?', [id]);
  await runCommand('DELETE FROM conversation_tags WHERE conversation_id = ?', [id]);
  await runCommand(
    "DELETE FROM favorites WHERE target_type = 'conversation' AND target_id = ?",
    [id],
  );
  await runCommand('DELETE FROM conversations WHERE id = ?', [id]);
}

/**
 * Remove Gemini temporary chats past their retention window.
 *
 * Safe to call on every service-worker startup: it self-throttles via a stored
 * timestamp, so the real work happens at most twice a day no matter how often the
 * worker is woken.
 *
 * @returns how many conversations were purged.
 */
export async function purgeExpiredTemporaryChats(): Promise<number> {
  const now = Date.now();

  try {
    const stored = await browser.storage.local.get(LAST_RUN_KEY);
    const lastRun = Number(stored?.[LAST_RUN_KEY] ?? 0);
    if (lastRun && now - lastRun < MIN_RUN_INTERVAL_MS) return 0;
  } catch (e) {
    // A throttle we cannot read is not a reason to skip the purge; worst case it
    // runs more often than intended.
    console.warn('[TempChatPurge] Could not read last-run timestamp:', e);
  }

  const cutoff = Math.floor(now / 1000) - RETENTION_SECONDS;

  let purged = 0;
  try {
    const rows = await runQuery(expiredIdsSql, [cutoff]);
    const ids = (rows as { id: string }[]).map((r) => r.id);

    for (const id of ids) {
      try {
        await purgeConversation(id);
        purged += 1;
      } catch (e) {
        // One bad row should not abort the rest of the sweep.
        console.error(`[TempChatPurge] Failed to purge ${id}:`, e);
      }
    }

    if (purged > 0) {
      console.log(
        `[TempChatPurge] Purged ${purged} Gemini temporary chat(s) older than ${RETENTION_DAYS} days`,
      );
    }
  } catch (e) {
    console.error('[TempChatPurge] Sweep failed:', e);
    // Not recording the run lets the next startup retry rather than waiting out
    // the throttle on a failure.
    return purged;
  }

  try {
    await browser.storage.local.set({ [LAST_RUN_KEY]: now });
  } catch (e) {
    console.warn('[TempChatPurge] Could not record last-run timestamp:', e);
  }

  return purged;
}
