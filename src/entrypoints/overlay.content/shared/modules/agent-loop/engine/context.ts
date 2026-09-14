/**
 * LoopContext — the one thing every stage depends on.
 *
 * A round's stages all need the same four collaborators: the platform adapter, the
 * Zustand store, the event bus, and the abort token. Passing them around
 * individually meant `useAgentLoopStore.getState().x` and a paired
 * `agentEventBus.emit(...)` at every turn, which is what buried the actual loop
 * logic in the original single-file engine.
 *
 * So this is a deliberately thin facade: no decisions of its own, just the store +
 * event pairs that must stay in sync (pause always emits `loop:paused`, ending
 * always emits `loop:ended`). Stages express intent; the bookkeeping lives here.
 */

import type { AgentPlatformAdapter } from '../adapters/types';
import type { AgentEndReason, AgentLoopStatus } from '../types';
import { currentStreamId } from '@/shared/lib/model-stream-store';
import { useAgentLoopStore } from '../agent-loop-store';
import { agentEventBus } from '../event-bus';
import { toolCallRecorder } from '../records';
import { AbortToken } from './guards/abort';
import { CircuitBreaker } from './guards/circuit-breaker';

export class LoopContext {
  /** Typed pub/sub — stages emit through `ctx.events.emit(...)` */
  readonly events = agentEventBus;

  /** Session-scoped guard against stuck loops; survives pause/resume, reset on start */
  readonly breaker = new CircuitBreaker();

  /** Cancellation for the current run */
  readonly abort = new AbortToken();

  /**
   * The generation that was in flight when we last pressed send.
   *
   * Stage ② reads the model's reply out of the API stream rather than the rendered DOM
   * (see `parse-response`), and this is how it knows the reply is *ours*. Without it, a
   * send that never reached the model would be answered with the previous turn's text —
   * which parses perfectly, so nothing looks wrong, and the round re-runs tools that
   * already ran.
   *
   * `null` means "nothing was in flight", which any real stream is newer than. That is
   * also the correct value for round 1: `start()` is called *after* the prompt has gone
   * out, so that generation is already streaming and is exactly the one we want.
   */
  streamBoundary: string | null = null;

  constructor(readonly adapter: AgentPlatformAdapter) {}

  /**
   * Record the stream boundary immediately before a send.
   *
   * Must be called *before* the send, not when stage ① starts waiting: by then the
   * generation has already begun and the store already holds its id, so the boundary
   * would match the very answer it is meant to admit.
   */
  markSendBoundary(): void {
    this.streamBoundary = currentStreamId();
  }

  // ── Store access ───────────────────────────────────────────────────────────

  /** Always read fresh: the UI mutates this store while the loop runs */
  get store() {
    return useAgentLoopStore.getState();
  }

  get status(): AgentLoopStatus {
    return this.store.status;
  }

  get round(): number {
    return this.store.currentRound;
  }

  get maxRounds(): number {
    return this.store.maxRounds;
  }

  setStatus(status: AgentLoopStatus): void {
    this.store.setStatus(status);
  }

  /** Read and clear the instruction the user typed while the loop was running */
  takePendingInstruction(): string | null {
    const instruction = this.store.pendingInstruction;
    if (instruction) this.store.setPendingInstruction(null);
    return instruction;
  }

  // ── Round transitions ──────────────────────────────────────────────────────

  /** Whether this round is the one the user asked to stop at */
  atBreakpoint(): boolean {
    const breakpoint = this.store.breakpointRound;
    return breakpoint !== null && this.round === breakpoint;
  }

  /** Pause at a breakpoint and disarm it, so resuming doesn't re-trigger */
  pauseAtBreakpoint(): void {
    this.store.pause('已到达断点轮次');
    this.store.setBreakpointRound(null);
    this.events.emit('loop:paused', { reason: 'breakpoint' });
  }

  /** Move to the next round, clearing the `awaiting_send` checkpoint state */
  advanceRound(): void {
    this.store.resume();
    this.events.emit('loop:resumed', undefined);
    this.store.nextRound();
  }

  // ── Terminal transitions ───────────────────────────────────────────────────

  /**
   * Stop and wait for the user. Recoverable: the Agent tab offers Retry, which
   * calls `engine.resume()`.
   *
   * Ignored once the run has been aborted. Stopping is not instantaneous — the abort
   * unwinds asynchronously, and stage ④ reaches a `pause` on its way out (the send
   * watcher returns "not sent", because the abort is precisely why it wasn't). Left
   * unguarded that writes `paused` plus a "results were not sent" notice *after* the
   * user already ended the session, so the dock reappears reporting a fault that is
   * really just the stop they asked for.
   */
  pause(reason: string, eventReason = reason): void {
    if (this.abort.aborted) return;
    this.store.pause(reason);
    this.events.emit('loop:paused', { reason: eventReason });
  }

  /**
   * Stop and ask whether to carry on, after a long unattended run.
   *
   * Separate from `pause` because nothing is wrong: the UI shows a neutral
   * "have a look" card instead of the fault notice, and no end reason is recorded.
   */
  checkIn(steps: number): void {
    // Same reasoning as `pause`: a stopped session must not be reopened by a
    // check-in the unwinding loop happened to reach.
    if (this.abort.aborted) return;
    this.store.requestCheckIn(steps);
    this.events.emit('loop:paused', { reason: 'step check-in' });
  }

  /**
   * Pause *and* declare the session over — guards that shouldn't silently retry.
   *
   * ⚠️ The ledger session is deliberately left open here. This path always owes the AI
   * a report (`holdForRetry` is holding it), and Retry is expected to deliver it, so
   * closing the session would orphan the very rows the retry needs to settle.
   */
  pauseAndEnd(reason: string, endReason: AgentEndReason, totalRounds = this.round): void {
    this.store.pause(reason);
    this.events.emit('loop:ended', { reason: endReason, totalRounds });
  }

  /** Clean end of a session (complete_task, paywall, user stop) */
  finish(endReason: AgentEndReason, totalRounds = this.round): void {
    this.store.stop(endReason);
    toolCallRecorder.endSession(endReason, totalRounds);
    this.events.emit('loop:ended', { reason: endReason, totalRounds });
  }

  /** Report an engine-level exception */
  fail(message: string): void {
    this.store.setError(message);
    toolCallRecorder.endSession('error', this.round);
    this.events.emit('loop:ended', { reason: 'error', totalRounds: this.round });
  }
}
