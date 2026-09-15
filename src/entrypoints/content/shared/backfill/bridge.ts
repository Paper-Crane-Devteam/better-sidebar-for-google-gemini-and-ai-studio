/**
 * Content script → main world round trip for one conversation's transcript.
 *
 * `CustomEvent` on `window` is the only channel between the two: they share the
 * DOM but not the JS context, and only the main world holds the captured request
 * parameters. Each call carries its own reply event name so concurrent calls
 * cannot pick up each other's answers — though the scheduler issues them one at a
 * time anyway.
 */

import type { BackfillFetchResult } from '@/shared/constants/backfill';

/**
 * Generous, because a long conversation is paginated and paced on the far side.
 * The point is not to catch slow answers but to make sure a *lost* one cannot
 * wedge the scheduler: the promise has to settle for the cycle to end.
 */
const REPLY_TIMEOUT_MS = 120_000;

export function requestTranscript(
  fetchEvent: string,
  conversationId: string,
): Promise<BackfillFetchResult> {
  return new Promise((resolve) => {
    const callbackEvent = `BETTER_SIDEBAR_BACKFILL_REPLY_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    let settled = false;
    const finish = (result: BackfillFetchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      window.removeEventListener(callbackEvent, onReply);
      resolve(result);
    };

    const onReply = (e: Event) => {
      finish(((e as CustomEvent).detail as BackfillFetchResult) ?? { ok: false, reason: 'error' });
    };

    const timeoutId = setTimeout(
      () => finish({ ok: false, reason: 'error', detail: 'timeout' }),
      REPLY_TIMEOUT_MS,
    );

    window.addEventListener(callbackEvent, onReply);
    window.dispatchEvent(
      new CustomEvent(fetchEvent, { detail: { conversationId, callbackEvent } }),
    );
  });
}
