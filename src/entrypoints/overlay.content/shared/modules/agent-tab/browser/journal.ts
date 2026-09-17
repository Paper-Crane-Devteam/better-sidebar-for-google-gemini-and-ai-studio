/**
 * The local audit journal, as the Agent tab reads it.
 *
 * ⚠️ Read through the agent's **own tool**, not a private channel. That is the point: the
 * list obeys the same read permission the agent does, so a user who has not granted bookmark
 * access does not see bookmark batches here either. A second path into the journal would be
 * a second permission model to keep in step with the first.
 *
 * Its own module because two components need it now — the record list and the batch detail —
 * and neither owns it.
 */

import { browserRequest } from '../../agent-loop/browser/browser-store';

/** One batch, exactly as `browser_query_changes` reports it. */
export interface JournalEntry {
  batch_id: string;
  tool: string;
  status: string;
  completed: number;
  planned: number;
  created_at: number;
  can_restore_before: boolean;
  can_restore_after: boolean;
  error?: string;
}

/** The most recent batches. `limit` is the tool's own, so this is not the whole journal. */
export function readJournal(limit = 50): Promise<JournalEntry[]> {
  return browserRequest<{ items: JournalEntry[] }>({
    action: 'read',
    tool: 'browser_query_changes',
    params: { limit: String(limit) },
  }).then((data) => data.items ?? []);
}
