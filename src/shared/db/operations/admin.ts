import { runCommand, exportDB, importDB, resetDB } from '../index';

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

  /**
   * Back to a fresh install: drops every table (not a fixed list) and reruns
   * SCHEMA + migrations, all inside the worker. See `resetDatabase` there.
   */
  resetDatabase: async () => {
    await resetDB();
  },
};
