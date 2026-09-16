/**
 * Stage ④ — get the round's results back to the AI.
 *
 * Three steps: stage the payload in the composer, park in `awaiting_send`, then
 * either click send or leave it to the user. Sending always goes through the real
 * send button so the capsule-merging interceptor runs.
 *
 * Who clicks is the caller's decision, passed in as `autoSend` — it follows from
 * whether anything this round needed approval (see `shouldAutoSend`). There used to
 * be a persisted `autoContinue` switch here instead, which could disagree with the
 * approval settings: approve a write by hand, and the results still went out on
 * their own.
 *
 * Stateful, unlike the other stages: between the stage and the confirmed send there
 * is a payload in limbo, and `resume` / `continueNow` need to know about it. That
 * pending text is the difference between "retry sends the results" and "retry waits
 * forever for an answer nobody asked for".
 */

import type { LoopContext } from '../../context';
import { toolCallRecorder } from '../../../records';
import { isStaged, stageResults, type StagedShape } from './staging';
import { waitForSend, type SendOutcome } from './send-watcher';
import { safeBrowserText, useBrowserAgent } from '../../../browser/browser-store';

export { formatResults, wrapForAI, RESULT_OPEN_TAG } from './formatter';

export class ResultHandoff {
  private shape: StagedShape = 'capsule';

  /** Staged but not yet confirmed sent — kept so a retry can re-stage it */
  private pending: string | null = null;

  /**
   * The round `pending` reports on.
   *
   * Tracked separately from the store's current round because the two drift apart on
   * every retry path: the loop can advance, pause, and come back to deliver results
   * that belong to an earlier round. The ledger has to close out that round, not
   * whichever one happens to be current when the send finally lands.
   */
  private pendingRound: number | null = null;

  /**
   * The last payload that *was* confirmed delivered.
   *
   * Kept because delivery being confirmed still doesn't guarantee the model answers:
   * Gemini can accept a message and then produce nothing (rate limit, an error toast).
   * When stage ① finds the page idle with no turn to wait for, this is what makes
   * Retry re-send the report instead of re-entering the same empty wait.
   */
  private lastDelivered: string | null = null;

  constructor(private readonly ctx: LoopContext) {}

  /** Whether a payload is still waiting to reach the AI */
  hasPending(): boolean {
    return this.pending !== null;
  }

  /**
   * Queue the last delivered payload for another attempt, for when a message landed
   * but the model never took its turn. Returns false when there is nothing to re-send
   * — round 1 follows the user's own prompt, which the handoff never saw.
   */
  rearmLastDelivered(): boolean {
    if (this.pending !== null) return true;
    if (this.lastDelivered === null) return false;
    this.pending = this.lastDelivered;
    console.log('[AgentLoop] Re-arming the last delivered results for another attempt');
    return true;
  }

  /** Whether the payload is still sitting in the composer */
  isStagedInEditor(): boolean {
    return isStaged(this.ctx.adapter, this.shape);
  }

  /**
   * Full stage-④ run. Returns false when the payload never made it out — the caller
   * must stop the loop then, because waiting for a reply to an undelivered message
   * is the "hangs until timeout" failure mode.
   *
   * `autoSend: false` stages the payload and waits: the user is already here, having
   * just approved something, so the send is theirs. The watcher stays armed either
   * way, so pressing Enter in the composer is picked up exactly like our own click.
   */
  async deliver(text: string, autoSend: boolean): Promise<boolean> {
    /**
     * ⚠️ The last point at which a URL can still be withheld.
     *
     * Everything past this line becomes a permanent message in the user's conversation, which
     * the AI provider sees — so "don't send my URLs" has to be enforced here rather than at
     * each tool. The settings are re-read first, deliberately: the redaction switch is in a
     * separate popup window, and someone who turns it on while a task is mid-flight means it
     * for the results that have not gone out yet.
     */
    if (this.ctx.store.activeAgentId === 'browser') {
      await useBrowserAgent.getState().refresh();
      text = safeBrowserText(text);
    }
    this.ctx.setStatus('sending');
    console.log('[AgentLoop] Inserting results into editor, length:', text.length);

    this.pending = text;
    this.pendingRound = this.ctx.round;
    this.shape = await stageResults(this.ctx.adapter, text);

    // A normal checkpoint, not a fault — hence its own status. The flag says whether
    // it's the user's send or ours, so the UI doesn't ask for a keypress it's about to
    // perform itself.
    this.ctx.store.awaitSend(!autoSend);
    this.ctx.events.emit('loop:paused', { reason: 'Waiting for user to send results' });

    let clicked = true;
    const outcome = await this.watchSend(async () => {
      if (autoSend) clicked = await this.ctx.adapter.triggerSend();
    });

    if (outcome !== 'sent') {
      console.warn('[AgentLoop] Results were never confirmed as sent, pausing:', outcome);
      this.ctx.pause(describeMiss(outcome, clicked), 'Results not sent');
      return false;
    }

    this.settle();
    return true;
  }

  /**
   * Remember a payload the AI is owed, without touching the composer.
   *
   * Used when a guard stops the round mid-way. `pending` is what makes "Retry" send
   * the report instead of restarting a wait for a message that never went out —
   * `resend()` stages it at that point.
   *
   * Deliberately *not* written to the composer now: the loop is about to pause, and
   * text sitting in the input box invites the user to press Enter, which would
   * deliver it with no engine listening for the reply.
   */
  holdForRetry(text: string): void {
    this.pending = text;
    this.pendingRound = this.ctx.round;
    console.log('[AgentLoop] Holding undelivered results for retry, length:', text.length);
  }

  /**
   * Retry path (Agent tab → Retry). Re-stages the payload first if it is no longer
   * in the composer — staging can fail, and the user can clear the input.
   */
  async resend(): Promise<boolean> {
    if (this.pending === null) return true;

    if (!this.isStagedInEditor()) {
      console.warn('[AgentLoop] Re-staging the unsent results before resuming');
      this.shape = await stageResults(this.ctx.adapter, this.pending);
    }

    const outcome = await this.watchSend(() =>
      this.ctx.adapter.triggerSend({ humanDelay: false }),
    );
    if (outcome !== 'sent') return false;

    this.settle();
    return true;
  }

  /**
   * The payload is out. Clear the in-memory pending state and close the ledger's
   * copy of it.
   *
   * Both directions of the same fact, which is why they live in one method: from here
   * on the conversation carries the results, so the rows no longer need their bodies
   * and must not be offered up as unfinished business on the next page load.
   *
   * ⚠️ Uses the round the results *belong to*, not the current one. `advanceRound` runs
   * after this, but a retry path can reach it later — reading the store's round here
   * would mark the wrong round delivered and leave the real one owed forever.
   */
  private settle(): void {
    const round = this.pendingRound ?? this.ctx.round;
    this.lastDelivered = this.pending;
    this.pending = null;
    this.pendingRound = null;
    toolCallRecorder.markRoundDelivered(round);
  }

  /**
   * User pressed "Continue" at the `awaiting_send` checkpoint.
   * Returns false when there was nothing to send.
   */
  async continueNow(): Promise<boolean> {
    if (!this.isStagedInEditor()) {
      console.warn('[AgentLoop] Continue requested but no staged results in the editor');
      return false;
    }
    // User-initiated, so no artificial pause. `triggerSend` still waits out any
    // in-progress generation so the click can't land on the stop button.
    await this.ctx.adapter.triggerSend({ humanDelay: false });
    return true;
  }

  /** Forget the pending payload (new session) */
  reset(): void {
    this.pending = null;
    this.pendingRound = null;
    this.lastDelivered = null;
    this.shape = 'capsule';
  }

  /**
   * Arm the watcher *before* running `action`, so a send that completes fast can't
   * slip through between the click and the start of observation.
   */
  private async watchSend(action: () => Promise<unknown>): Promise<SendOutcome> {
    // The one gate every send passes through, which is why the stream boundary is
    // recorded here rather than in each caller. It has to happen before `action`:
    // stage ② admits an answer only if its generation is newer than this, and the
    // generation starts the instant the send lands. See `LoopContext.streamBoundary`.
    //
    // Also covers the `autoSend: false` checkpoint, where the user presses send
    // themselves minutes later — the boundary was taken when the watcher was armed,
    // and nothing generates in between.
    this.ctx.markSendBoundary();

    const watcher = waitForSend({
      adapter: this.ctx.adapter,
      shape: this.shape,
      signal: this.ctx.abort.signal,
    });
    await action();
    return watcher;
  }
}

/**
 * Why the payload didn't make it, in words the user can act on. All three end at the
 * same button — a paused loop offers Retry, which re-stages and re-sends.
 */
function describeMiss(outcome: SendOutcome, clicked: boolean): string {
  if (outcome === 'unconfirmed') {
    return 'The chat input was cleared, but no turn ever started — the results most likely never went out. Click "Retry" to send them again.';
  }
  // A refused click means the button was still "stop generating"; not clicking was
  // right, because clicking anyway would have aborted the AI's answer.
  return clicked
    ? 'Tool results were not sent. Click "Retry" to send them.'
    : 'Could not send while the AI was still generating. Click "Retry" to try again.';
}
