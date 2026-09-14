/**
 * Stage ① — wait for the AI's answer to finish streaming.
 *
 * All the hard detection work lives in the platform adapter; this stage only owns
 * the timeout policy and the status/event bookkeeping around it.
 */

import { responseWaitFailureOf } from '../../adapters/response-wait';
import type { LoopContext } from '../context';

/**
 * How long the page may show **no sign of life** before the loop gives up.
 *
 * Idle time, not total time: the adapter pushes this back on every sign the turn is
 * alive (text growing, composer button reading "stop generating"). So a model that
 * thinks for ten minutes and then writes for another five never trips it, and only
 * real silence does.
 *
 * This used to be a total timeout of 60s, which killed long answers mid-generation
 * and reported them as "AI response timed out" — a Pro model with thinking on passes
 * 60s routinely.
 *
 * A timeout is still needed, because the completion signal can genuinely never
 * arrive: the platform erroring out or rate-limiting means no turn ever completes, and
 * `adapter.getComposerState()` can degrade to `'unknown'` if the platform renames its
 * classes. Without this the engine would sit in `waiting_ai` forever with only Stop as
 * a way out, and no explanation.
 */
export const RESPONSE_IDLE_TIMEOUT_MS = 30000;

/**
 * - `response` — the finished turn, ready for stage ②.
 * - `stalled` — already paused with a reason; the caller just returns.
 * - `undelivered` — there is nothing to wait for, because the message never reached
 *   the model. **Not** paused here: only the engine knows whether it still holds a
 *   payload it can re-send, and that decides both what to say and what Retry does.
 */
export type AwaitOutcome =
  | { kind: 'response'; element: HTMLElement }
  | { kind: 'stalled' }
  | { kind: 'undelivered' };

export async function awaitAIResponse(ctx: LoopContext): Promise<AwaitOutcome> {
  ctx.setStatus('waiting_ai');
  ctx.events.emit('ai:response-waiting', undefined);
  ctx.events.emit('loop:round-started', { round: ctx.round });
  console.log(`[AgentLoop] Round ${ctx.round}: Waiting for AI response...`);

  try {
    const element = await ctx.adapter.observeAIResponseComplete(RESPONSE_IDLE_TIMEOUT_MS);
    return { kind: 'response', element };
  } catch (e) {
    // An idle page with no turn in it is a different failure from a slow one, and
    // saying "no response for 30s" about a message that never arrived sent users
    // looking for a problem at Gemini's end.
    if (responseWaitFailureOf(e) === 'not_delivered') {
      console.warn('[AgentLoop] Nothing to wait for — the message never reached the AI');
      return { kind: 'undelivered' };
    }

    console.warn('[AgentLoop] AI response went silent');
    ctx.events.emit('ai:response-timeout', { timeoutMs: RESPONSE_IDLE_TIMEOUT_MS });
    ctx.pause(
      `No response from the AI for ${RESPONSE_IDLE_TIMEOUT_MS / 1000}s. Click "Retry" to try again.`,
      'AI response timeout',
    );
    return { kind: 'stalled' };
  }
}
