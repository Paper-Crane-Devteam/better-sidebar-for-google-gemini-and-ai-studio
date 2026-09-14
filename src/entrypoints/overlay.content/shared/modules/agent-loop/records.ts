/**
 * Writing the session down as it happens.
 *
 * The engine knows a call by its round, its position in that round, and its join key.
 * The database wants row ids and a session id. This is the one place that translates,
 * so no stage has to carry database concerns through its own logic.
 *
 * **Every write is best-effort.** A failure here is logged and swallowed, because the
 * ledger is an aid, not the mechanism: without it the renderer falls back to reading
 * the transcript, which is what it did before this existed. Letting a rejected INSERT
 * propagate would do the opposite of the goal — it would abort a tool call that had
 * already succeeded, from inside the code meant to remember that it succeeded.
 *
 * The one write that is *awaited* is `begin`, and only because its whole purpose is to
 * exist before the tool runs. Everything else is fire-and-forget: the loop must not
 * wait on a round trip between a result and its handoff.
 *
 * ⚠️ Everything goes through `ledger-client`, which messages the background. Do **not**
 * reach for `@/shared/db` here: it does not work in a content script, and since `begin`
 * is awaited, the failure mode is *every* tool call hanging for 30 seconds — including
 * ones that touch no data. See the note at the top of `ledger-client.ts`.
 */

import { ledgerClient } from './ledger-client';
import type { AgentToolCallRow } from '@/shared/types/db';

export interface BeginToolCall {
  /** `buildToolCallKey(call)` — the same digest written into the result section */
  key: string;
  round: number;
  orderIndex: number;
  toolName: string;
  description?: string;
  params?: Record<string, string>;
  isWrite: boolean;
}

export interface SettleToolCall {
  status: AgentToolCallRow['status'];
  /**
   * The result as the AI would read it, kept until delivery is confirmed.
   *
   * Null when this tool's result is never reported back — `complete_task` and the
   * handoff tools end the session where they stand (see `deliversResultToAI`). A body
   * stored for one of those reads as "ran but never reported", and the dock offers to
   * send it: a card asking whether to hand the AI its own completion marker.
   */
  resultBody: string | null;
}

class ToolCallRecorder {
  private sessionId: string | null = null;
  private conversationId: string | null = null;

  /**
   * Key → the row id of its most recent attempt.
   *
   * `settle` identifies a call by key, but rows are keyed by attempt, because the same
   * call can legitimately be issued again in a later round. Last-write-wins is correct
   * here: `settle` always follows its own `begin` with nothing in between.
   */
  private readonly rows = new Map<string, string>();

  /** Whether a session is being recorded — read by callers that skip work otherwise */
  get active(): boolean {
    return this.sessionId !== null;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * The conversation this session belongs to, once the platform has assigned one.
   *
   * Null in a brand new chat until `claimConversation` backfills it. The workspace
   * binding reads this to scope its lock, and treats null as "not bound yet" — which is
   * correct: a conversation with no id cannot have a row to look up.
   */
  get currentConversationId(): string | null {
    return this.conversationId;
  }

  startSession(session: {
    conversationId?: string | null;
    title?: string | null;
    skillId?: string | null;
  }): void {
    this.sessionId = crypto.randomUUID();
    this.conversationId = session.conversationId ?? null;
    this.rows.clear();

    void ledgerClient.sessionCreate({
      id: this.sessionId,
      conversationId: this.conversationId,
      title: session.title ?? null,
      skillId: session.skillId ?? null,
    });
  }

  /**
   * Adopt the conversation id assigned after the first message went out.
   *
   * A session started in a brand new chat files its early rows with a null
   * conversation, and the card lookup is scoped by conversation — so without this
   * backfill the first round's calls would be invisible on the very page they ran on.
   */
  claimConversation(conversationId: string): void {
    if (!this.sessionId || this.conversationId) return;
    this.conversationId = conversationId;

    void ledgerClient.sessionClaim(this.sessionId, conversationId);
  }

  /**
   * File a call as `running`. Awaited: the row has to predate the tool.
   *
   * ⚠️ This is the only ledger call on the critical path, so it is the one that decides
   * how sluggish the agent feels. `ledgerClient` caps it at a few seconds and gives up —
   * a missing row costs a card its badge, whereas waiting costs every tool call.
   */
  async begin(call: BeginToolCall): Promise<void> {
    if (!this.sessionId) return;

    const rowId = `${this.sessionId}:${call.round}:${call.orderIndex}`;
    this.rows.set(call.key, rowId);

    await ledgerClient.callBegin({
      id: rowId,
      sessionId: this.sessionId,
      conversationId: this.conversationId,
      joinKey: call.key,
      round: call.round,
      orderIndex: call.orderIndex,
      toolName: call.toolName,
      description: call.description,
      params: call.params,
      isWrite: call.isWrite,
    });
  }

  /**
   * Record the verdict and the result body.
   *
   * A refusal never went through `begin` — nothing ran, so there was nothing to guard
   * against a mid-execution reload — but it still needs a row, because "you turned
   * this down" is a real outcome the card has to be able to show after a reload.
   */
  async settle(key: string, outcome: SettleToolCall): Promise<void> {
    if (!this.sessionId) return;

    const rowId = this.rows.get(key);
    if (!rowId) {
      console.warn('[AgentLoop] No ledger row for a settled call; skipping', key);
      return;
    }

    await ledgerClient.callSettle(rowId, outcome.status, outcome.resultBody);
  }

  /**
   * Register a call that was never invoked, so it can still be settled.
   *
   * Used for refusals, which skip `begin` entirely.
   */
  async record(call: BeginToolCall, outcome: SettleToolCall): Promise<void> {
    await this.begin(call);
    await this.settle(call.key, outcome);
  }

  /** The round's results reached the AI — the bodies are no longer the only copy */
  markRoundDelivered(round: number): void {
    if (!this.sessionId) return;
    void ledgerClient.roundDelivered(this.sessionId, round);
  }

  /**
   * The session reached its own ending.
   *
   * ⚠️ Also drops whatever it still had pending. A session that ended owes the AI
   * nothing: it either finished or stopped on a verdict, and either way no engine is
   * waiting and the user has already seen the outcome. Without this, a round that ended
   * with `complete_task` next to other calls left those bodies behind, and the next page
   * load offered to send results into a task that had visibly finished.
   *
   * The genuine owed case — a page that went away mid-round — never reaches here, which
   * is exactly what makes this safe. Neither does the circuit-breaker pause
   * (`pauseAndEnd`), which is still holding a report for its retry.
   */
  endSession(endReason: string, rounds: number): void {
    if (!this.sessionId) return;
    const id = this.sessionId;
    this.sessionId = null;
    this.conversationId = null;
    this.rows.clear();

    void ledgerClient.sessionEnd(id, endReason, rounds);
    void ledgerClient.sessionDiscardUndelivered(id);
  }

  // No try/catch wrapper here: `ledgerClient` never rejects. It reports a failed or
  // timed-out call as null and logs it, which is the whole of what this class wants.
}

/**
 * Module-level singleton, matching `engine-registry`.
 *
 * One tab runs at most one session, and the alternative — threading a recorder through
 * `LoopContext` into every stage — would put a database dependency in the signature of
 * code whose job is the loop.
 */
export const toolCallRecorder = new ToolCallRecorder();
