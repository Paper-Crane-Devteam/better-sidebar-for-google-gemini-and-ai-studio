/**
 * Browser Agent's audit journal: the states it moved the browser between.
 *
 * Two tables (see `create browser agent audit tables` in `migrations.ts`). The batch row
 * holds the two snapshots — the state the batch started from and the state it produced —
 * and that pair is what the journal exists for: the detail view draws them, and restoring
 * means writing one of them back. Step rows hold a verdict each and no snapshot, so a
 * batch that stopped halfway can still say where.
 *
 * Callers get narrow verbs rather than a `save(batch)`. The handler keeps a whole `Batch`
 * in memory as its working model; this module is only how that model is made durable, and
 * every write here touches one row.
 */
import { runQuery, runCommand } from '../index';
import type { Batch, BatchSummary, Operation, RestoreSide, Snapshot, Step } from '@/shared/browser-agent/contracts';

/**
 * How many batches survive.
 *
 * There has to be a number. This is the one table the extension writes without any user
 * action bounding it, and each row carries two whole states — the thing that makes the
 * journal useful is also the thing that makes it large. It is not in `SYNC_TABLES`, so
 * none of it leaves the machine, but a local database export does carry it.
 *
 * 200 is chosen against what the journal is *for*: putting back something that went wrong,
 * and answering "what happened to my tabs" days later. Neither reaches back 200 batches.
 */
const RETENTION_BATCHES = 200;
/** Matches the plan expiry in the handler — an unapproved preview past it is dead weight. */
const PREPARED_TTL_MS = 600_000;

const dump = (value: unknown) => JSON.stringify(value ?? null);
function load<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

interface BatchRow {
  id: string; owner_tab_id: number; session_epoch: string; tool: string;
  operations: string; before_state: string; after_state: string | null;
  status: Batch['status']; error: string | null;
  restore_of: string | null; restore_side: RestoreSide | null; created_at: number;
}
interface StepRow { step_index: number; operation: string; status: Step['status'] }

/** Absent columns are absent from the object, so equality comparisons stay unaffected. */
function toBatch(row: BatchRow, steps: StepRow[]): Batch {
  return {
    id: row.id, owner: row.owner_tab_id, epoch: row.session_epoch, tool: row.tool,
    operations: load<Operation[]>(row.operations, []),
    before: load<Snapshot>(row.before_state, {}),
    ...(row.after_state ? { after: load<Snapshot>(row.after_state, {}) } : {}),
    createdAt: row.created_at, status: row.status,
    ...(row.error ? { error: row.error } : {}),
    ...(row.restore_of ? { restoreOf: row.restore_of } : {}),
    ...(row.restore_side ? { restoreSide: row.restore_side } : {}),
    steps: steps.map(step => ({
      operation: load<Operation>(step.operation, { type: 'unknown' }),
      status: step.status,
    })),
  };
}

export const browserAuditRepo = {
  insert: async (batch: Batch): Promise<void> => {
    await runCommand(
      `INSERT INTO browser_agent_batches
         (id, owner_tab_id, session_epoch, tool, operations, before_state, after_state,
          status, error, restore_of, restore_side, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batch.id, batch.owner, batch.epoch, batch.tool, dump(batch.operations), dump(batch.before),
        batch.after ? dump(batch.after) : null, batch.status, batch.error ?? null,
        batch.restoreOf ?? null, batch.restoreSide ?? null, batch.createdAt],
    );
  },

  get: async (id: string | undefined): Promise<Batch | undefined> => {
    if (!id) return undefined;
    const rows = await runQuery('SELECT * FROM browser_agent_batches WHERE id = ?', [id]) as BatchRow[];
    if (!rows.length) return undefined;
    const steps = await runQuery(
      'SELECT step_index, operation, status FROM browser_agent_steps WHERE batch_id = ? ORDER BY step_index', [id],
    ) as StepRow[];
    return toBatch(rows[0], steps);
  },

  /**
   * Just the two states, for the detail view.
   *
   * Its own query because the trees are the largest thing this table can hand out and the
   * history list beside them must not pay for it.
   */
  snapshots: async (id: string): Promise<{ before: Snapshot; after?: Snapshot } | undefined> => {
    const rows = await runQuery(
      'SELECT before_state, after_state FROM browser_agent_batches WHERE id = ?', [id],
    ) as Array<Pick<BatchRow, 'before_state' | 'after_state'>>;
    if (!rows.length) return undefined;
    return {
      before: load<Snapshot>(rows[0].before_state, {}),
      ...(rows[0].after_state ? { after: load<Snapshot>(rows[0].after_state, {}) } : {}),
    };
  },

  /** Only the fields a batch gains after it is written: its verdict and its end state. */
  patch: async (id: string, updates: { status?: Batch['status']; error?: string | null; after?: Snapshot }): Promise<void> => {
    const columns: Record<string, unknown> = {};
    if (updates.status !== undefined) columns.status = updates.status;
    if (updates.error !== undefined) columns.error = updates.error;
    if (updates.after !== undefined) columns.after_state = dump(updates.after);
    const keys = Object.keys(columns);
    if (!keys.length) return;
    await runCommand(
      `UPDATE browser_agent_batches SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map(k => columns[k]), id],
    );
  },

  /**
   * Drop a batch and its steps.
   *
   * One caller: a restore that landed. The journal is a record of what the extension
   * changed about the browser, and putting a recorded state back is the answer to that
   * question rather than another instance of it — see the note in `commit`. Steps first,
   * so a failure between the two leaves rows the batch sweep can still find by id.
   */
  discard: async (id: string): Promise<void> => {
    await runCommand('DELETE FROM browser_agent_steps WHERE batch_id = ?', [id]);
    await runCommand('DELETE FROM browser_agent_batches WHERE id = ?', [id]);
  },

  insertStep: async (batchId: string, index: number, step: Step): Promise<void> => {
    await runCommand(
      `INSERT OR REPLACE INTO browser_agent_steps (batch_id, step_index, operation, status)
       VALUES (?, ?, ?, ?)`,
      [batchId, index, dump(step.operation), step.status],
    );
  },

  setStepStatus: async (batchId: string, index: number, status: Step['status']): Promise<void> => {
    await runCommand(
      'UPDATE browser_agent_steps SET status = ? WHERE batch_id = ? AND step_index = ?',
      [status, batchId, index],
    );
  },

  /**
   * Anything left mid-execution did not finish, and we cannot tell whether it landed.
   *
   * One UPDATE for the whole table: the only way a row is still `applying` is that the
   * service worker went away during the run, so there is no live batch to protect.
   */
  markInterrupted: async (error: string): Promise<void> => {
    await runCommand(
      `UPDATE browser_agent_steps SET status = 'unknown' WHERE status = 'applying'
         AND batch_id IN (SELECT id FROM browser_agent_batches WHERE status = 'applying')`,
    );
    await runCommand(
      "UPDATE browser_agent_batches SET status = 'unknown', error = ? WHERE status = 'applying'",
      [error],
    );
  },

  /** The history list: metadata and counts, never a snapshot. */
  list: async (batchId?: string): Promise<BatchSummary[]> => {
    const rows = await runQuery(
      `SELECT b.id, b.session_epoch, b.tool, b.operations, b.status, b.error,
              b.restore_of, b.restore_side, b.created_at,
              b.after_state IS NOT NULL AS has_after,
              (SELECT COUNT(*) FROM browser_agent_steps s WHERE s.batch_id = b.id) AS step_count,
              (SELECT COUNT(*) FROM browser_agent_steps s WHERE s.batch_id = b.id AND s.status = 'applied') AS applied_count
         FROM browser_agent_batches b
        WHERE b.status != 'prepared' ${batchId ? 'AND b.id = ?' : ''}
        ORDER BY b.created_at DESC
        LIMIT ?`,
      batchId ? [batchId, RETENTION_BATCHES] : [RETENTION_BATCHES],
    ) as Array<BatchRow & { has_after: number; step_count: number; applied_count: number }>;
    return rows.map(row => ({
      id: row.id, epoch: row.session_epoch, tool: row.tool, status: row.status,
      error: row.error ?? undefined,
      restoreOf: row.restore_of ?? undefined, restoreSide: row.restore_side ?? undefined,
      createdAt: row.created_at, planned: load<Operation[]>(row.operations, []).length,
      steps: row.step_count, applied: row.applied_count,
      hasAfter: !!row.has_after,
    }));
  },

  listSteps: async (batchId: string): Promise<Array<{ index: number; operation: Operation; status: Step['status'] }>> => {
    const rows = await runQuery(
      'SELECT step_index, operation, status FROM browser_agent_steps WHERE batch_id = ? ORDER BY step_index',
      [batchId],
    ) as StepRow[];
    return rows.map(row => ({
      index: row.step_index, operation: load<Operation>(row.operation, { type: 'unknown' }),
      status: row.status,
    }));
  },

  /**
   * Retention. Runs once per service-worker life, off the request path.
   *
   * Nothing has to be kept for another row's sake: a restore records the state it wrote
   * as its own snapshot, so it stays readable and repeatable after the batch it came from
   * has aged out.
   */
  prune: async (): Promise<void> => {
    await runCommand(
      "DELETE FROM browser_agent_batches WHERE status = 'prepared' AND created_at < ?",
      [Date.now() - PREPARED_TTL_MS],
    );
    await runCommand(
      `DELETE FROM browser_agent_batches
        WHERE id NOT IN (SELECT id FROM browser_agent_batches ORDER BY created_at DESC LIMIT ?)`,
      [RETENTION_BATCHES],
    );
    // No foreign key on purpose: the steps table is write-hot, and a cascade would put a
    // lookup on the batch table in front of every step write.
    await runCommand(
      'DELETE FROM browser_agent_steps WHERE batch_id NOT IN (SELECT id FROM browser_agent_batches)',
    );
  },
};
