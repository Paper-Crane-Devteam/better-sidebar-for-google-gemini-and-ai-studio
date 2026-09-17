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

/**
 * One batch, as this panel reads it out of `browser_query_changes`.
 *
 * ⚠️ Not every field the tool reports. `can_restore_before` / `can_restore_after` are
 * deliberately absent: both now answer only "was this state recorded", which the detail
 * view already knows from whether it was handed a tree. They were once a gate on the
 * restore button, and a field kept here is an invitation to gate on it again.
 */
export interface JournalEntry {
  batch_id: string;
  tool: string;
  status: string;
  completed: number;
  planned: number;
  created_at: number;
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
