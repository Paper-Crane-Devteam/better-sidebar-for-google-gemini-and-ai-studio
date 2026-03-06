/**
 * Sync data export/import layer.
 * Handles reading tables from SQLite and writing them back.
 * Excludes messages and messages_fts tables.
 */

import { runQuery, runCommand, runBatch } from '@/shared/db';

/** Tables to sync (order matters for foreign key constraints) */
const SYNC_TABLES = [
  'prompt_folders',
  'prompts',
  'folders',
  'conversations',
  'favorites',
  'tags',
  'conversation_tags',
] as const;

export interface SyncPayload {
  version: number;
  exportedAt: number;
  tables: Record<string, any[]>;
}

/**
 * Export all syncable tables as a JSON string
 */
export async function exportSyncData(): Promise<string> {
  const tables: Record<string, any[]> = {};

  for (const table of SYNC_TABLES) {
    const rows = await runQuery(`SELECT * FROM ${table}`);
    tables[table] = rows || [];
  }

  const payload: SyncPayload = {
    version: 1,
    exportedAt: Math.floor(Date.now() / 1000),
    tables,
  };

  return JSON.stringify(payload);
}

/**
 * Import sync data into local DB (overwrite mode).
 * Clears existing data in sync tables, then inserts new data.
 * Messages table is NOT touched.
 */
export async function importSyncData(jsonString: string): Promise<void> {
  const payload: SyncPayload = JSON.parse(jsonString);

  if (!payload.version || !payload.tables) {
    throw new Error('Invalid sync data format');
  }

  // Disable foreign keys for clean import
  await runCommand('PRAGMA foreign_keys = OFF');

  try {
    // Clear tables in reverse order (dependents first)
    const reversedTables = [...SYNC_TABLES].reverse();
    for (const table of reversedTables) {
      await runCommand(`DELETE FROM ${table}`);
    }

    // Insert data in order (parents first)
    for (const table of SYNC_TABLES) {
      const rows = payload.tables[table];
      if (!rows || rows.length === 0) continue;

      // Build batch insert operations
      const operations: { sql: string; bind?: any[] }[] = [];

      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((col) => row[col]);

        operations.push({
          sql: `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
          bind: values,
        });
      }

      // Execute in batches
      const BATCH_SIZE = 100;
      for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const batch = operations.slice(i, i + BATCH_SIZE);
        await runBatch(batch);
      }
    }
  } finally {
    // Re-enable foreign keys
    await runCommand('PRAGMA foreign_keys = ON');
  }
}
