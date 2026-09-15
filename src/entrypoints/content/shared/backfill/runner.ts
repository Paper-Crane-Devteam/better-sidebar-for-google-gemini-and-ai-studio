/**
 * Silent history backfill: fills in the transcripts of conversations the user has
 * never opened in this browser.
 *
 * The normal capture path is an interception, so a conversation only gets its
 * messages once it is visited. Everything the library scan listed but nobody read
 * shows up in the sidebar as a title with nothing inside it — invisible to search,
 * to the agent, to export. This closes that gap without navigating anywhere.
 *
 * Split across three contexts because no single one can do the job:
 *
 *   background      which conversations are missing a transcript (owns the DB)
 *   content script  when to ask, how fast, and whether to ask at all (this file)
 *   main world      the request itself (owns the captured auth parameters)
 *
 * The pacing is the design, not a detail. This is unattended traffic on the user's
 * own session, so it stays at a rate a person could plausibly produce: a few
 * conversations every half minute, one request at a time, nothing while the user
 * is mid-generation, and only ever from one tab. See `constants/backfill.ts`.
 *
 * The fetch-and-store step itself lives in `shared/lib/backfill/sync.ts`, shared
 * with the status dialog where the user syncs a chat by hand.
 */

import {
  BACKFILL_CYCLE_MS,
  BACKFILL_GAP_MS,
  BACKFILL_MANUAL_ACTIVITY_EVENT,
  BACKFILL_PER_CYCLE,
  BACKFILL_QUIET_AFTER_GENERATE_MS,
  BACKFILL_STALE_SLACK_SEC,
  BACKFILL_START_DELAY_MS,
} from '@/shared/constants/backfill';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { syncConversationMessages } from '@/shared/lib/backfill/sync';
import type { Platform } from '@/shared/types/platform';
import { trace } from '@/shared/lib/trace';
import { BackfillLedger } from './ledger';
import { BackfillLock } from './lock';

export interface BackfillCandidate {
  id: string;
  last_active_at: number | null;
  message_count: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Consecutive empty answers that make us suspect the platform rather than the chats. */
const UNPRODUCTIVE_STREAK_LIMIT = 3;

export class BackfillRunner {
  private readonly ledger: BackfillLedger;
  private readonly lock: BackfillLock;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private armed = false;
  private cycleRunning = false;
  /** Until when the page is considered busy on the user's behalf. */
  private quietUntil = 0;

  constructor(private readonly platform: Platform) {
    this.ledger = new BackfillLedger(platform);
    this.lock = new BackfillLock(platform);
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    // Two things mean "not now", and both arrive as DOM events because neither
    // originates in this module: a generation the user started (dispatched from the
    // main world), and the status dialog fetching transcripts itself (dispatched
    // from the overlay). The second one matters as much as the first — without it a
    // manual batch and this scheduler would double the request rate between them.
    const standDown = () => {
      this.quietUntil = Date.now() + BACKFILL_QUIET_AFTER_GENERATE_MS;
    };
    window.addEventListener('BETTER_SIDEBAR_GENERATE_START', standDown);
    window.addEventListener(BACKFILL_MANUAL_ACTIVITY_EVENT, standDown);

    // Hand the lock back on the way out so a sibling tab can pick up straight
    // away instead of waiting out the TTL.
    window.addEventListener('pagehide', () => {
      void this.lock.release();
    });

    // Driven by the setting rather than gated on it, so a user who never turns
    // this on pays for no timer and reads no log line about it. The store is
    // hydrated asynchronously from `storage.local` and mirrors changes made in any
    // tab, so this fires both on hydration and when the switch is flipped.
    this.applySetting(useSettingsStore.getState().backfillHistory);
    useSettingsStore.subscribe((state) => this.applySetting(state.backfillHistory));
  }

  private applySetting(enabled: boolean): void {
    if (enabled === this.armed) return;
    this.armed = enabled;

    if (!enabled) {
      if (this.timer) clearInterval(this.timer);
      if (this.startTimer) clearTimeout(this.startTimer);
      this.timer = null;
      this.startTimer = null;
      void this.lock.release();
      console.log(`[Backfill] Disabled for ${this.platform}`);
      return;
    }

    console.log(
      `[Backfill] Armed for ${this.platform} — first pass in ${Math.round(
        BACKFILL_START_DELAY_MS / 1000,
      )}s, then ${BACKFILL_PER_CYCLE} chat(s) every ${Math.round(BACKFILL_CYCLE_MS / 1000)}s`,
    );
    this.startTimer = setTimeout(() => {
      this.startTimer = null;
      void this.runCycle();
      this.timer = setInterval(() => void this.runCycle(), BACKFILL_CYCLE_MS);
    }, BACKFILL_START_DELAY_MS);
  }

  /**
   * Every gate is re-checked here, once per cycle, rather than latched at start:
   * the setting can be toggled, another tab can take the lock, the network can go
   * away. A cycle that finds any of them closed simply does nothing and waits.
   */
  private async runCycle(): Promise<void> {
    if (this.cycleRunning) return;
    if (!useSettingsStore.getState().backfillHistory) return;
    if (!navigator.onLine) return;
    if (Date.now() < this.quietUntil) {
      trace('[Backfill] Skipping cycle — page is busy');
      return;
    }
    if (!(await this.lock.acquire())) {
      trace('[Backfill] Skipping cycle — another tab holds the lock');
      return;
    }

    this.cycleRunning = true;
    try {
      await this.processBatch();
    } catch (err) {
      console.warn('[Backfill] Cycle failed', err);
    } finally {
      this.cycleRunning = false;
    }
  }

  private async processBatch(): Promise<void> {
    const candidates = await this.getCandidates();
    if (candidates.length === 0) return;

    console.log(
      `[Backfill] ${candidates.length} conversation(s) to fill in (${this.platform})`,
    );

    // A run of conversations that all come back with nothing is far more likely to
    // mean something changed on the platform's side than that the user has three
    // empty chats in a row. Stopping keeps a format change from writing the whole
    // library off as unproductive.
    let unproductiveInARow = 0;

    for (let i = 0; i < candidates.length; i++) {
      if (i > 0) await sleep(BACKFILL_GAP_MS);

      // Re-checked inside the loop: a cycle spans minutes, and the user may have
      // switched the setting off or started a generation since it began.
      if (!useSettingsStore.getState().backfillHistory) return;
      if (Date.now() < this.quietUntil) {
        trace('[Backfill] Stopping batch — page became busy');
        return;
      }

      const outcome = await this.processOne(candidates[i]);
      if (outcome === 'abort') return;

      unproductiveInARow = outcome === 'saved' ? 0 : unproductiveInARow + 1;
      if (unproductiveInARow >= UNPRODUCTIVE_STREAK_LIMIT) {
        console.warn(
          `[Backfill] ${unproductiveInARow} conversations in a row produced nothing — stopping this cycle`,
        );
        return;
      }
    }
  }

  /**
   * `abort` means the problem is not with this conversation.
   *
   * A request builder that has not learned its parameters yet, an HTTP failure, a
   * timeout, a database that refused the write — those describe the page or the
   * session, and letting them mark conversations as unproductive would put a
   * cooldown on the entire library the first time a token went stale. The next
   * cycle is no worse off for having stopped.
   */
  private async processOne(
    candidate: BackfillCandidate,
  ): Promise<'saved' | 'unproductive' | 'abort'> {
    const result = await syncConversationMessages(this.platform, candidate.id);

    if (!result.ok) {
      if (result.reason === 'not-ready') {
        trace('[Backfill] Request builder not ready yet, waiting for next cycle');
        return 'abort';
      }
      console.warn(
        `[Backfill] ${candidate.id} failed (${result.reason}${result.detail ? `: ${result.detail}` : ''})`,
      );
      if (result.reason === 'parse') {
        // The response arrived and we could not make sense of it. Recorded against
        // the conversation, but the streak limit above is what stops this from
        // spreading if the cause is the format rather than the chat.
        await this.ledger.recordAttempt(candidate.id);
        return 'unproductive';
      }
      return 'abort';
    }

    if (result.stored === 0) {
      // A real, successful answer that happens to be empty. Cool the conversation
      // down or it stays a candidate forever.
      trace(`[Backfill] ${candidate.id} has no messages`);
      await this.ledger.recordAttempt(candidate.id);
      return 'unproductive';
    }

    // A conversation that already had messages was picked for looking stale, and
    // "stale" is a weak signal: `last_active_at` comes from the list endpoint,
    // which does not always supply one — the sync then substitutes the current
    // time, and the row looks permanently newer than its own newest message.
    // Re-reading it returns the same transcript and leaves it looking exactly as
    // stale, so without a cooldown it would come back every cycle forever.
    //
    // Refreshes that genuinely find new turns settle the condition on their own
    // and leave the candidate set regardless, so the entry costs them nothing.
    if (candidate.message_count === 0) {
      await this.ledger.clear(candidate.id);
    } else {
      await this.ledger.recordAttempt(candidate.id);
    }

    console.log(
      `[Backfill] Stored ${result.stored} message(s) for ${candidate.id}` +
        (result.pages && result.pages > 1 ? ` (${result.pages} pages)` : ''),
    );
    return 'saved';
  }

  private async getCandidates(): Promise<BackfillCandidate[]> {
    const response = await browser.runtime.sendMessage({
      type: 'GET_BACKFILL_CANDIDATES',
      payload: {
        platform: this.platform,
        limit: BACKFILL_PER_CYCLE,
        staleSlackSec: BACKFILL_STALE_SLACK_SEC,
        excludeIds: await this.ledger.cooldownIds(),
      },
    });

    if (!response?.success) {
      trace('[Backfill] Could not read candidates:', response?.error);
      return [];
    }
    return (response.data ?? []) as BackfillCandidate[];
  }
}
