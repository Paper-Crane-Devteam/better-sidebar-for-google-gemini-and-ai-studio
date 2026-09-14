/**
 * "Has the AI finished talking?" — the one implementation, for every platform.
 *
 * Extracted from `gemini-adapter` when AI Studio arrived. Nothing in here was
 * Gemini-specific: every platform we support runs the same Angular-ish composer with
 * one control that flips between send and stop, and every one of the failure modes
 * this guards against was a property of *streaming into a DOM*, not of Gemini. A
 * second copy would have been a second place to relearn all of them.
 *
 * The three platform-specific reads are passed in (`Probe`); the judgement below is
 * shared.
 *
 * ─── How it decides ─────────────────────────────────────────────────────────────
 *
 * The primary signal is the send control's **edge**: it reads "stop" while a turn is
 * in flight, so watching it go back is watching generation end. Level, not edge,
 * would be wrong — we start waiting right after clicking send, and the control hasn't
 * flipped to "stop" yet at that instant, so "it says send" is true before anything
 * has happened.
 *
 * Text sampling is still here, demoted to two jobs:
 *
 * 1. **Guard.** The text has to differ from the turn that existed when we started, or
 *    a fast-looking edge would hand back the previous answer.
 * 2. **Fallback.** Reading the control is a cascade over the platform's own class
 *    names and can end up at `'unknown'` if they change it. Making it the sole signal
 *    would mean one redesign kills the feature outright, in the worst possible shape:
 *    a promise that never settles.
 *
 * Two historical failure modes this has to keep avoiding:
 *
 * - Resolving on a *partial* stream. Generation pauses >500ms mid-answer, so a plain
 *   debounce said "done"; the half-written response had no tool call, and the engine
 *   read that as task completion on round 1.
 * - Never resolving, because a streaming heuristic latched onto a stale node.
 *
 * The timeout is **idle time, not total time**. Anything that proves the page is
 * alive (text changing, the control reading "stop") pushes it back, so a model that
 * thinks for ten minutes is fine and only real silence gives up.
 */

import type { ComposerState } from './types';
import { ResponseWaitError } from './response-wait';

/** How often the page is sampled while waiting for a response to settle */
const RESPONSE_SAMPLE_MS = 400;

/**
 * Samples the text must hold still for after generation ends.
 *
 * The control flips back the moment the stream closes, but the page is still
 * rendering markdown and code blocks — reading at the exact flip can catch a
 * half-rendered tail, which then gets parsed as if it were the whole response.
 */
const SETTLE_TICKS = 2;

/**
 * Samples the text must hold still for when the control can't be read at all.
 *
 * Stricter than `SETTLE_TICKS` because there is no authoritative signal backing it
 * up: mid-stream pauses of a second do happen, so this has to outlast them.
 */
const BLIND_SETTLE_TICKS = 5;

/**
 * How long a completely idle page is given before we call the message undelivered.
 *
 * "Idle" here is specific: the composer reports `absent` (nothing generating, nothing
 * typed) *and* no new turn since we started waiting. Nothing is in flight and nothing
 * arrived, so no amount of extra waiting will change the outcome.
 *
 * A grace period is still kept, but only out of caution — measured behaviour is that
 * the control flips to `stop` the instant a send is accepted, even on a throttled
 * connection, so this window never has to cover "sent but not started yet". It covers
 * the tail of our own click and Angular's re-render, which is far shorter.
 */
const IDLE_DELIVERY_GRACE_MS = 5000;

export interface ResponseSettleProbe {
  /** Read the composer's send control */
  getComposerState(): ComposerState;
  /** The newest AI response container, or null when there is none yet */
  getLastResponse(): HTMLElement | null;
  /** Plain text of a response container */
  extractText(el: HTMLElement): string;
}

/**
 * Resolve once the newest AI response has finished, or reject with
 * `ResponseWaitError` describing which way it failed.
 */
export function waitForResponseToSettle(
  probe: ResponseSettleProbe,
  idleTimeoutMs: number,
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    // Snapshot the response that already exists when we start waiting, so the
    // previous turn's answer is never mistaken for the new one.
    const baselineElement = probe.getLastResponse();
    const baselineText = baselineElement ? probe.extractText(baselineElement).trim() : '';

    const isStaleResponse = (el: HTMLElement, text: string): boolean =>
      el === baselineElement && text === baselineText;

    /** Set once the control has been seen in "stop" — i.e. this turn really started */
    let sawGenerating = false;
    let lastText = '';
    let stableTicks = 0;
    let deadline = Date.now() + idleTimeoutMs;
    const startedAt = Date.now();

    const cleanup = () => clearInterval(interval);

    /** Any proof the turn is alive postpones giving up */
    const keepAlive = () => {
      deadline = Date.now() + idleTimeoutMs;
    };

    const tick = () => {
      // Checked once, up front: every branch below either calls `keepAlive` or is by
      // definition a sample where nothing happened. Settling takes ~1s from the last
      // change, so this can't cut off a turn that was about to resolve.
      if (Date.now() > deadline) {
        cleanup();
        reject(new ResponseWaitError('timeout', 'AI response timeout'));
        return;
      }

      const composerState = probe.getComposerState();

      // ── Still generating: nothing to decide, just stay alive ────────────────
      if (composerState === 'stop') {
        sawGenerating = true;
        stableTicks = 0;
        keepAlive();
        return;
      }

      const response = probe.getLastResponse();
      const text = response ? probe.extractText(response).trim() : '';

      // Empty means the bubble exists but nothing has streamed in yet; stale means
      // we're still looking at the turn that was there before we started waiting.
      const hasNewTurn = !!response && !!text && !isStaleResponse(response, text);

      // ── Nothing in flight and nothing arrived ───────────────────────────────
      // `absent` means the composer is idle. Combined with "no turn started since we
      // began waiting", there is nothing that could still produce an answer, so
      // waiting out the full silence budget only delays a wrong verdict: the message
      // never reached the model.
      if (
        !hasNewTurn &&
        !sawGenerating &&
        composerState === 'absent' &&
        Date.now() - startedAt > IDLE_DELIVERY_GRACE_MS
      ) {
        cleanup();
        reject(
          new ResponseWaitError(
            'not_delivered',
            'The page is idle and no new turn started — the message was never delivered',
          ),
        );
        return;
      }

      if (!response || !hasNewTurn) {
        lastText = '';
        stableTicks = 0;
        return;
      }

      // Text is moving — the answer is arriving, whatever the control says.
      if (text !== lastText) {
        lastText = text;
        stableTicks = 0;
        keepAlive();
        return;
      }

      stableTicks++;

      // Past the edge: we watched it generate and the control has come back, so a
      // couple of still samples are only to let the final render land.
      //
      // `absent` counts as the same evidence: with a new turn on screen it says the
      // turn is over just as well as watching the flip does. That covers the case
      // where we started waiting too late to catch `stop`.
      //
      // Neither of those means the control is unreadable, so text stability is
      // carrying this alone and has to outlast a mid-stream pause.
      const settled = sawGenerating || composerState === 'absent';
      const required = settled ? SETTLE_TICKS : BLIND_SETTLE_TICKS;
      if (stableTicks >= required) {
        cleanup();
        resolve(response);
      }
    };

    const interval = setInterval(tick, RESPONSE_SAMPLE_MS);
  });
}
