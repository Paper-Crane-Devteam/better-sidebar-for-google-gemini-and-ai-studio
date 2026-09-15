import { GEMINI_BACKFILL_FETCH } from '@/shared/constants/backfill';
import { Platform } from '@/shared/types/platform';
import { BackfillRunner } from '../../shared/backfill/runner';

/**
 * Gemini side of the silent history backfill.
 *
 * Writes through `UPSERT_MESSAGES`, the same path the chat-content interceptor
 * uses. Gemini's transcript carries stable per-message ids and real timestamps, so
 * an upsert is exact: re-reading a conversation updates what changed and adds what
 * is new, without disturbing the order of what was already there.
 *
 * Nothing here touches the `conversations` row. A backfill has no opinion about
 * the title, the folder or whether the chat is deleted — it only knows the
 * transcript.
 */
export const geminiBackfillRunner = new BackfillRunner({
  platform: Platform.GEMINI,
  fetchEvent: GEMINI_BACKFILL_FETCH,
  async save(candidate, result) {
    const response = await browser.runtime.sendMessage({
      type: 'UPSERT_MESSAGES',
      platform: Platform.GEMINI,
      payload: {
        conversationId: candidate.id,
        messages: result.messages ?? [],
      },
    });
    if (!response?.success) {
      throw new Error(response?.error || 'UPSERT_MESSAGES failed');
    }
  },
});
