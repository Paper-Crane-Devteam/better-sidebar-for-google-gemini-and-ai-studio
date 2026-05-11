/**
 * Smart merge logic for GDrive sync.
 * Merges remote data with local data using updated_at timestamps.
 *
 * Deletion strategy (no tombstones needed):
 * Uses lastSyncTime as the boundary to distinguish "deleted elsewhere"
 * from "created locally since last sync":
 *
 *  - Local has it, remote doesn't, updated_at < lastSyncTime
 *    → It existed at last sync, remote removed it → delete local
 *  - Local has it, remote doesn't, updated_at >= lastSyncTime
 *    → Created locally after last sync → keep it
 *  - First sync ever (lastSyncTime = 0) → never delete, only insert/update
 */

import { runQuery, runCommand, runBatch } from '@/shared/db';
import type { SyncPayload } from './sync-data';

/** Tables to merge (order matters for FK constraints) */
const MERGE_TABLES = [
  'prompt_folders',
  'prompts',
  'folders',
  'conversations',
  'favorites',
  'tags',
  'conversation_tags',
] as const;

/** Tables to delete in reverse order (dependents first) */
const DELETE_ORDER = [...MERGE_TABLES].reverse();

export interface MergeResult {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

/**
 * Merge remote sync data into local DB.
 *
 * @param remoteJson - JSON string of the remote SyncPayload
 * @param lastSyncTime - Unix timestamp (seconds) of the last successful sync.
 *                        Pass 0 for first-ever sync (disables deletion).
 */
export async function mergeSyncData(
  remoteJson: string,
  lastSyncTime: number,
): Promise<MergeResult> {
  const remote: SyncPayload = JSON.parse(remoteJson);

  if (!remote.version || !remote.tables) {
    throw new Error('Invalid sync data format');
  }

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;
  let totalSkipped = 0;

  await runCommand('PRAGMA foreign_keys = OFF');

  try {
    // --- Phase 1: Insert & Update (parent tables first) ---
    for (const table of MERGE_TABLES) {
      const remoteRows: any[] = remote.tables[table] || [];
      if (remoteRows.length === 0) continue;

      const localRows: any[] = (await runQuery(`SELECT * FROM ${table}`)) || [];
      const localMap = new Map<string, any>();
      for (const row of localRows) {
        localMap.set(row.id, row);
      }

      const ops: { sql: string; bind?: any[] }[] = [];

      for (const remoteRow of remoteRows) {
        const localRow = localMap.get(remoteRow.id);

        if (!localRow) {
          // Remote-only: check if it was locally deleted
          if (lastSyncTime > 0) {
            const remoteTime = remoteRow.updated_at || remoteRow.created_at || 0;
            if (remoteTime < lastSyncTime) {
              // Record existed at last sync but local doesn't have it now
              // → was deleted locally → skip
              totalSkipped++;
              continue;
            }
          }
          // Truly new from remote → insert
          const columns = Object.keys(remoteRow);
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map((col) => remoteRow[col]);
          ops.push({
            sql: `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
            bind: values,
          });
          totalInserted++;
        } else {
          // Both exist → compare timestamps
          const localTime = localRow.updated_at || localRow.created_at || 0;
          const remoteTime = remoteRow.updated_at || remoteRow.created_at || 0;

          if (remoteTime > localTime) {
            const columns = Object.keys(remoteRow).filter((c) => c !== 'id');
            if (columns.length === 0) {
              totalSkipped++;
              continue;
            }
            const sets = columns.map((c) => `${c} = ?`).join(', ');
            const values = [...columns.map((c) => remoteRow[c]), remoteRow.id];
            ops.push({
              sql: `UPDATE ${table} SET ${sets} WHERE id = ?`,
              bind: values,
            });
            totalUpdated++;
          } else {
            totalSkipped++;
          }
        }
      }

      const BATCH_SIZE = 100;
      for (let i = 0; i < ops.length; i += BATCH_SIZE) {
        await runBatch(ops.slice(i, i + BATCH_SIZE));
      }
    }

    // --- Phase 2: Delete stale local rows (dependents first) ---
    // Skip deletion on first-ever sync (no baseline to compare against)
    if (lastSyncTime > 0) {
      for (const table of DELETE_ORDER) {
        const remoteRows: any[] = remote.tables[table] || [];
        const remoteIds = new Set(remoteRows.map((r) => r.id));

        const localRows: any[] =
          (await runQuery(`SELECT * FROM ${table}`)) || [];

        const deleteOps: { sql: string; bind?: any[] }[] = [];

        for (const localRow of localRows) {
          if (remoteIds.has(localRow.id)) continue; // exists on remote, keep

          // Local-only: check if it's older than last sync
          const rowTime =
            localRow.updated_at || localRow.created_at || 0;

          if (rowTime < lastSyncTime) {
            // Existed before last sync but remote doesn't have it
            // → was deleted on another device → delete locally
            deleteOps.push({
              sql: `DELETE FROM ${table} WHERE id = ?`,
              bind: [localRow.id],
            });
            totalDeleted++;
          }
          // else: created after last sync → keep
        }

        const BATCH_SIZE = 100;
        for (let i = 0; i < deleteOps.length; i += BATCH_SIZE) {
          await runBatch(deleteOps.slice(i, i + BATCH_SIZE));
        }
      }
    }
  } finally {
    await runCommand('PRAGMA foreign_keys = ON');
  }

  return {
    inserted: totalInserted,
    updated: totalUpdated,
    deleted: totalDeleted,
    skipped: totalSkipped,
  };
}
