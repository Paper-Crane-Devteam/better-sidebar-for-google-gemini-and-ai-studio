/**
 * The sync run — a script that drives the tab, not a request that returns a value.
 *
 * Shape of the thing, because it is unusual for a tool: there is no API to ask for a
 * conversation's messages. The only way to get them is to be *on* the page while
 * Gemini fetches them, so the run moves the tab to each conversation in turn, scrolls
 * its history to the top, and lets the existing interceptor → background → DB path
 * record whatever comes back.
 *
 * Moving between conversations goes through Gemini's own router (`shared/lib/navigation`
 * — a sidebar click when the conversation is in the list, pushState otherwise), the same
 * path the explorer uses. That keeps one JS context alive for the whole run, which is
 * what makes the two things a minutes-long background job needs possible at all:
 *
 * - a progress indicator that stays put (`sync-progress.ts`)
 * - a Stop button that takes effect now rather than at the next page boot
 *
 * A full page load is kept only as the fallback for a conversation the router refuses
 * to open, so the job is still persisted in `chrome.storage.local` and the run is still
 * resumable across a reload or a closed tab:
 *
 *   startSyncRun()   write the job, then start driving
 *   driveJob()       navigate → wait → scroll → record → advance the cursor
 *   (reload, if any) resumeSyncRun() at overlay start-up picks the job back up
 *   finish           save a report, return to where the run started, toast the result
 *
 * The consequence the caller has to own: the agent session cannot survive this. The
 * agent's own conversation is one of these pages, and we are about to leave it. That
 * is why `sync_conversation_messages` is a handoff tool (see
 * `engine/parser/tool-schema.ts`) — it ends the loop by design, and the AI is told to
 * explain what is about to happen *before* calling it.
 */

import i18n from '@/locale/i18n';
import { toast } from '@/shared/lib/toast';
import {
  geminiAccountPrefix,
  navigate,
  navigateToConversation,
} from '@/shared/lib/navigation';
import { detectAccount } from '@/entrypoints/content/shared/detect-account';
import { Platform } from '@/shared/types/platform';
import { scrollConversationToTop } from './conversation-scroller';
import { hideSyncProgress, showSyncProgress } from './sync-progress';
import {
  clearSyncJob,
  createSyncJob,
  loadSyncJob,
  saveSyncJob,
  saveSyncReport,
  summarizeJob,
  takeSyncReport,
  type SyncJob,
} from './sync-job-store';

/** Only Gemini for now — the AI Studio adapter doesn't exist yet */
const SYNC_PLATFORM = 'gemini';

/** Keeps the `/u/N` account prefix: dropping it would load the default account */
const conversationUrl = (externalId: string) =>
  `https://gemini.google.com${geminiAccountPrefix()}/app/${externalId}`;

/** `/app/{id}`, the same shape the Gemini DOM adapter reads */
function currentConversationId(): string | null {
  return /\/app\/([a-zA-Z0-9_-]+)/.exec(location.pathname)?.[1] ?? null;
}

/**
 * Breathing room between the tool result being recorded and the tab moving.
 *
 * Navigating from inside the tool call would tear the conversation down mid-round: the
 * result never reaches the store, so the chat shows a tool card that never resolved and
 * the user is left on a new page with no idea what happened.
 */
const HANDOFF_DELAY = 2500;

/** Wait for the router to settle on the conversation we asked for */
const NAVIGATION_TIMEOUT = 12_000;
/** Wait for the conversation to render before scrolling it */
const READY_TIMEOUT = 20_000;
/** How often the waits re-check, so Stop is felt within a beat */
const POLL_INTERVAL = 250;
/**
 * Hard page loads we're willing to spend on one conversation.
 *
 * Only the fallback path: the router is tried first and usually lands. A conversation
 * that no longer exists never lands either way — Gemini bounces the URL back to `/app`
 * — so this is what stops the fallback from becoming a reload loop the user can't get
 * out of.
 */
const MAX_NAVIGATION_ATTEMPTS = 1;
/** Let the last fetch land and reach the background before moving on */
const SETTLE_DELAY = 1500;

/** One run per tab — a second driver would fight the first over the cursor */
let driving = false;

/**
 * "A run is driving this tab", readable synchronously by anyone.
 *
 * Kept in `sessionStorage` rather than a module variable for one reason: the run can
 * cross a full page load (the fallback when the router won't open a conversation), and
 * the thing that most needs this answer runs *during* that page load. `sessionStorage`
 * is per-tab, synchronous, and survives the reload; the job in `chrome.storage.local`
 * is the durable record but only readable asynchronously, which is too late.
 *
 * Who asks: auto-pickup in the platform feature. A run walks the tab through other
 * people's conversations, and any of them may end with agent tool calls that were
 * never reported back. To pickup that looks exactly like "the user asked a follow-up
 * and nobody ran the tools" — so it starts a session, executes the calls, and posts
 * the results into a conversation the user never opened. The run then navigates away
 * mid-flight, leaving that session parked forever, which is what makes the whole tab
 * refuse to start any new task.
 *
 * Self-heals: `resumeSyncRun` runs on every page load and clears the flag when there
 * is no job, so a crashed run can't silence pickup for the life of the tab.
 */
const RUN_FLAG_KEY = 'bs-agent-sync-running';

function markRunActive(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(RUN_FLAG_KEY, '1');
    else sessionStorage.removeItem(RUN_FLAG_KEY);
  } catch {
    // Storage can be denied (private mode, blocked cookies). Losing the flag only
    // costs the pickup guard, and a run must not fail over its own bookkeeping.
  }
}

/** Whether a sync run currently owns the tab's navigation */
export function isSyncRunActive(): boolean {
  try {
    return sessionStorage.getItem(RUN_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Cancellation for the run currently driving.
 *
 * A token rather than a bare flag so a Stop aimed at one run can never land on the next
 * one: `cancelSyncRun` poisons the token it can see, and a run started afterwards holds
 * a fresh one.
 */
interface RunToken {
  cancelled: boolean;
}
let activeToken: RunToken | null = null;

/** The driver's live copy, so Stop can report counts the persisted job hasn't caught up to */
let activeJob: SyncJob | null = null;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Entry points ────────────────────────────────────────────────────────────

export interface StartSyncRunResult {
  started: boolean;
  /** Why it didn't start, for the tool to hand back to the AI */
  reason?: string;
}

/**
 * Register a run and hand the tab over to it.
 *
 * Returns as soon as the job is persisted; the navigation happens after
 * `HANDOFF_DELAY` so the calling round can finish reporting itself first.
 */
export async function startSyncRun(externalIds: string[]): Promise<StartSyncRunResult> {
  const existing = await loadSyncJob();
  if (existing) {
    const remaining = existing.entries.length - existing.cursor;
    return {
      started: false,
      reason: `A sync run is already in progress (${remaining} conversation(s) left). Wait for it to finish.`,
    };
  }

  // Short wait: the page is long loaded by the time the agent asks for a run.
  const account = await detectAccount(Platform.GEMINI, 3000);
  const job = createSyncJob(externalIds, SYNC_PLATFORM, account);
  await saveSyncJob(job);
  // Raised here, not in `driveJob`: the tab is already committed to the trip, and the
  // 2.5s handoff delay is long enough for pickup to act on the very response that
  // booked it.
  markRunActive(true);

  console.log(`[AgentLoop][sync] queued ${externalIds.length} conversation(s)`);
  setTimeout(() => {
    void driveJob();
  }, HANDOFF_DELAY);

  return { started: true };
}

/**
 * Called once per page load. Reports a finished run, or picks up an unfinished one.
 *
 * Cheap when there's nothing to do: a storage read and out. When there *is* something,
 * the progress indicator goes up before the first navigation, so a user who reopened
 * the tab into a half-done run can see it and stop it instead of watching the page move
 * on its own.
 */
export async function resumeSyncRun(): Promise<void> {
  await flushReport();
  const job = await loadSyncJob();
  if (!job) {
    // The job is the truth; the flag is only its synchronous shadow. Clearing it here
    // is what stops a crashed or expired run from silencing auto-pickup forever.
    markRunActive(false);
    return;
  }

  // Another account's run. Leave the job for the tab that owns it: driving it
  // here would open conversations this account doesn't have.
  if (job.account) {
    const account = await detectAccount(Platform.GEMINI);
    if (account && account !== job.account) {
      markRunActive(false);
      console.log('[AgentLoop][sync] pending run belongs to another account; not resuming here');
      return;
    }
  }

  markRunActive(true);
  console.log(`[AgentLoop][sync] resuming at ${job.cursor + 1}/${job.entries.length}`);
  void driveJob(job);
}

/**
 * Stop the current run where it stands.
 *
 * Takes effect within a poll interval rather than at the next page load, and puts the
 * tab back where the run started — a run that stopped halfway through somebody else's
 * conversation is not a place the user asked to be.
 */
export async function cancelSyncRun(): Promise<void> {
  if (activeToken) activeToken.cancelled = true;

  const job = activeJob ?? (await loadSyncJob());
  await clearSyncJob();
  markRunActive(false);
  hideSyncProgress();

  if (!job) return;

  const done = job.entries.filter((entry) => entry.status === 'done').length;
  toast.info(i18n.t('agent.sync.cancelled', { count: done }));
  returnTo(job.returnUrl);
}

// ─── The driver ──────────────────────────────────────────────────────────────

async function driveJob(preloaded?: SyncJob): Promise<void> {
  if (driving) return;
  driving = true;

  const token: RunToken = { cancelled: false };
  activeToken = token;

  try {
    const job = preloaded ?? (await loadSyncJob());
    activeJob = job;
    if (!job) return;

    while (job.cursor < job.entries.length) {
      if (token.cancelled) return;

      const entry = job.entries[job.cursor];
      showSyncProgress(job.cursor + 1, job.entries.length, () => void cancelSyncRun());

      // Already here when a reload dropped us straight onto the target; otherwise ask
      // the router for it.
      let opened: OpenOutcome;
      if (currentConversationId() === entry.externalId) {
        const rendered = await waitFor(hasMessages, READY_TIMEOUT, token);
        opened = rendered ? 'ready' : 'no-render';
      } else {
        opened = await openConversation(entry.externalId, token);
      }

      if (token.cancelled) return;

      if (opened === 'no-arrival' && entry.attempts < MAX_NAVIGATION_ATTEMPTS) {
        // The router wouldn't go. Spend a real page load on it and let `resumeSyncRun`
        // pick the job back up on the other side.
        entry.attempts += 1;
        await saveSyncJob(job);
        console.log(`[AgentLoop][sync] → ${entry.externalId} via page load`);
        location.assign(conversationUrl(entry.externalId));
        return;
      }

      if (opened !== 'ready') {
        entry.status = 'failed';
        entry.note =
          opened === 'no-arrival'
            ? 'could not open the conversation'
            : 'conversation did not render';
      } else {
        const outcome = await scrollConversationToTop({
          shouldCancel: () => token.cancelled,
        });
        if (token.cancelled) return;
        await wait(SETTLE_DELAY);
        if (token.cancelled) return;

        if (outcome === 'reached-top') {
          entry.status = 'done';
        } else {
          entry.status = 'partial';
          entry.note =
            outcome === 'no-scroller'
              ? 'only the messages loaded on open were captured (scroll target not wired up yet)'
              : 'timed out before reaching the first message';
        }
      }

      console.log(`[AgentLoop][sync] ${entry.externalId}: ${entry.status}`, entry.note ?? '');
      job.cursor += 1;
      await saveSyncJob(job);
    }

    if (!token.cancelled) await finishJob(job);
  } catch (e) {
    console.error('[AgentLoop][sync] run failed', e);
    // A crashed run must not keep the wheel: leaving the job behind would make every
    // later page load try to navigate again.
    await clearSyncJob();
    markRunActive(false);
    hideSyncProgress();
  } finally {
    driving = false;
    activeJob = null;
    if (activeToken === token) activeToken = null;
  }
}

type OpenOutcome =
  /** On the conversation, with messages on screen */
  | 'ready'
  /** The router never settled on this id — usually a conversation that's gone */
  | 'no-arrival'
  /** URL landed but nothing rendered in time */
  | 'no-render';

/**
 * Take the tab to one conversation without reloading the page.
 *
 * Arrival can't be read off "are there messages?" alone: the previous conversation's
 * messages stay in the DOM for a beat after the URL changes, so a bare presence check
 * would hand the scroller the *old* history and record it against the new id. Hence the
 * fingerprint — we wait for the message list to become a different one.
 */
async function openConversation(externalId: string, token: RunToken): Promise<OpenOutcome> {
  const before = messageFingerprint();
  navigateToConversation(externalId);

  const arrived = await waitFor(
    () => currentConversationId() === externalId,
    NAVIGATION_TIMEOUT,
    token,
  );
  if (!arrived) return 'no-arrival';

  const rendered = await waitFor(
    () => {
      const now = messageFingerprint();
      return !!now && now !== before;
    },
    READY_TIMEOUT,
    token,
  );

  return rendered ? 'ready' : 'no-render';
}

async function finishJob(job: SyncJob): Promise<void> {
  const report = summarizeJob(job, await countUnsynced(job.platform));
  await saveSyncReport(report);
  await clearSyncJob();
  markRunActive(false);
  hideSyncProgress();
  console.log('[AgentLoop][sync] run finished', report);

  // Back to where the run started, so the user lands on the conversation they were
  // talking to the agent in. The report is in storage either way, so the toast survives
  // a fallback page load.
  returnTo(job.returnUrl);
  await flushReport();
}

/** Same router-first rule as the run itself, so finishing doesn't cost a reload */
function returnTo(url: string): void {
  if (!url || url === location.href) return;

  const externalId = /\/app\/([a-zA-Z0-9_-]+)/.exec(url)?.[1];
  if (externalId) {
    navigateToConversation(externalId);
    return;
  }

  try {
    navigate(new URL(url).pathname);
  } catch {
    location.assign(url);
  }
}

async function flushReport(): Promise<void> {
  const report = await takeSyncReport();
  if (!report) return;

  const incomplete = report.partial + report.failed;
  if (incomplete === 0) {
    toast.success(i18n.t('agent.sync.doneAll', { count: report.done }));
  } else {
    toast.warning(
      i18n.t('agent.sync.donePartial', { count: report.done, incomplete }),
    );
  }

  // Separate line on purpose: "this batch went fine" and "the job isn't over" are two
  // different facts, and the second is the one that decides whether to run it again.
  if (report.remaining && report.remaining > 0) {
    toast.info(i18n.t('agent.sync.remaining', { count: report.remaining }));
  }
}

/**
 * How many conversations on this platform still have no messages.
 *
 * Read straight from the DB rather than derived from the job, because the job's 50
 * were only ever the first page of the problem.
 */
async function countUnsynced(platform: string): Promise<number | null> {
  // Ours by construction (`SYNC_PLATFORM`), but it round-trips through storage before
  // it lands in a SQL string, so it gets checked rather than trusted.
  if (!/^[a-z_]+$/.test(platform)) return null;

  const sql = `
    SELECT COUNT(*) AS remaining
    FROM conversations c
    WHERE c.deleted_at IS NULL
      AND c.platform = '${platform}'
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
  `;

  try {
    const response = await browser.runtime.sendMessage({
      type: 'EXECUTE_SQL',
      payload: { sql },
    });
    if (!response?.success) return null;
    const value = response.data?.[0]?.remaining;
    return typeof value === 'number' ? value : null;
  } catch (e) {
    // Only feeds a toast — a failed count must not fail the run.
    console.warn('[AgentLoop][sync] could not count remaining conversations', e);
    return null;
  }
}

// ─── Waiting ─────────────────────────────────────────────────────────────────

function hasMessages(): boolean {
  return !!document.querySelector('[id*="message-content-id"]');
}

/**
 * Enough of the message list to tell one conversation's history from another's.
 *
 * Count included as well as the end ids: it also moves as older pages load, which is
 * the signal the render wait is really after.
 */
function messageFingerprint(): string | null {
  const nodes = document.querySelectorAll('[id*="message-content-id"]');
  if (nodes.length === 0) return null;
  return `${nodes.length}:${nodes[0].id}:${nodes[nodes.length - 1].id}`;
}

/**
 * Poll rather than observe, because every wait here has to be interruptible and a
 * MutationObserver would need the same timer alongside it to notice a cancel.
 */
async function waitFor(
  predicate: () => boolean,
  timeout: number,
  token: RunToken,
): Promise<boolean> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (token.cancelled) return false;
    if (predicate()) return true;
    await wait(POLL_INTERVAL);
  }

  return !token.cancelled && predicate();
}
