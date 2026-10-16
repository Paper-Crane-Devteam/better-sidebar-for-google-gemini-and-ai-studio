/**
 * Tab-Profile Map
 *
 * Tracks which database each browser tab should be using.
 * This solves the multi-tab race condition where two tabs with different
 * accounts both send messages to the background, but the background only
 * has one active DB connection.
 *
 * Before processing any DB message, the background resolves the sender tab's
 * database here and runs the handler inside a `withDb` lease on it, so the
 * whole handler — not just its first query — lands in that tab's profile.
 *
 * Also tracks the currently active (focused) tab so that auto-sync
 * always operates on the correct profile.
 */

import { getOpenDbName, switchDB } from '@/shared/db';
import { detectPlatform, Platform } from '@/shared/types/platform';

/**
 * The tab's account has been detected but belongs to no profile yet — the user is
 * being asked to pick one. Nothing from this tab may touch any database until then:
 * whatever is open belongs to some other account.
 */
export const UNBOUND = Symbol('unbound');

interface TabEntry {
  /** dbName, or null while the account is unbound */
  db: string | null;
  /**
   * Which signed-in account the page was on when this was recorded (`/u/N` on
   * Gemini). Google switches accounts with a full navigation in the same tab, so a
   * stale entry would otherwise route the new account's first writes — sent before
   * its own DETECT_ACCOUNT lands — into the old account's profile.
   */
  hint: string;
}

/**
 * Persisted in `storage.session` because this lives in service-worker memory: the
 * SW is killed after ~30s idle, and a wiped map made every tab fall back to
 * "whatever database is open" — another tab's profile, half the time. Session
 * storage survives SW restarts and is cleared with the browser, as are tab ids.
 */
const STORAGE_KEY = 'tab-profile-map';
const tabDbMap = new Map<number, TabEntry>();

const loaded: Promise<void> = (async () => {
  try {
    const stored = (await browser.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
    if (stored && typeof stored === 'object') {
      for (const [id, entry] of Object.entries(stored as Record<string, TabEntry>)) {
        if (!tabDbMap.has(Number(id))) tabDbMap.set(Number(id), entry);
      }
    }
  } catch (e) {
    console.warn('[TabProfileMap] Could not restore map from session storage:', e);
  }
})();

function persist() {
  const plain = Object.fromEntries(tabDbMap);
  browser.storage.session.set({ [STORAGE_KEY]: plain }).catch((e) => {
    console.warn('[TabProfileMap] Could not persist map:', e);
  });
}

/** Waiters for a tab's first mapping, see `resolveTabDb` */
const mappingWaiters = new Map<number, Set<() => void>>();

/** `${tabId}:${hint}` pairs that already timed out waiting for detection */
const undetected = new Set<string>();

/**
 * The account a page URL is signed into, as far as the URL says.
 * Empty when the platform doesn't put it in the URL.
 */
export function accountHint(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    // Gemini only: every URL of a signed-in page carries `/u/N` (absent = 0).
    // AI Studio's `authuser` comes and goes between pages of one session, so
    // treating it as identity would make the same account look like a new one.
    if (u.hostname === 'gemini.google.com') {
      return /^\/u\/(\d+)(\/|$)/.exec(u.pathname)?.[1] ?? '0';
    }
  } catch {
    // Not a URL we can read; no hint.
  }
  return '';
}

/**
 * Register which DB a tab is associated with, or `UNBOUND`.
 */
export function setTabDb(tabId: number, dbName: string | typeof UNBOUND, url?: string) {
  const db = dbName === UNBOUND ? null : dbName;
  const hint = accountHint(url);
  const prev = tabDbMap.get(tabId);
  tabDbMap.set(tabId, { db, hint });
  undetected.delete(`${tabId}:${hint}`);
  if (prev?.db !== db || prev?.hint !== hint) {
    console.log(`[TabProfileMap] Tab ${tabId} → ${db ?? '(unbound)'}`);
    persist();
  }
  const waiters = mappingWaiters.get(tabId);
  if (waiters) {
    mappingWaiters.delete(tabId);
    for (const wake of waiters) wake();
  }
}

/**
 * The current DB name, or null if it hasn't been established yet.
 * Inside a tab's lease this is that tab's database.
 * Callers must not substitute a default.
 */
export function getCurrentDbName(): string | null {
  return getOpenDbName();
}

// Track the browser's currently active/focused tab
let activeTabId: number | null = null;

/**
 * Set the currently active (focused) tab.
 * Called from chrome.tabs.onActivated listener.
 */
export function setActiveTabId(tabId: number) {
  activeTabId = tabId;
}

/**
 * Get the active tab's ID, or null if unknown.
 */
export function getActiveTabId(): number | null {
  return activeTabId;
}

/**
 * Get the dbName for the active tab.
 * Falls back to the open database if the active tab has no mapping, and to null
 * if neither is known.
 */
export function getActiveDbName(): string | null {
  if (activeTabId != null) {
    const db = tabDbMap.get(activeTabId)?.db;
    if (db) return db;
  }
  return getOpenDbName();
}

/** Platforms whose content script reports DETECT_ACCOUNT on load */
const DETECTING_PLATFORMS = new Set<Platform>([
  Platform.GEMINI,
  Platform.AI_STUDIO,
  Platform.CHATGPT,
]);

/**
 * How long a message from a not-yet-identified tab waits for its DETECT_ACCOUNT.
 * Detection itself times out well inside this; past it the account is treated as
 * undetectable and the tab falls back to the open database, as before.
 */
const MAPPING_WAIT_MS = 8000;

/**
 * Which database a message from this tab must run against.
 *
 * - a dbName: run inside a lease on it
 * - `UNBOUND`: refuse — the account has no profile yet
 * - null: no opinion (not a platform tab, or its account can't be detected);
 *   the caller uses whatever is open
 *
 * A platform tab with no entry — or an entry recorded for a different account in
 * the same tab — waits for its DETECT_ACCOUNT instead of guessing. Writes captured
 * in the first seconds of a page load (interceptor turns, the initial list sync)
 * are exactly the ones that used to land in the wrong profile.
 */
export async function resolveTabDb(
  tabId: number,
  url: string | undefined,
): Promise<string | typeof UNBOUND | null> {
  await loaded;

  const hint = accountHint(url);
  const current = () => {
    const entry = tabDbMap.get(tabId);
    return entry && entry.hint === hint ? entry : undefined;
  };

  let entry = current();
  if (!entry) {
    let platform = Platform.UNKNOWN;
    try {
      if (url) platform = detectPlatform(new URL(url).hostname);
    } catch {
      // Unreadable URL: not a platform tab.
    }
    if (!DETECTING_PLATFORMS.has(platform)) return null;

    const undetectedKey = `${tabId}:${hint}`;
    if (undetected.has(undetectedKey)) return null;

    await waitForMapping(tabId, MAPPING_WAIT_MS);
    entry = current();
    if (!entry) {
      // Remembered so the rest of this page's messages don't each pay the wait.
      undetected.add(undetectedKey);
      console.warn(
        `[TabProfileMap] Tab ${tabId} has no detected account after ${MAPPING_WAIT_MS}ms; using the open database`,
      );
      return null;
    }
  }

  return entry.db ?? UNBOUND;
}

function waitForMapping(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let set = mappingWaiters.get(tabId);
    if (!set) {
      set = new Set();
      mappingWaiters.set(tabId, set);
    }
    const waiters = set;
    const done = () => {
      clearTimeout(timer);
      waiters.delete(done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    waiters.add(done);
  });
}

/**
 * Switch the background DB to what the sender tab expects.
 *
 * For callers outside the message pipeline that need the tab's database open and
 * then issue their own queries. Prefer a `withDb` lease where possible: a switch
 * alone does not stop another tab from switching away again before those queries
 * run.
 */
export async function ensureDbForTab(tabId: number | undefined): Promise<boolean> {
  if (!tabId) return false;
  await loaded;
  const expectedDb = tabDbMap.get(tabId)?.db;
  if (!expectedDb) return false;
  if (expectedDb === getOpenDbName()) return false;

  console.log(`[TabProfileMap] Auto-switching DB for tab ${tabId}: ${getOpenDbName()} → ${expectedDb}`);
  await switchDB(expectedDb);
  return true;
}

/**
 * Clean up when a tab is closed.
 */
export function removeTab(tabId: number) {
  if (tabDbMap.delete(tabId)) persist();
  for (const key of undetected) {
    if (key.startsWith(`${tabId}:`)) undetected.delete(key);
  }
  if (activeTabId === tabId) {
    activeTabId = null;
  }
}
