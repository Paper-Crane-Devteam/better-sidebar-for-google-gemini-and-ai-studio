/**
 * Silent message backfill: the contract between the content script that schedules
 * the work and the main-world script that can actually talk to the platform API.
 *
 * The request has to originate in the page's own JS context — that is where the
 * captured auth parameters live (`request-builder.ts` learns them from real
 * traffic) — while the scheduling belongs to the content script, which can read
 * settings and reach the background DB. Hence a `CustomEvent` round trip.
 */

/** Ask the main world for one Gemini conversation's full transcript. */
export const GEMINI_BACKFILL_FETCH = 'BETTER_SIDEBAR_BACKFILL_FETCH_GEMINI';

/** Ask the main world for one AI Studio prompt's full transcript. */
export const AISTUDIO_BACKFILL_FETCH = 'BETTER_SIDEBAR_BACKFILL_FETCH_AISTUDIO';

/**
 * Why a fetch produced nothing usable.
 *
 * `not-ready` is the one the scheduler treats as "come back later" rather than a
 * failure of this conversation: it means the request builder has not seen a real
 * request yet, which is a property of the page, not of the conversation.
 */
export type BackfillFailureReason = 'not-ready' | 'http' | 'parse' | 'error';

export interface BackfillFetchResult {
  ok: boolean;
  reason?: BackfillFailureReason;
  detail?: string;
  /** Chronological, complete transcript. Empty is a valid answer. */
  messages?: {
    id?: string;
    role: 'user' | 'model';
    content: string;
    message_type: 'text' | 'thought';
    created_at?: number | null;
  }[];
  /** How many API round trips it took. Logged so pathological chats stand out. */
  pages?: number;
}

// ── Pacing ──────────────────────────────────────────────────────────────────
//
// This is unattended traffic against somebody else's API on the user's own
// session, so the number to reason about is the sustained rate, not the total
// time. As set below it is roughly six requests a minute, in bursts of three with
// a few seconds between them — about what someone clicking through their own
// history produces, except that it does not stop after a minute.
//
// That fills in a couple of hundred conversations in a quarter of an hour and a
// few thousand overnight. If the platform ever starts pushing back, the honest
// knob is `BACKFILL_PER_CYCLE` rather than the cycle length: fewer requests per
// wake-up keeps the bursts small, where a longer cycle just makes the same burst
// arrive less often.
//
// Nothing waits on any of this, so slower is always an acceptable answer.

/** Grace period after page load before the first cycle. Lets the page settle and the request builder learn its parameters. */
export const BACKFILL_START_DELAY_MS = 90_000;

/** How often the scheduler wakes up. */
export const BACKFILL_CYCLE_MS = 30_000;

/** Conversations per cycle. Together with the cycle above, roughly six requests a minute. */
export const BACKFILL_PER_CYCLE = 3;

/**
 * Pause between two conversations inside one cycle.
 *
 * Small enough that a full cycle finishes in well under `BACKFILL_CYCLE_MS`. It
 * does not have to — an overrunning cycle is skipped by the next tick rather than
 * overlapping it — but a schedule that routinely misses its own ticks is harder to
 * reason about than one that fits.
 */
export const BACKFILL_GAP_MS = 3_000;

/** Pause between two pages of the same conversation. */
export const BACKFILL_PAGE_GAP_MS = 1_500;

/**
 * Pause between conversations when the user asks for a batch by hand.
 *
 * Slower than the idle path's per-conversation gap even though someone is sitting
 * there watching. The idle path is self-limiting — three chats, then it sleeps —
 * whereas a manual run goes until the list is empty, so the sustained rate is the
 * whole story. At four seconds it is roughly a quarter of the requests per minute
 * that the idle scheduler produces in its bursts, which is the right trade for
 * something that might run for hundreds of conversations without pausing.
 */
export const BACKFILL_MANUAL_GAP_MS = 4_000;

/** Turns requested per page. The Gemini UI asks for 10; 100 is accepted and keeps most chats to a single request. */
export const BACKFILL_PAGE_SIZE = 100;

/** Hard stop on pagination, so a malformed cursor cannot loop. */
export const BACKFILL_MAX_PAGES = 20;

/** Skip a cycle while the page is busy on the user's behalf, for this long after the last sign of it. */
export const BACKFILL_QUIET_AFTER_GENERATE_MS = 60_000;

/**
 * The status dialog announcing that it is fetching something itself.
 *
 * Keeps the idle scheduler out of the way, so a manual batch and the background
 * pass cannot double the request rate between them. Sent repeatedly during a batch
 * rather than as a start/end pair — the scheduler reads it as "busy for the next
 * minute", which means a dialog closed mid-batch leaves nothing to clean up.
 *
 * A DOM event because the two live in different content scripts and share no
 * module state.
 */
export const BACKFILL_MANUAL_ACTIVITY_EVENT = 'BETTER_SIDEBAR_BACKFILL_MANUAL';

/**
 * How long a lock heartbeat stays valid.
 *
 * A fixed value, deliberately not a multiple of the cycle. The heartbeat is
 * written once per cycle, so the TTL has to cover the *worst* gap between two
 * heartbeats, and that has nothing to do with the nominal cycle length:
 *
 *  - a single cycle can run long — three conversations, each up to
 *    `BACKFILL_MAX_PAGES` requests, is a couple of minutes;
 *  - background tabs have their timers throttled to roughly once a minute, so a
 *    tick can arrive late by that much again;
 *  - a cycle that stands down for a generation in progress never reaches the
 *    heartbeat at all.
 *
 * Expiring early is the expensive direction: a second tab would decide the holder
 * is dead and start issuing the same requests in parallel, which is the one thing
 * the lock exists to prevent. Expiring late only delays a takeover after a tab is
 * closed, and closing normally releases the lock outright.
 */
export const BACKFILL_LOCK_TTL_MS = 5 * 60_000;

/**
 * How long to leave a conversation alone after asking about it gained us nothing.
 *
 * Indexed by consecutive such attempts. Some conversations match the candidate
 * query permanently and no amount of fetching will change that — an empty chat
 * stays empty, and a chat whose `last_active_at` is simply wrong stays "stale"
 * however many times we re-read the same transcript. The latter is not rare:
 * Gemini's list endpoint does not always report a timestamp, and the sync
 * substitutes the current time when it does not, which leaves the row looking
 * permanently newer than its own newest message.
 *
 * Without a growing cooldown those would be re-fetched on every cycle forever.
 */
export const BACKFILL_COOLDOWN_MS = [
  6 * 60 * 60_000, // 1st miss: 6h
  24 * 60 * 60_000, // 2nd miss: 1d
  7 * 24 * 60 * 60_000, // 3rd and beyond: 1w
];

/** Ledger entries older than this are forgotten, so the record cannot grow without bound. */
export const BACKFILL_LEDGER_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

/** Upper bound on ledger size; oldest entries are dropped first. */
export const BACKFILL_LEDGER_MAX_ENTRIES = 500;

/**
 * Slack allowed between a conversation's `last_active_at` and the newest message
 * we hold before we call it stale.
 *
 * Observed drift between the two is 0–5 seconds, so this is loose enough to
 * ignore it while still catching a chat that was continued in another browser.
 */
export const BACKFILL_STALE_SLACK_SEC = 900;
