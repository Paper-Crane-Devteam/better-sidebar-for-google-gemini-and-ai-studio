/**
 * Browser Agent's audit journal: what it changed in Chrome, and how to put it back.
 *
 * Two tables (see `create browser agent audit tables` in `migrations.ts`), and the
 * shape of this API follows from one property of them: **a step is a row.** Nothing
 * here ever rewrites a batch as a whole. The predecessor stored each batch as one
 * document, so recording step N re-serialised steps 1..N-1 along with it — every one of
 * those already-written snapshots, on every step. Over a few hundred tabs that is
 * megabytes of writes per step, quadratic in the length of the batch.
 *
 * So the callers get narrow verbs — `patch`, `insertStep`, `updateStep` — rather than a
 * `save(batch)`. The handler still keeps a whole `Batch` in memory as its working model;
 * this module is only how that model is made durable.
 */
import { runQuery, runCommand } from '../index';
import { isTabTool, type Batch, type BatchSummary, type EntityChange, type Operation, type Snapshot, type Step } from '@/shared/browser-agent/contracts';

/**
 * How many batches survive.
 *
 * There has to be a number. This is the one table the extension writes without any user
 * action bounding it, and it holds full before/after snapshots — the thing that makes
 * the journal useful is also the thing that makes it large. It is not in `SYNC_TABLES`,
 * so none of it leaves the machine, but a local database export does carry it.
 *
 * 200 is chosen against what the journal is *for*: undoing something you just did, and
 * answering "what happened to my tabs" days later. Neither reaches back 200 batches.
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
  operations: string; before_state: string; status: Batch['status'];
  error: string | null; undo_of: string | null; undone_by: string | null; created_at: number;
}
interface StepRow {
  step_index: number; operation: string; before_state: string;
  after_state: string | null; changes: string | null; change_count: number; status: Step['status'];
}

/** Absent columns are absent from the object, so `stable()` comparisons stay unaffected. */
function toBatch(row: BatchRow, steps: StepRow[]): Batch {
  return {
    id: row.id, owner: row.owner_tab_id, epoch: row.session_epoch, tool: row.tool,
    operations: load<Operation[]>(row.operations, []),
    before: load<Snapshot>(row.before_state, {}),
    createdAt: row.created_at, status: row.status,
    ...(row.error ? { error: row.error } : {}),
    ...(row.undo_of ? { undoOf: row.undo_of } : {}),
    ...(row.undone_by ? { undoneBy: row.undone_by } : {}),
    steps: steps.map(step => ({
      operation: load<Operation>(step.operation, { type: 'unknown' }),
      before: load<Snapshot>(step.before_state, {}),
      status: step.status,
      ...(step.after_state ? { after: load<Snapshot>(step.after_state, {}) } : {}),
      ...(step.changes ? { changes: load<EntityChange[]>(step.changes, []) } : {}),
    })),
  };
}

export const browserAuditRepo = {
  insert: async (batch: Batch): Promise<void> => {
    await runCommand(
      `INSERT INTO browser_agent_batches
         (id, owner_tab_id, session_epoch, tool, operations, before_state, status, error, undo_of, undone_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batch.id, batch.owner, batch.epoch, batch.tool, dump(batch.operations), dump(batch.before),
        batch.status, batch.error ?? null, batch.undoOf ?? null, batch.undoneBy ?? null, batch.createdAt],
    );
  },

  get: async (id: string | undefined): Promise<Batch | undefined> => {
    if (!id) return undefined;
    const rows = await runQuery('SELECT * FROM browser_agent_batches WHERE id = ?', [id]) as BatchRow[];
    if (!rows.length) return undefined;
    const steps = await runQuery(
      'SELECT * FROM browser_agent_steps WHERE batch_id = ? ORDER BY step_index', [id],
    ) as StepRow[];
    return toBatch(rows[0], steps);
  },

  /** Only the fields a batch changes after it is written: its verdict and its undo link. */
  patch: async (id: string, updates: { status?: Batch['status']; error?: string | null; undoneBy?: string | null }): Promise<void> => {
    const columns: Record<string, unknown> = {};
    if (updates.status !== undefined) columns.status = updates.status;
    if (updates.error !== undefined) columns.error = updates.error;
    if (updates.undoneBy !== undefined) columns.undone_by = updates.undoneBy;
    const keys = Object.keys(columns);
    if (!keys.length) return;
    await runCommand(
      `UPDATE browser_agent_batches SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map(k => columns[k]), id],
    );
  },

  insertStep: async (batchId: string, index: number, step: Step): Promise<void> => {
    await runCommand(
      `INSERT OR REPLACE INTO browser_agent_steps
         (batch_id, step_index, operation, before_state, after_state, changes, change_count, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchId, index, dump(step.operation), dump(step.before), step.after ? dump(step.after) : null,
        step.changes ? dump(step.changes) : null, step.changes?.length ?? 0, step.status],
    );
  },

  updateStep: async (batchId: string, index: number, step: Step): Promise<void> => {
    await runCommand(
      `UPDATE browser_agent_steps SET after_state = ?, changes = ?, change_count = ?, status = ?
       WHERE batch_id = ? AND step_index = ?`,
      [step.after ? dump(step.after) : null, step.changes ? dump(step.changes) : null,
        step.changes?.length ?? 0, step.status, batchId, index],
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

  /**
   * The history list: metadata and counts, never a snapshot.
   *
   * `isTabTool` answers "did this batch touch tabs" from the tool name, which is how
   * `snapshot()` decides what to capture in the first place — so the caller's
   * browser-session check does not have to load `before_state` to find out.
   */
  list: async (batchId?: string): Promise<BatchSummary[]> => {
    const rows = await runQuery(
      `SELECT b.id, b.session_epoch, b.tool, b.operations, b.status, b.error, b.undo_of, b.undone_by, b.created_at,
              (SELECT COUNT(*) FROM browser_agent_steps s WHERE s.batch_id = b.id) AS step_count,
              (SELECT COUNT(*) FROM browser_agent_steps s WHERE s.batch_id = b.id AND s.status = 'applied') AS applied_count
         FROM browser_agent_batches b
        WHERE b.status != 'prepared' ${batchId ? 'AND b.id = ?' : ''}
        ORDER BY b.created_at DESC
        LIMIT ?`,
      batchId ? [batchId, RETENTION_BATCHES] : [RETENTION_BATCHES],
    ) as Array<BatchRow & { step_count: number; applied_count: number }>;
    return rows.map(row => ({
      id: row.id, epoch: row.session_epoch, tool: row.tool, status: row.status,
      error: row.error ?? undefined, undoOf: row.undo_of ?? undefined, undoneBy: row.undone_by ?? undefined,
      createdAt: row.created_at, planned: load<Operation[]>(row.operations, []).length,
      steps: row.step_count, applied: row.applied_count, touchesTabs: isTabTool(row.tool),
    }));
  },

  listSteps: async (batchId: string): Promise<Array<{ index: number; operation: Operation; status: Step['status']; changeCount: number }>> => {
    const rows = await runQuery(
      'SELECT step_index, operation, status, change_count FROM browser_agent_steps WHERE batch_id = ? ORDER BY step_index',
      [batchId],
    ) as StepRow[];
    return rows.map(row => ({
      index: row.step_index, operation: load<Operation>(row.operation, { type: 'unknown' }),
      status: row.status, changeCount: row.change_count,
    }));
  },

  stepChanges: async (batchId: string, index: number): Promise<EntityChange[]> => {
    const rows = await runQuery(
      'SELECT changes FROM browser_agent_steps WHERE batch_id = ? AND step_index = ?', [batchId, index],
    ) as StepRow[];
    return load<EntityChange[]>(rows[0]?.changes, []);
  },

  /**
   * Retention. Runs once per service-worker life, off the request path.
   *
   * A batch another batch's `undo_of` points at is kept regardless of age: dropping it
   * would turn a pending undo into "Original batch is missing" rather than into a
   * refusal the user can understand.
   */
  prune: async (): Promise<void> => {
    await runCommand(
      "DELETE FROM browser_agent_batches WHERE status = 'prepared' AND created_at < ?",
      [Date.now() - PREPARED_TTL_MS],
    );
    await runCommand(
      `DELETE FROM browser_agent_batches
        WHERE id NOT IN (SELECT id FROM browser_agent_batches ORDER BY created_at DESC LIMIT ?)
          AND id NOT IN (SELECT undo_of FROM browser_agent_batches WHERE undo_of IS NOT NULL)`,
      [RETENTION_BATCHES],
    );
    // No foreign key on purpose: the steps table is wide and write-hot, and a cascade
    // would put a lookup on the batch table in front of every step write.
    await runCommand(
      'DELETE FROM browser_agent_steps WHERE batch_id NOT IN (SELECT id FROM browser_agent_batches)',
    );
  },
};
