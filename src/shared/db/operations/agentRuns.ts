/**
 * Storage for what the agent did — sessions and tool calls.
 *
 * The split against the conversation is deliberate: the transcript remains the record
 * of what was *said*, and these tables hold only what cannot be recovered from it.
 * Two things qualify. Whether a call actually ran, which used to be inferred by
 * matching result labels back to calls, and whether a result ever reached the AI,
 * which nothing recorded at all — so a reload after an approved write left the write
 * done, the result destroyed with the composer, and the page ready to run it again.
 *
 * Every write here is best-effort by design (see `records.ts` in the agent module):
 * losing a row degrades the UI back to reading the transcript, whereas letting a
 * failed INSERT throw would take down a tool call that otherwise succeeded.
 */

import { runQuery, runCommand } from '../index';
import type { AgentSessionRow, AgentToolCallRow } from '../../types/db';

const now = () => Math.floor(Date.now() / 1000);

export const agentSessionRepo = {
  create: async (session: {
    id: string;
    conversationId: string | null;
    title: string | null;
    skillId?: string | null;
  }): Promise<void> => {
    await runCommand(
      `INSERT OR REPLACE INTO agent_sessions
         (id, conversation_id, title, skill_id, status, rounds, started_at)
       VALUES (?, ?, ?, ?, 'running', 0, ?)`,
      [
        session.id,
        session.conversationId,
        session.title,
        session.skillId ?? null,
        now(),
      ],
    );
  },

  /**
   * Adopt the conversation id the platform assigned after the first message.
   *
   * Backfills the tool calls too: rows written before the id existed would otherwise
   * be invisible to the card lookup, which is scoped by conversation.
   */
  claimConversation: async (sessionId: string, conversationId: string): Promise<void> => {
    await runCommand(
      'UPDATE agent_sessions SET conversation_id = ? WHERE id = ? AND conversation_id IS NULL',
      [conversationId, sessionId],
    );
    await runCommand(
      'UPDATE agent_tool_calls SET conversation_id = ? WHERE session_id = ? AND conversation_id IS NULL',
      [conversationId, sessionId],
    );
  },

  end: async (sessionId: string, endReason: string, rounds: number): Promise<void> => {
    await runCommand(
      `UPDATE agent_sessions
          SET status = 'ended', end_reason = ?, rounds = ?, ended_at = ?
        WHERE id = ?`,
      [endReason, rounds, now(), sessionId],
    );
  },

  getById: async (sessionId: string): Promise<AgentSessionRow | undefined> => {
    const rows = await runQuery('SELECT * FROM agent_sessions WHERE id = ?', [sessionId]);
    return rows[0] as AgentSessionRow | undefined;
  },

  /** Most recent sessions for a conversation, newest first */
  listByConversation: async (conversationId: string): Promise<AgentSessionRow[]> => {
    return (await runQuery(
      'SELECT * FROM agent_sessions WHERE conversation_id = ? ORDER BY started_at DESC',
      [conversationId],
    )) as AgentSessionRow[];
  },

  /**
   * Record which workspace a session's file operations went to.
   *
   * `WHERE workspace_id IS NULL` makes this write-once: the first workspace a session
   * touched is the one it stays bound to, so a later call cannot move it. Re-running
   * the statement is therefore harmless.
   */
  bindWorkspace: async (sessionId: string, workspaceId: string): Promise<void> => {
    await runCommand(
      'UPDATE agent_sessions SET workspace_id = ? WHERE id = ? AND workspace_id IS NULL',
      [workspaceId, sessionId],
    );
  },

  /**
   * The workspace a conversation is locked to, if any.
   *
   * Scoped by conversation rather than session because the lock is a property of the
   * chat: a conversation can run several sessions, and the second one must land in the
   * same workspace as the first.
   */
  boundWorkspace: async (conversationId: string): Promise<string | null> => {
    const rows = await runQuery(
      `SELECT workspace_id FROM agent_sessions
        WHERE conversation_id = ? AND workspace_id IS NOT NULL
        ORDER BY started_at ASC LIMIT 1`,
      [conversationId],
    );
    return (rows[0] as { workspace_id?: string } | undefined)?.workspace_id ?? null;
  },
};

export const agentToolCallRepo = {
  /**
   * File a call as `running`, before it is invoked.
   *
   * `INSERT OR REPLACE` on the id rather than the key: the same call can legitimately
   * be issued again in a later round, and each attempt is its own row. The id is
   * derived per attempt by the caller.
   */
  begin: async (call: {
    id: string;
    sessionId: string | null;
    conversationId: string | null;
    joinKey: string;
    round: number;
    orderIndex: number;
    toolName: string;
    description?: string;
    params?: Record<string, string>;
    isWrite: boolean;
  }): Promise<void> => {
    const timestamp = now();
    await runCommand(
      `INSERT OR REPLACE INTO agent_tool_calls
         (id, session_id, conversation_id, join_key, round, order_index,
          tool_name, description, params, is_write, status, result_body, delivered,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', NULL, 0, ?, ?)`,
      [
        call.id,
        call.sessionId,
        call.conversationId,
        call.joinKey,
        call.round,
        call.orderIndex,
        call.toolName,
        call.description ?? null,
        call.params ? JSON.stringify(call.params) : null,
        call.isWrite ? 1 : 0,
        timestamp,
        timestamp,
      ],
    );
  },

  /** Record the verdict and the result the AI is owed */
  settle: async (
    id: string,
    status: AgentToolCallRow['status'],
    resultBody: string | null,
  ): Promise<void> => {
    await runCommand(
      'UPDATE agent_tool_calls SET status = ?, result_body = ?, updated_at = ? WHERE id = ?',
      [status, resultBody, now(), id],
    );
  },

  /**
   * Mark a round's results as having reached the AI, and drop the bodies.
   *
   * Per round, not per call: all of a round's sections travel in one message, so
   * delivery is a single event. The bodies go because the conversation now holds
   * them — keeping a second copy of every result is how this table would grow
   * without bound.
   */
  markRoundDelivered: async (sessionId: string, round: number): Promise<void> => {
    await runCommand(
      `UPDATE agent_tool_calls
          SET delivered = 1, result_body = NULL, updated_at = ?
        WHERE session_id = ? AND round = ?`,
      [now(), sessionId, round],
    );
  },

  /**
   * Drop whatever this session still had pending, because it is over.
   *
   * A session that reached its own ending owes the AI nothing: either it finished, or
   * it stopped on a verdict, and in both cases no engine is waiting and the user has
   * already seen the outcome. Without this, a round that ended with `complete_task`
   * alongside other calls left those calls' bodies behind, and the next page load
   * offered to send results into a task that had visibly finished.
   *
   * ⚠️ Deliberately *not* called on the circuit-breaker pause: that path is still
   * holding a report the retry is expected to deliver.
   */
  discardSessionUndelivered: async (sessionId: string): Promise<void> => {
    await runCommand(
      `UPDATE agent_tool_calls
          SET delivered = 1, result_body = NULL, updated_at = ?
        WHERE session_id = ? AND delivered = 0`,
      [now(), sessionId],
    );
  },

  /** Every call recorded against a conversation, oldest first */
  listByConversation: async (conversationId: string): Promise<AgentToolCallRow[]> => {
    return (await runQuery(
      `SELECT * FROM agent_tool_calls
        WHERE conversation_id = ?
        ORDER BY round ASC, order_index ASC`,
      [conversationId],
    )) as AgentToolCallRow[];
  },

  /**
   * Calls that ran but whose results never reached the AI.
   *
   * This is the query the whole table exists for. A non-empty answer means the work
   * happened and the report is still owed, which is the difference between offering
   * to re-send it and silently running the tool a second time.
   */
  listUndelivered: async (conversationId: string): Promise<AgentToolCallRow[]> => {
    return (await runQuery(
      `SELECT * FROM agent_tool_calls
        WHERE conversation_id = ?
          AND delivered = 0
          AND result_body IS NOT NULL
          AND status IN ('ok', 'failed', 'rejected')
        ORDER BY round ASC, order_index ASC`,
      [conversationId],
    )) as AgentToolCallRow[];
  },

  /**
   * Close out specific rows, by id.
   *
   * The recovery path needs this rather than `markRoundDelivered`: the rows it sends
   * belong to the session that was interrupted, while the send happens under a new one.
   * Marking by round and session id would quietly miss them, leaving the offer to
   * reappear on the next load with results the AI already has.
   */
  markDeliveredByIds: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(
      `UPDATE agent_tool_calls
          SET delivered = 1, result_body = NULL, updated_at = ?
        WHERE id IN (${placeholders})`,
      [now(), ...ids],
    );
  },

  /**
   * Forget a conversation's ledger.
   *
   * Used when the user dismisses a recovery offer: they have decided the owed results
   * are not worth sending, and leaving the rows would re-offer it on every load.
   */
  clearUndelivered: async (conversationId: string): Promise<void> => {
    await runCommand(
      `UPDATE agent_tool_calls
          SET delivered = 1, result_body = NULL, updated_at = ?
        WHERE conversation_id = ? AND delivered = 0`,
      [now(), conversationId],
    );
  },
};
