import { AISTUDIO_BACKFILL_FETCH } from '@/shared/constants/backfill';
import { Platform } from '@/shared/types/platform';
import { BackfillRunner } from '../../shared/backfill/runner';

/**
 * AI Studio side of the silent history backfill.
 *
 * `REPLACE_MESSAGES` rather than an upsert: AI Studio's transcript has no
 * per-message ids, so there is no key to match rows on. The response is the whole
 * prompt, though, so replacing is not lossy — it is the same thing the normal
 * capture path does when the page saves a prompt.
 *
 * Deliberately not `SAVE_CONVERSATION`, which is what the interceptor path uses:
 * that statement also clears `deleted_at` and rewrites the title. Fine when the
 * user is looking at the prompt, wrong for unattended work — a chat deleted while
 * a backfill was in flight would come back.
 */
export const aiStudioBackfillRunner = new BackfillRunner({
  platform: Platform.AI_STUDIO,
  fetchEvent: AISTUDIO_BACKFILL_FETCH,
  async save(candidate, result) {
    const response = await browser.runtime.sendMessage({
      type: 'REPLACE_MESSAGES',
      platform: Platform.AI_STUDIO,
      payload: {
        conversationId: candidate.id,
        messages: result.messages ?? [],
      },
    });
    if (!response?.success) {
      throw new Error(response?.error || 'REPLACE_MESSAGES failed');
    }
  },
});
