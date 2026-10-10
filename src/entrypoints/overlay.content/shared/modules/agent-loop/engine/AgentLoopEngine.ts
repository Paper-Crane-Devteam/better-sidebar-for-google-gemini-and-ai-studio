/**
 * Agent Loop Engine — the state machine, and nothing else.
 *
 * One round is four stages, and this file is only their ordering plus the
 * lifecycle entry points the UI calls (start / stop / resume / continueNow):
 *
 *   ① stages/await-response  wait for the AI to finish answering
 *   ② stages/parse-response  extract tool calls (or end the session)
 *   ③ stages/execute-tools   run them, guarded by the circuit breaker
 *   ④ stages/handoff         send the results back and confirm they left
 *
 * Everything the stages share — store, events, abort, circuit breaker — is reached
 * through `LoopContext`. Guards live in `guards/`, tool-call parsing in `parser/`.
 *
 * Two invariants worth knowing before changing anything here:
 *
 * - **A stage that already reported its own outcome returns a "stop" result.** When
 *   a stage pauses or ends the session it also emits the matching event, so the loop
 *   just returns instead of second-guessing it.
 * - **A failed handoff must stop the loop.** Continuing would wait for a reply to a
 *   message that was never delivered, which looks like a hang until the AI timeout.
 */

import type { AgentPlatformAdapter } from '../adapters/types';
import { isUnattendedAllowed, shouldAutoSend } from '../execution-policy';
import { toolCallRecorder } from '../records';
import { resetSnapshots } from '../undo';
import { LoopContext } from './context';
import { isAbortError } from './guards/abort';
import { awaitAIResponse } from './stages/await-response';
import { parseResponse } from './stages/parse-response';
import { executeTools } from './stages/execute-tools';
import { formatResults, ResultHandoff } from './stages/handoff';
import type { AgentId } from '../agents/types';

/**
 * What a starting session is told about itself.
 *
 * ⚠️ `agentId` is required reading for every entry point, not just `start`. It is what
 * the tool layer checks a call against, so a session that omits it runs as the default
 * agent — which is how a recovered Workspace task ended up being told its own file tools
 * belonged to another agent. The recovery paths derive it from the calls they are
 * replaying; see `mcpRegistry.agentForTools`.
 */
export interface SessionInfo {
  conversationId?: string | null;
  title?: string;
  agentId?: AgentId;
}

export class AgentLoopEngine {
  private readonly ctx: LoopContext;
  private readonly handoff: ResultHandoff;

  /**
   * Rounds in a row that went out without the user touching anything.
   *
   * This, not the total round count, is what `maxRounds` caps — the limit exists to
   * stop a runaway while nobody is watching, and a round the user pressed Enter on
   * had a person in it by definition. So a hands-on session has no ceiling: the user
   * is the brake, and making them clear a "step limit" every twenty rounds is pure
   * friction.
   *
   * Derived from `shouldAutoSend` rather than from the policy switches, which is
   * what makes `speedMode` behave: "don't ask again for this task" leaves
   * `autoRunWrites` off while making the session fully unattended, and reading the
   * switches would have let exactly that case run uncapped.
   */
  private unattendedStreak = 0;

  constructor(adapter: AgentPlatformAdapter) {
    this.ctx = new LoopContext(adapter);
    this.handoff = new ResultHandoff(this.ctx);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Start a session. Call this once the initial prompt has been sent — round 1
   * begins by waiting for the answer to it.
   */
  async start(maxRounds: number = 20, session?: SessionInfo): Promise<void> {
    this.ctx.abort.renew();
    this.ctx.breaker.reset();
    this.handoff.reset();
    this.unattendedStreak = 0;
    // Round 1 follows a prompt that has *already* been sent, so its generation is
    // in flight before the engine exists — no boundary to draw, and none wanted.
    this.ctx.streamBoundary = null;
    this.ctx.responseBaseline = null;
    // Undo covers one task: the previous session's snapshot is no longer something
    // the user could meaningfully revert to once a new task starts changing things.
    resetSnapshots();
    this.ctx.store.start(maxRounds, session);
    toolCallRecorder.startSession({
      conversationId: session?.conversationId,
      title: session?.title,
    });

    console.log('[AgentLoop] Engine started, max rounds:', maxRounds);
    this.ctx.events.emit('loop:started', { maxRounds, timestamp: Date.now() });

    await this.run();
  }

  /**
   * Start a session by picking up an AI response that already exists on the page.
   *
   * Used when the AI has already replied (with tool calls) but the engine wasn't
   * running — e.g. the user sent a follow-up message without `>` after a previous
   * session finished, and Gemini still has the tool format in context.
   *
   * Skips stage ① entirely and feeds the provided element straight into ②→③→④.
   */
  async startFromExistingResponse(
    responseElement: HTMLElement,
    maxRounds: number = 20,
    session?: SessionInfo,
  ): Promise<void> {
    this.ctx.abort.renew();
    this.ctx.breaker.reset();
    this.handoff.reset();
    this.unattendedStreak = 0;
    /**
     * No send of ours precedes this round, so there is no boundary to compare against
     * and stage ② takes whatever finished generation the store holds.
     *
     * Sound because both sides mean "the newest": this path is entered with
     * `getLastAIResponseElement()`, and the stream store only ever holds the newest
     * generation. When the page was reloaded the store is empty instead, and stage ②
     * falls back to the DOM — a degraded read of the right turn, which is the correct
     * trade against a lossless read of the wrong one.
     */
    this.ctx.streamBoundary = null;
    this.ctx.responseBaseline = null;
    resetSnapshots();
    this.ctx.store.start(maxRounds, session);
    toolCallRecorder.startSession({
      conversationId: session?.conversationId,
      title: session?.title,
    });

    console.log('[AgentLoop] Engine started from existing response, max rounds:', maxRounds);
    this.ctx.events.emit('loop:started', { maxRounds, timestamp: Date.now() });

    await this.runFromResponse(responseElement);
  }

  /**
   * Resume a session whose results ran but never reached the AI.
   *
   * The case: a tool was approved and executed, its result was staged in the composer,
   * and the page went away before the send. The work is done and the database already
   * changed — but the payload lived only in that composer, so the AI has no idea, and
   * there is no engine left waiting for a reply.
   *
   * The recovery is to **deliver, not re-execute**. Auto-pickup would do the opposite:
   * it sees a model turn whose tool calls have no matching results and starts a fresh
   * session over them, which for a write means doing it twice. Hence the ledger, and
   * hence this entry point — `payload` is rebuilt from the stored result bodies, so the
   * AI receives what actually happened rather than a repeat of it.
   *
   * ⚠️ Starts a *new* ledger session. The rows being recovered belong to the old one
   * and are settled by conversation id, not by session, so nothing is orphaned; and a
   * new session is the honest description — the rounds ahead are a different run.
   */
  async deliverOwedResults(
    payload: string,
    maxRounds: number = 20,
    session?: SessionInfo,
  ): Promise<boolean> {
    this.ctx.abort.renew();
    this.ctx.breaker.reset();
    this.handoff.reset();
    this.unattendedStreak = 0;
    resetSnapshots();
    this.ctx.store.start(maxRounds, session);
    toolCallRecorder.startSession({
      conversationId: session?.conversationId,
      title: session?.title,
    });

    console.log('[AgentLoop] Delivering results owed from a previous page life');
    this.ctx.events.emit('loop:started', { maxRounds, timestamp: Date.now() });

    // `holdForRetry` then `resend` rather than `deliver`: the payload has to reach the
    // composer and be confirmed sent before the loop may wait for an answer, and that
    // is exactly the sequence the retry path already implements.
    this.handoff.holdForRetry(payload);

    let delivered = false;
    try {
      delivered = await this.handoff.resend();
      if (!delivered) {
        this.ctx.pause(
          'Could not re-send the results from the last run. Send them from the chat input.',
          'Owed results not sent',
        );
        return false;
      }
      this.ctx.advanceRound();
      await this.runRounds();
    } catch (e) {
      if (isAbortError(e)) return delivered;
      console.error('[AgentLoop] Engine error while delivering owed results:', e);
      this.ctx.fail((e as Error).message);
    }

    /**
     * Reports the *send*, not the run.
     *
     * The caller uses this to decide whether the recovered rows are settled, and they
     * are settled the moment the AI has them — whatever the rounds that follow do. An
     * error three rounds later must not put those results back on the owed pile, or the
     * next reload offers to send the AI something it already read.
     */
    return delivered;
  }

  /** Stop the loop; the pending wait unwinds through its abort signal */
  stop(): void {
    console.log('[AgentLoop] Engine stopped by user');
    const totalRounds = this.ctx.round;
    this.ctx.abort.abort();
    this.ctx.finish('user_stop', totalRounds);
  }

  /**
   * Retry after a guard stopped the loop (timeout, breakpoint, circuit breaker, max
   * rounds) or after an error.
   *
   * If the previous round's results never went out they are sent first, otherwise
   * the loop would wait for an answer to a message the AI never received.
   */
  async resume(): Promise<void> {
    if (this.ctx.status !== 'paused' && this.ctx.status !== 'error') return;

    this.ctx.store.resume();
    this.ctx.abort.renew();

    // The user looked at the problem and chose to continue, so the guards start over.
    // Without this a session paused by the breaker re-trips on its very next failure,
    // and Retry buys exactly one tool call. `maxRounds` still bounds the session, and
    // a human clicking Retry each time is not a runaway.
    this.ctx.breaker.reset();

    // Same reasoning for the unattended budget: continuing past the step limit is an
    // explicit "yes, keep going", so it starts over rather than stopping again at once.
    this.unattendedStreak = 0;

    if (this.handoff.hasPending()) {
      const sent = await this.handoff.resend().catch((e) => {
        if (isAbortError(e)) return false;
        throw e;
      });
      if (!sent) {
        this.ctx.pause('Could not send the staged results. Send them from the chat input.');
        return;
      }
      this.ctx.advanceRound();
    }

    await this.run();
  }

  /**
   * Send the results waiting at the `awaiting_send` checkpoint.
   * Only valid in that state — the running loop is already watching for the send.
   */
  async continueNow(): Promise<void> {
    if (this.ctx.status !== 'awaiting_send') return;

    if (!(await this.handoff.continueNow())) {
      // No payload in the composer, so there is no send button to click either.
      this.ctx.pause('The tool results are no longer in the chat input. Click "Retry" to re-send them.');
    }
  }

  /**
   * Stage ① found an idle page with no turn to wait for: the message never got
   * through, or Gemini took it and produced nothing (rate limit, error toast).
   *
   * Re-arming the last delivered payload is what makes Retry mean something here.
   * Without it, Retry re-enters the same wait against the same silence, which is the
   * "I clicked Retry and nothing happened" report.
   */
  private reportUndelivered(): void {
    const canResend = this.handoff.rearmLastDelivered();
    this.ctx.pause(
      canResend
        ? 'The AI never took its turn, so the last message probably did not get through. Click "Retry" to send it again.'
        : 'The AI never took its turn — the message did not get through. Send it again from the chat input.',
      'Message not delivered',
    );
  }

  // ── The loop ───────────────────────────────────────────────────────────────

  /** Wrap `runRounds` so an abort ends the session quietly and anything else reports */
  private async run(): Promise<void> {
    try {
      await this.runRounds();
    } catch (e) {
      if (isAbortError(e)) return;
      console.error('[AgentLoop] Engine error:', e);
      this.ctx.fail((e as Error).message);
    }
  }

  /**
   * Like `run`, but the first round skips ① and uses the given element for ②.
   * After that first round completes normally (or the session ends), subsequent
   * rounds proceed through the standard ①→②→③→④ loop.
   */
  private async runFromResponse(responseElement: HTMLElement): Promise<void> {
    try {
      await this.runFirstRoundFromResponse(responseElement);
    } catch (e) {
      if (isAbortError(e)) return;
      console.error('[AgentLoop] Engine error:', e);
      this.ctx.fail((e as Error).message);
    }
  }

  private async runFirstRoundFromResponse(responseElement: HTMLElement): Promise<void> {
    const ctx = this.ctx;
    ctx.abort.check();

    // ② Parse — skip ① since the response is already on screen
    const parsed = parseResponse(ctx, responseElement);
    if (parsed.kind === 'stalled') return;

    if (parsed.kind === 'nudge') {
      if (!(await this.handoff.deliver(parsed.text, isUnattendedAllowed()))) return;
      ctx.abort.check();
      ctx.advanceRound();
      // From round 2 onward, fall into the normal loop
      await this.runRounds();
      return;
    }

    // Feeds the unattended budget only; see runRounds for why it is read up front.
    const wasUnattended = shouldAutoSend(parsed.toolCalls);

    // ③ Execute
    const executed = await executeTools(ctx, parsed.toolCalls);
    if (executed.kind === 'ended') return;

    if (executed.kind === 'halted') {
      this.handoff.holdForRetry(
        formatResults(executed.results, parsed.errors, ctx.takePendingInstruction()),
      );
      ctx.pauseAndEnd(executed.reason, 'circuit_breaker');
      return;
    }

    // ④ Hand the results back
    const payload = formatResults(
      executed.results,
      parsed.errors,
      ctx.takePendingInstruction(),
    );
    const autoSend = isUnattendedAllowed();
    if (!(await this.handoff.deliver(payload, autoSend))) return;

    ctx.abort.check();
    this.unattendedStreak = wasUnattended ? this.unattendedStreak + 1 : 0;
    ctx.advanceRound();

    if (this.unattendedStreak >= ctx.maxRounds) {
      ctx.checkIn(this.unattendedStreak);
      return;
    }

    // Continue with the normal loop from round 2+
    await this.runRounds();
  }

  private async runRounds(): Promise<void> {
    const ctx = this.ctx;

    // No condition here: the only ceiling is the unattended streak, checked at the
    // bottom where the round's outcome is known.
    for (;;) {
      ctx.abort.check();

      if (ctx.atBreakpoint()) {
        ctx.pauseAtBreakpoint();
        return;
      }

      // ① Wait for the AI
      const awaited = await awaitAIResponse(ctx);
      if (awaited.kind === 'stalled') return;
      if (awaited.kind === 'undelivered') {
        this.reportUndelivered();
        return;
      }
      const response = awaited.element;
      ctx.abort.check();

      // ② Parse — no tool calls means the session is over, and it says so itself
      const parsed = parseResponse(ctx, response);
      if (parsed.kind === 'stalled') return;

      // A malformed block spent its one retry: send the correction and try again.
      // No round to inspect here, so only the standing preference applies.
      if (parsed.kind === 'nudge') {
        if (!(await this.handoff.deliver(parsed.text, isUnattendedAllowed()))) return;
        ctx.abort.check();
        ctx.advanceRound();
        continue;
      }

      /**
       * Was this round fully hands-off?
       *
       * Not what decides the send (see below) — this only feeds the unattended
       * budget. Computed *before* executing because `requiresApproval` reads
       * `approveRestOfRound`, which stage ③ can flip partway through; asked
       * afterwards, a round the user was walked through would look unattended.
       */
      const wasUnattended = shouldAutoSend(parsed.toolCalls);

      // ③ Execute
      const executed = await executeTools(ctx, parsed.toolCalls);
      if (executed.kind === 'ended') return;

      // A guard stopped the round, but the AI is still owed the report. Hold it so
      // Retry delivers the errors and the AI gets a chance to correct itself —
      // dropping it is what made Retry look like a no-op.
      if (executed.kind === 'halted') {
        this.handoff.holdForRetry(
          formatResults(executed.results, parsed.errors, ctx.takePendingInstruction()),
        );
        ctx.pauseAndEnd(executed.reason, 'circuit_breaker');
        return;
      }

      // ④ Hand the results back
      const payload = formatResults(
        executed.results,
        parsed.errors,
        ctx.takePendingInstruction(),
      );

      /**
       * Who presses send: the standing preference, and nothing else.
       *
       * Approving a step no longer also hands the user the send. Having to approve a
       * write *and then* press Enter is two confirmations of one decision, and the
       * second one taught people to switch the approval gate off entirely.
       *
       * (This deliberately does not intersect with `wasUnattended` — `A && B || A`
       * is just `A`, so writing it that way only looked like a trade-off.)
       */
      const autoSend = isUnattendedAllowed();

      if (!(await this.handoff.deliver(payload, autoSend))) return;

      ctx.abort.check();

      /**
       * Only hands-off rounds count toward the step limit.
       *
       * The limit exists to stop a runaway while nobody is watching, and a round the
       * user approved something in had a person in it by definition — so an
       * approval-heavy session is bounded by that person, not by a counter.
       */
      this.unattendedStreak = wasUnattended ? this.unattendedStreak + 1 : 0;

      ctx.advanceRound();

      if (this.unattendedStreak >= ctx.maxRounds) {
        console.log(`[AgentLoop] ${this.unattendedStreak} unattended rounds, pausing for a check-in`);
        // `checkIn`, not `pause` / `pauseAndEnd`: nothing has gone wrong and nothing
        // is finished. Announcing the session over is what made this read as a
        // failure — the task is only waiting to hear whether it should carry on.
        ctx.checkIn(this.unattendedStreak);
        return;
      }
    }
  }
}
