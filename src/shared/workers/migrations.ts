/**
 * Database migrations — executed once per DB open inside the web worker.
 */

export const runMigrations = async (db: any) => {
  console.log('Worker: Checking for migrations...');

  // Helper to check if a column exists in a table
  const hasColumn = async (
    table: string,
    column: string,
  ): Promise<boolean> => {
    const columns = await db.run(`PRAGMA table_info(${table})`);
    return columns.some((col: any) => col.name === column);
  };

  // Individual migration wrapper — keeps one failure from cascading into the rest.
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(`Worker: Migration "${name}" failed:`, err);
    }
  };

  try {

    // Migration: Add order_index to messages if missing
    if (!(await hasColumn('messages', 'order_index'))) {
      console.log('Worker: Migrating messages table - adding order_index');
      await db.run(
        'ALTER TABLE messages ADD COLUMN order_index INTEGER DEFAULT 0',
      );
    }

    // Migration: Add message_type to messages if missing
    if (!(await hasColumn('messages', 'message_type'))) {
      console.log('Worker: Migrating messages table - adding message_type');
      await db.run(
        "ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'",
      );
    }

    // Migration: Add order_index to conversations if missing
    if (!(await hasColumn('conversations', 'order_index'))) {
      console.log('Worker: Migrating conversations table - adding order_index');
      await db.run(
        'ALTER TABLE conversations ADD COLUMN order_index INTEGER DEFAULT 0',
      );
    }

    // Migration: Add prompt_metadata to conversations if missing
    if (!(await hasColumn('conversations', 'prompt_metadata'))) {
      console.log(
        'Worker: Migrating conversations table - adding prompt_metadata',
      );
      await db.run('ALTER TABLE conversations ADD COLUMN prompt_metadata TEXT');
    }

    // Migration: Add type to conversations if missing
    if (!(await hasColumn('conversations', 'type'))) {
      console.log('Worker: Migrating conversations table - adding type');
      await db.run(
        "ALTER TABLE conversations ADD COLUMN type TEXT DEFAULT 'conversation'",
      );
    }

    // Migration: Add platform to conversations if missing
    if (!(await hasColumn('conversations', 'platform'))) {
      console.log('Worker: Migrating conversations table - adding platform');
      await db.run(
        "ALTER TABLE conversations ADD COLUMN platform TEXT DEFAULT 'aistudio'",
      );
    }

    // Always ensure platform index exists (moved out of SCHEMA to avoid startup errors on old DBs)
    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_conversations_platform ON conversations(platform)',
    );

    // Migration: Add order_index to folders if missing
    if (!(await hasColumn('folders', 'order_index'))) {
      console.log('Worker: Migrating folders table - adding order_index');
      await db.run(
        'ALTER TABLE folders ADD COLUMN order_index INTEGER DEFAULT 0',
      );
    }

    // Migration: Add platform to folders if missing
    if (!(await hasColumn('folders', 'platform'))) {
      console.log('Worker: Migrating folders table - adding platform');
      await db.run(
        "ALTER TABLE folders ADD COLUMN platform TEXT DEFAULT 'aistudio'",
      );
    }

    // Migration: Add deleted_at to conversations if missing (soft deletion)
    if (!(await hasColumn('conversations', 'deleted_at'))) {
      console.log(
        'Worker: Migrating conversations table - adding deleted_at for soft deletion',
      );
      await db.run(
        'ALTER TABLE conversations ADD COLUMN deleted_at INTEGER DEFAULT NULL',
      );
      await db.run(
        'CREATE INDEX IF NOT EXISTS idx_conversations_deleted ON conversations(deleted_at)',
      );
    }

    // Migration: Add color to folders if missing
    if (!(await hasColumn('folders', 'color'))) {
      console.log('Worker: Migrating folders table - adding color');
      await db.run('ALTER TABLE folders ADD COLUMN color TEXT');
    }

    // Migration: Add gem_id to conversations if missing
    if (!(await hasColumn('conversations', 'gem_id'))) {
      console.log('Worker: Migrating conversations table - adding gem_id');
      await db.run('ALTER TABLE conversations ADD COLUMN gem_id TEXT');
    }
    await db.run(
      'CREATE INDEX IF NOT EXISTS idx_conversations_gem_id ON conversations(gem_id)',
    );

    // Migration: Create gems table if missing
    const gemsTableExists = await db.run(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='gems'",
    );
    if (gemsTableExists.length === 0) {
      console.log('Worker: Creating gems table');
      await db.run(`
        CREATE TABLE IF NOT EXISTS gems (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          external_id TEXT UNIQUE,
          external_url TEXT,
          icon_url TEXT,
          description TEXT,
          platform TEXT DEFAULT 'gemini',
          order_index INTEGER DEFAULT 0,
          is_deleted INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        )
      `);
      await db.run(
        'CREATE INDEX IF NOT EXISTS idx_gems_platform ON gems(platform)',
      );
    }

    // Migration: Add is_deleted to gems if missing (soft deletion)
    if (await hasColumn('gems', 'id') && !(await hasColumn('gems', 'is_deleted'))) {
      console.log('Worker: Migrating gems table - adding is_deleted for soft deletion');
      await db.run(
        'ALTER TABLE gems ADD COLUMN is_deleted INTEGER DEFAULT 0',
      );
    }

    // Migration: Add notebook_id to conversations if missing
    await step('add notebook_id to conversations', async () => {
      if (!(await hasColumn('conversations', 'notebook_id'))) {
        console.log('Worker: Migrating conversations table - adding notebook_id');
        await db.run('ALTER TABLE conversations ADD COLUMN notebook_id TEXT');
      }
      await db.run(
        'CREATE INDEX IF NOT EXISTS idx_conversations_notebook_id ON conversations(notebook_id)',
      );
    });

    // Migration: Create notebooks table if missing
    await step('create notebooks table', async () => {
      const notebooksTableExists = await db.run(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='notebooks'",
      );
      if (notebooksTableExists.length === 0) {
        console.log('Worker: Creating notebooks table');
        await db.run(`
          CREATE TABLE IF NOT EXISTS notebooks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            external_id TEXT UNIQUE,
            external_url TEXT,
            icon_url TEXT,
            description TEXT,
            platform TEXT DEFAULT 'gemini',
            order_index INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (unixepoch()),
            updated_at INTEGER DEFAULT (unixepoch())
          )
        `);
        await db.run(
          'CREATE INDEX IF NOT EXISTS idx_notebooks_platform ON notebooks(platform)',
        );
      }
    });

    // Migration: Add updated_at to favorites if missing
    if (!(await hasColumn('favorites', 'updated_at'))) {
      console.log('Worker: Migrating favorites table - adding updated_at');
      await db.run(
        'ALTER TABLE favorites ADD COLUMN updated_at INTEGER',
      );
      // Backfill from created_at
      await db.run('UPDATE favorites SET updated_at = COALESCE(created_at, unixepoch())');
    }

    // Migration: Add updated_at to tags if missing
    if (!(await hasColumn('tags', 'updated_at'))) {
      console.log('Worker: Migrating tags table - adding updated_at');
      await db.run(
        'ALTER TABLE tags ADD COLUMN updated_at INTEGER',
      );
      // Backfill from created_at
      await db.run('UPDATE tags SET updated_at = COALESCE(created_at, unixepoch())');
    }

    // Migration: Add updated_at to conversation_tags if missing
    if (!(await hasColumn('conversation_tags', 'updated_at'))) {
      console.log('Worker: Migrating conversation_tags table - adding updated_at');
      await db.run(
        'ALTER TABLE conversation_tags ADD COLUMN updated_at INTEGER',
      );
      // Backfill from created_at
      await db.run('UPDATE conversation_tags SET updated_at = COALESCE(created_at, unixepoch())');
    }

    // Migration: Add last_active_at to conversations if missing
    if (!(await hasColumn('conversations', 'last_active_at'))) {
      console.log('Worker: Migrating conversations table - adding last_active_at');
      await db.run(
        'ALTER TABLE conversations ADD COLUMN last_active_at INTEGER',
      );
      // Backfill from existing updated_at (which previously held the business timestamp)
      await db.run('UPDATE conversations SET last_active_at = COALESCE(updated_at, unixepoch())');
    }
  } catch (err) {
    console.error('Worker: Migration failed:', err);
  }
};
