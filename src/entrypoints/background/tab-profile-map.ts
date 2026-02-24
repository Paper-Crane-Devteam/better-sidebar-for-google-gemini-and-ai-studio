/**
 * Tab-Profile Map
 *
 * Tracks which database each browser tab should be using.
 * This solves the multi-tab race condition where two tabs with different
 * accounts both send messages to the background, but the background only
 * has one active DB connection.
 *
 * Before processing any DB message, the background checks this map and
 * auto-switches the DB if the sender tab expects a different database.
 */

import { switchDB } from '@/shared/db';

// tabId → dbName
const tabDbMap = new Map<number, string>();

// Track the currently active dbName in the background
let currentDbName = 'prompt-manager-for-google-ai-studio.db';

/**
 * Register which DB a tab is associated with.
 */
export function setTabDb(tabId: number, dbName: string) {
  tabDbMap.set(tabId, dbName);
  console.log(`[TabProfileMap] Tab ${tabId} → ${dbName}`);
}

/**
 * Update the current DB name (called after any DB switch).
 */
export function setCurrentDbName(dbName: string) {
  currentDbName = dbName;
}

/**
 * Get the current DB name.
 */
export function getCurrentDbName(): string {
  return currentDbName;
}

/**
 * Ensure the background DB matches what the sender tab expects.
 * Returns true if a switch was performed.
 */
export async function ensureDbForTab(tabId: number | undefined): Promise<boolean> {
  if (!tabId) return false;
  const expectedDb = tabDbMap.get(tabId);
  if (!expectedDb) return false;
  if (expectedDb === currentDbName) return false;

  console.log(`[TabProfileMap] Auto-switching DB for tab ${tabId}: ${currentDbName} → ${expectedDb}`);
  await switchDB(expectedDb);
  currentDbName = expectedDb;
  return true;
}

/**
 * Clean up when a tab is closed.
 */
export function removeTab(tabId: number) {
  tabDbMap.delete(tabId);
}
