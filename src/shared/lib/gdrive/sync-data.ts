/**
 * Sync data export/import layer.
 * Handles reading tables from SQLite and writing them back.
 * Excludes messages and messages_fts tables.
 */

import { runQuery, runCommand, runBatch } from '@/shared/db';

/**
 * Tables to sync (order matters for foreign key constraints).
 *
 * Parents must precede their dependents: snippet_folders before snippets,
 * folders before conversations, tags before conversation_tags.
 */
export const SYNC_TABLES = [
  'prompt_folders',
  'prompts',
  'folders',
  'collection_folders',
  'gems',
  'notebooks',
  'conversations',
  'favorites',
  'tags',
  'conversation_tags',
  'snippet_folders',
  'snippets',
] as const;

/** Current payload format version. Readers accept anything >= 1. */
export const SYNC_PAYLOAD_VERSION = 2;

/**
 * Identifies which profile and which Google account produced a payload.
 *
 * Recorded so a reader can refuse to merge a file that belongs to a different
 * profile or account. Without it, a mix-up in the active DB or the OAuth
 * account results in one dataset being merged over another — and because the
 * merge mirrors remote deletions, that silently destroys local data.
 */
export interface SyncOrigin {
  /** SQLite filename of the profile that produced this payload */
  dbName?: string;
  /** Stable Google Drive account identifier, when it could be determined */
  accountId?: string | null;
}

export interface SyncPayload {
  version: number;
  exportedAt: number;
  origin?: SyncOrigin;
  tables: Record<string, any[]>;
}

/**
 * Export all syncable tables as a JSON string.
 *
 * @param origin - Provenance stamp. Always pass this for anything uploaded to
 *                 Drive so the reader can verify it before merging.
 */
export async function exportSyncData(origin?: SyncOrigin): Promise<string> {
  const tables: Record<string, any[]> = {};

  for (const table of SYNC_TABLES) {
    const rows = await runQuery(`SELECT * FROM ${table}`);
    tables[table] = rows || [];
  }

  const payload: SyncPayload = {
    version: SYNC_PAYLOAD_VERSION,
    exportedAt: Math.floor(Date.now() / 1000),
    ...(origin ? { origin } : {}),
    tables,
  };

  return JSON.stringify(payload);
}

/** The column names a table actually has right now. */
async function tableColumns(table: string): Promise<Set<string>> {
  const rows: any[] = (await runQuery(`PRAGMA table_info(${table})`)) || [];
  return new Set(rows.map((r) => r.name as string));
}

/**
 * Import sync data into local DB (overwrite mode).
 * Clears existing data in sync tables, then inserts new data.
 * Messages table is NOT touched.
 *
 * This is unconditionally destructive — it empties every sync table first.
 * Callers are expected to have captured a recovery snapshot beforehand.
 *
 * ── Why columns are intersected with the live schema ─────────────────────────
 * A payload's column set is whatever the source database had, which is not
 * necessarily what this one has. Two ways that happens:
 *
 *  - Cross-version restore: a snapshot taken on a newer build carries columns
 *    this build never created.
 *  - Uneven migrations: several columns (`is_pinned` on the folder tables, for
 *    one) exist only as `ALTER TABLE` steps in migrations.ts rather than in
 *    SCHEMA, and those steps are skipped wholesale if an earlier one throws. So
 *    two profiles in the same install can legitimately differ.
 *
 * Naming a column the table doesn't have makes SQLite reject the whole
 * statement, which used to fail the entire restore. Restoring the columns that
 * do line up is strictly better than restoring nothing.
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
    const droppedColumns: string[] = [];

    for (const table of SYNC_TABLES) {
      const rows = payload.tables[table];
      if (!rows || rows.length === 0) continue;

      const liveColumns = await tableColumns(table);

      // Build batch insert operations
      const operations: { sql: string; bind?: any[] }[] = [];

      for (const row of rows) {
        const columns = Object.keys(row).filter((col) => {
          if (liveColumns.has(col)) return true;
          const label = `${table}.${col}`;
          if (!droppedColumns.includes(label)) droppedColumns.push(label);
          return false;
        });

        if (columns.length === 0) continue;

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

    if (droppedColumns.length > 0) {
      console.warn(
        '[SyncData] Import skipped columns this database does not have: ' +
          droppedColumns.join(', '),
      );
    }
  } finally {
    // Re-enable foreign keys
    await runCommand('PRAGMA foreign_keys = ON');
  }
}
