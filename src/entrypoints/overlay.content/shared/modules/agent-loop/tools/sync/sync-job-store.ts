/**
 * Persisted state for a message-sync run.
 *
 * A run walks the tab through one conversation after another. It does that through
 * Gemini's own router, so the driver normally keeps running in memory the whole way —
 * but a run lasts minutes, and the two things that end it early are exactly the two
 * things memory can't survive: the tab being closed, and the full page load the runner
 * falls back to when the router won't open a conversation. So the cursor is written to
 * `chrome.storage.local` before each move and read back at overlay start-up.
 *
 * Two things are deliberately kept here rather than in the agent store:
 * - the job outlives the agent session (the session ends the moment we navigate)
 * - the report, so the "synced N conversations" toast can be shown even if the run
 *   crossed a page load on its way out
 */

const JOB_KEY = 'bs-agent-sync-job';
const REPORT_KEY = 'bs-agent-sync-report';

/**
 * A job untouched for this long is treated as abandoned — the tab was closed, the
 * page crashed, or the user navigated away by hand. Without the guard, a half-done
 * job would grab the wheel again on some unrelated visit days later.
 */
const JOB_TTL = 30 * 60 * 1000;

/** Upper bound per call, so one tool call can't put the tab on a two-hour road trip */
export const MAX_SYNC_IDS = 50;

export type SyncEntryStatus = 'pending' | 'done' | 'partial' | 'failed';

export interface SyncJobEntry {
  /** Platform-native conversation id (the URL path component) */
  externalId: string;
  status: SyncEntryStatus;
  /**
   * How many full page loads we've spent trying to open this one.
   *
   * Only the fallback path: the router is asked first and usually lands. A conversation
   * that no longer exists never lands either way — Gemini bounces the URL back to
   * `/app` — so without a count the resume path would reload at it again, forever, in a
   * loop the user can't get out of.
   */
  attempts: number;
  /** Why it isn't a clean `done` — surfaced in the report */
  note?: string;
}

export interface SyncJob {
  platform: string;
  /**
   * The signed-in account the run was started under, or null if it couldn't be
   * detected.
   *
   * The job lives in `chrome.storage.local`, which every tab of every account
   * shares. Without this a tab signed into another account would pick the run up
   * at start-up and walk itself through conversation ids that don't exist there.
   */
  account: string | null;
  entries: SyncJobEntry[];
  /** Index of the entry being worked on */
  cursor: number;
  /** Where the run was kicked off, so the tab can come back when it's finished */
  returnUrl: string;
  startedAt: number;
  updatedAt: number;
}

export interface SyncReport {
  total: number;
  done: number;
  partial: number;
  failed: number;
  /**
   * Conversations still without messages after this run, counted from the DB.
   *
   * The run only knows about its own 50, and the AI only ever saw one page — neither
   * can answer "am I done?". This can, so the toast says it rather than leaving the
   * user to assume a finished batch means a finished job. `null` when the count
   * couldn't be taken.
   */
  remaining: number | null;
  finishedAt: number;
}

export async function loadSyncJob(): Promise<SyncJob | null> {
  const stored = await chrome.storage.local.get(JOB_KEY);
  const job = stored[JOB_KEY] as SyncJob | undefined;
  if (!job) return null;

  if (Date.now() - (job.updatedAt || job.startedAt) > JOB_TTL) {
    console.log('[AgentLoop][sync] dropping stale sync job');
    await clearSyncJob();
    return null;
  }

  return job;
}

export async function saveSyncJob(job: SyncJob): Promise<void> {
  await chrome.storage.local.set({ [JOB_KEY]: { ...job, updatedAt: Date.now() } });
}

export async function clearSyncJob(): Promise<void> {
  await chrome.storage.local.remove(JOB_KEY);
}

export function createSyncJob(
  externalIds: string[],
  platform: string,
  account: string | null,
): SyncJob {
  return {
    platform,
    account,
    entries: externalIds.map((externalId) => ({
      externalId,
      status: 'pending' as const,
      attempts: 0,
    })),
    cursor: 0,
    returnUrl: location.href,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function summarizeJob(job: SyncJob, remaining: number | null): SyncReport {
  const count = (status: SyncEntryStatus) =>
    job.entries.filter((entry) => entry.status === status).length;

  return {
    total: job.entries.length,
    done: count('done'),
    partial: count('partial'),
    failed: count('failed') + count('pending'),
    remaining,
    finishedAt: Date.now(),
  };
}

export async function saveSyncReport(report: SyncReport): Promise<void> {
  await chrome.storage.local.set({ [REPORT_KEY]: report });
}

/** Read the last run's report and forget it — reports are shown exactly once */
export async function takeSyncReport(): Promise<SyncReport | null> {
  const stored = await chrome.storage.local.get(REPORT_KEY);
  const report = stored[REPORT_KEY] as SyncReport | undefined;
  if (!report) return null;
  await chrome.storage.local.remove(REPORT_KEY);
  return report;
}
