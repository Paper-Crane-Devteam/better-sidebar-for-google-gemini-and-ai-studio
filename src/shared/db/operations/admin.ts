import { runCommand, exportDB, importDB } from '../index';
import { SCHEMA } from '../schema';

export const dbAdmin = {
  export: async (): Promise<string> => {
    return exportDB();
  },

  import: async (data: string, chunk?: { index: number; total: number }): Promise<void> => {
    return importDB(data, chunk);
  },

  vacuum: async (): Promise<void> => {
    await runCommand('VACUUM');
  },

  resetDatabase: async () => {
    // Disable foreign keys to ensure tables can be dropped regardless of constraints
    await runCommand('PRAGMA foreign_keys = OFF');

    try {
      // Drop triggers (must drop before dropping messages / messages_fts)
      await runCommand('DROP TRIGGER IF EXISTS messages_ai');
      await runCommand('DROP TRIGGER IF EXISTS messages_ad');
      await runCommand('DROP TRIGGER IF EXISTS messages_au');

      // Drop tables (order: dependents first, then base tables)
      await runCommand('DROP TABLE IF EXISTS conversation_tags');
      await runCommand('DROP TABLE IF EXISTS tags');
      await runCommand('DROP TABLE IF EXISTS messages_fts'); // virtual FTS table
      await runCommand('DROP TABLE IF EXISTS messages');
      await runCommand('DROP TABLE IF EXISTS favorites');
      await runCommand('DROP TABLE IF EXISTS conversations');
      await runCommand('DROP TABLE IF EXISTS folders');
      await runCommand('DROP TABLE IF EXISTS prompts');
      await runCommand('DROP TABLE IF EXISTS prompt_folders');
      await runCommand('DROP TABLE IF EXISTS gems');

      // Re-initialize tables (SCHEMA contains multiple statements, so we don't pass bind to avoid sqlite3 limitations)
      await runCommand(SCHEMA);

      // Optimize
      await runCommand('VACUUM');
    } finally {
      // Re-enable foreign keys
      await runCommand('PRAGMA foreign_keys = ON');
    }
  },
};
