/**
 * Auto-sync manager for Google Drive.
 *
 * SW-safe design: all state is persisted to browser.storage.local,
 * all scheduling uses chrome.alarms (survives SW termination).
 * No setTimeout, no in-memory-only state for scheduling.
 *
 * Responsibilities:
 * - Periodic sync via chrome.alarms (every 25 min)
 * - Debounced sync via chrome.alarms (replaces setTimeout)
 * - Pending sync dbName persisted to storage (survives SW restart)
 * - Lock to prevent concurrent syncs
 * - Retry with backoff on transient errors
 * - Silent token refresh (no user interaction during auto-sync)
 */

import { getAccessToken, getAuthStatus } from './google-auth';
import { findFile, uploadFile, downloadFile } from './gdrive-api';
import { exportSyncData } from './sync-data';
import { mergeSyncData } from './sync-merge';

// --- Constants ---

const PERIODIC_ALARM = 'gdrive-auto-sync';
const DEBOUNCE_ALARM = 'gdrive-debounce-sync';
const SYNC_INTERVAL_MINUTES = 25;
const DEBOUNCE_MINUTES = 0.5; // 30 seconds as fractional minutes
const LOCK_KEY = 'gdrive_sync_lock';
const LOCK_TTL_MS = 2 * 60 * 1000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000;
const PAGE_LOAD_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/** Storage key for the pending debounce sync's target dbName */
const PENDING_SYNC_DB_KEY = 'gdrive_pending_sync_db';

// --- In-memory guard (within a single SW lifecycle) ---

let isSyncing = false;

// --- Lock (persisted, survives SW restart) ---

async function acquireLock(): Promise<boolean> {
  const result = await browser.storage.local.get(LOCK_KEY);
  const lockTime = result[LOCK_KEY] as number | undefined;

  if (lockTime && Date.now() - lockTime < LOCK_TTL_MS) {
    return false;
  }

  await browser.storage.local.set({ [LOCK_KEY]: Date.now() });
  return true;
}

async function releaseLock(): Promise<void> {
  await browser.storage.local.remove(LOCK_KEY);
}

// --- Error classification ---

function isRetryable(err: any): boolean {
  if (!err?.response) return true;
  const status = err.response?.status;
  return status === 429 || status >= 500;
}

// --- Helpers ---

function buildSyncFileName(dbName: string): string {
  return `better-sidebar-sync__${dbName}.json`;
}

function buildSyncMetaKey(dbName: string): string {
  return `gdrive_last_sync_time__${dbName}`;
}

export interface AutoSyncOptions {
  dbName: string;
  ensureActiveDb?: () => Promise<void>;
  onSyncComplete?: () => void;
}

// --- Core sync ---

/**
 * Perform a bidirectional merge sync.
 * Singleton: if already syncing, returns immediately.
 */
export async function performMergeSync(
  opts: AutoSyncOptions,
  retries = MAX_RETRIES,
): Promise<{ success: boolean; error?: string }> {
  if (isSyncing) {
    console.log('[AutoSync] Already syncing, skipping');
    return { success: false, error: 'Already syncing' };
  }

  if (!(await acquireLock())) {
    console.log('[AutoSync] Lock held, skipping');
    return { success: false, error: 'Another sync in progress' };
  }

  isSyncing = true;

  try {
    if (opts.ensureActiveDb) {
      await opts.ensureActiveDb();
    }

    const token = await getAccessToken(true);
    const syncFileName = buildSyncFileName(opts.dbName);
    const metaKey = buildSyncMetaKey(opts.dbName);

    // Step 1: Pull & merge
    const existing = await findFile(token, syncFileName);
    if (existing) {
      const remoteData = await downloadFile(token, existing.id);

      // Read lastSyncTime to distinguish "deleted elsewhere" from "new locally"
      const metaResult = await browser.storage.local.get(metaKey);
      const lastSyncTime = (metaResult[metaKey] as number) || 0;

      const result = await mergeSyncData(remoteData, lastSyncTime);
      console.log(
        `[AutoSync] Merge: +${result.inserted} ins, ~${result.updated} upd, -${result.deleted} del, =${result.skipped} skip`,
      );
    }

    // Step 2: Export & push
    const localData = await exportSyncData();
    const file = existing || (await findFile(token, syncFileName));
    await uploadFile(token, syncFileName, localData, file?.id);

    const now = Math.floor(Date.now() / 1000);
    await browser.storage.local.set({ [metaKey]: now });

    opts.onSyncComplete?.();
    return { success: true };
  } catch (err: any) {
    if (retries > 0 && isRetryable(err)) {
      console.warn(`[AutoSync] Retrying... (${retries} left)`, err.message);
      isSyncing = false;
      await releaseLock();
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return performMergeSync(opts, retries - 1);
    }

    console.error('[AutoSync] Failed:', err.message);
    return { success: false, error: err.message };
  } finally {
    isSyncing = false;
    await releaseLock();
  }
}

// --- Debounce scheduling (alarm-based, SW-safe) ---

/**
 * Schedule a debounced merge sync using chrome.alarms.
 * Persists the target dbName to storage so it survives SW restarts.
 *
 * Multiple calls coalesce: each call resets the alarm and overwrites
 * the pending dbName with the CURRENT profile's dbName.
 */
export async function scheduleDebouncedSync(dbName: string): Promise<void> {
  // Persist which db needs syncing
  await browser.storage.local.set({ [PENDING_SYNC_DB_KEY]: dbName });

  // (Re)create the debounce alarm — this resets the countdown
  browser.alarms.create(DEBOUNCE_ALARM, {
    delayInMinutes: DEBOUNCE_MINUTES,
  });

  console.log(`[AutoSync] Debounce scheduled for db: ${dbName}`);
}

/**
 * Flush any pending debounced sync immediately.
 * Call BEFORE switching active tab so the sync uses the old profile.
 */
export async function flushPendingSync(
  ensureActiveDb: () => Promise<void>,
  onSyncComplete?: () => void,
): Promise<boolean> {
  const result = await browser.storage.local.get(PENDING_SYNC_DB_KEY);
  const dbName = result[PENDING_SYNC_DB_KEY] as string | undefined;

  if (!dbName) return false;

  // Cancel the pending alarm
  await browser.alarms.clear(DEBOUNCE_ALARM);
  // Clear the persisted state
  await browser.storage.local.remove(PENDING_SYNC_DB_KEY);

  console.log(`[AutoSync] Flushing pending sync for db: ${dbName}`);

  const auth = await getAuthStatus();
  if (!auth.isAuthenticated) return false;

  await performMergeSync({ dbName, ensureActiveDb, onSyncComplete });
  return true;
}

// --- Alarm handling ---

/**
 * Register the periodic alarm. Call once at SW startup.
 */
export function registerAutoSyncAlarm(): void {
  browser.alarms.create(PERIODIC_ALARM, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });
  console.log(`[AutoSync] Periodic alarm: every ${SYNC_INTERVAL_MINUTES} min`);
}

/**
 * Handle ALL auto-sync alarm events (periodic + debounce).
 * Wire this to chrome.alarms.onAlarm in background/index.ts.
 */
export async function handleAutoSyncAlarm(
  alarm: { name: string },
  getDbName: () => string,
  ensureActiveDb: () => Promise<void>,
  onSyncComplete?: () => void,
): Promise<void> {
  if (alarm.name === DEBOUNCE_ALARM) {
    // Debounce alarm fired — read the persisted dbName
    const result = await browser.storage.local.get(PENDING_SYNC_DB_KEY);
    const dbName = result[PENDING_SYNC_DB_KEY] as string | undefined;

    // Clear persisted state
    await browser.storage.local.remove(PENDING_SYNC_DB_KEY);

    if (!dbName) return;

    const auth = await getAuthStatus();
    if (!auth.isAuthenticated) return;

    console.log(`[AutoSync] Debounce alarm fired for db: ${dbName}`);
    notifySyncingState(true);
    try {
      await performMergeSync({ dbName, ensureActiveDb, onSyncComplete });
    } finally {
      notifySyncingState(false);
    }
    return;
  }

  if (alarm.name === PERIODIC_ALARM) {
    const auth = await getAuthStatus();
    if (!auth.isAuthenticated) {
      console.log('[AutoSync] Not authenticated, skipping periodic sync');
      return;
    }

    console.log('[AutoSync] Periodic sync triggered');
    notifySyncingState(true);
    try {
      await performMergeSync({
        dbName: getDbName(),
        ensureActiveDb,
        onSyncComplete,
      });
    } finally {
      notifySyncingState(false);
    }
  }
}

/**
 * Check if auto-sync is currently in progress.
 */
export function isAutoSyncing(): boolean {
  return isSyncing;
}

// --- Syncing state change callback ---

let onSyncingStateChange: ((syncing: boolean) => void) | null = null;

/**
 * Register a callback to be notified when syncing state changes.
 * Used by the background to update pegasus store's gdriveSyncing flag.
 */
export function onSyncingChange(cb: (syncing: boolean) => void): void {
  onSyncingStateChange = cb;
}

function notifySyncingState(syncing: boolean): void {
  onSyncingStateChange?.(syncing);
}

// --- Page-load sync ---

/** Storage key for the last page-load sync timestamp */
const PAGE_LOAD_SYNC_TIME_KEY = 'gdrive_page_load_sync_time';

/**
 * Trigger a merge sync on page load if enough time has passed since the last sync.
 * Called after SYNC_CONVERSATIONS completes in the background.
 * Uses a 5-minute cooldown to avoid redundant syncs.
 */
export async function triggerSyncOnPageLoad(
  dbName: string,
  ensureActiveDb: () => Promise<void>,
  onSyncComplete?: () => void,
): Promise<void> {
  const auth = await getAuthStatus();
  if (!auth.isAuthenticated) return;

  const result = await browser.storage.local.get(PAGE_LOAD_SYNC_TIME_KEY);
  const lastTime = (result[PAGE_LOAD_SYNC_TIME_KEY] as number) || 0;

  if (Date.now() - lastTime < PAGE_LOAD_SYNC_COOLDOWN_MS) {
    console.log('[AutoSync] Page-load sync skipped (cooldown)');
    return;
  }

  await browser.storage.local.set({ [PAGE_LOAD_SYNC_TIME_KEY]: Date.now() });

  console.log('[AutoSync] Page-load sync triggered');
  notifySyncingState(true);
  try {
    await performMergeSync({ dbName, ensureActiveDb, onSyncComplete });
  } finally {
    notifySyncingState(false);
  }
}
