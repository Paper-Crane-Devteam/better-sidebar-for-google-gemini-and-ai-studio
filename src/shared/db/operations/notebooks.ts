import { runQuery, runCommand, runBatch } from '../index';
import { updateWithTimestamp } from './helpers';
import type { Notebook } from '../../types/db';

export const notebookRepo = {
  save: async (
    nb: Partial<Notebook> & Pick<Notebook, 'id' | 'name'>,
  ): Promise<void> => {
    const platform = nb.platform ?? 'gemini';
    await runCommand(
      `INSERT INTO notebooks (id, name, external_id, external_url, icon_url, description, platform, order_index, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         external_id = COALESCE(excluded.external_id, notebooks.external_id),
         external_url = COALESCE(excluded.external_url, notebooks.external_url),
         icon_url = COALESCE(excluded.icon_url, notebooks.icon_url),
         description = COALESCE(excluded.description, notebooks.description),
         platform = COALESCE(excluded.platform, notebooks.platform),
         updated_at = excluded.updated_at`,
      [
        nb.id,
        nb.name,
        nb.external_id ?? null,
        nb.external_url ?? null,
        nb.icon_url ?? null,
        nb.description ?? null,
        platform,
        nb.order_index ?? 0,
        nb.updated_at ?? Math.floor(Date.now() / 1000),
        nb.created_at ?? Math.floor(Date.now() / 1000),
      ],
    );
  },

  getAll: async (platform?: string): Promise<Notebook[]> => {
    if (platform) {
      return (await runQuery(
        'SELECT * FROM notebooks WHERE platform = ? AND is_deleted = 0 ORDER BY order_index ASC, name ASC',
        [platform],
      )) as Notebook[];
    }
    return (await runQuery(
      'SELECT * FROM notebooks WHERE is_deleted = 0 ORDER BY order_index ASC, name ASC',
    )) as Notebook[];
  },

  getById: async (id: string): Promise<Notebook | undefined> => {
    const result = await runQuery('SELECT * FROM notebooks WHERE id = ?', [id]);
    return result[0] as Notebook | undefined;
  },

  update: async (
    id: string,
    updates: Partial<
      Pick<Notebook, 'name' | 'description' | 'icon_url' | 'order_index'>
    >,
  ): Promise<void> => {
    await updateWithTimestamp('notebooks', id, updates);
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('DELETE FROM notebooks WHERE id = ?', [id]);
  },

  softDelete: async (id: string): Promise<void> => {
    await updateWithTimestamp('notebooks', id, { is_deleted: 1 });
  },

  bulkSave: async (
    notebooks: (Partial<Notebook> & Pick<Notebook, 'id' | 'name'>)[],
  ): Promise<void> => {
    if (notebooks.length === 0) return;
    const operations = notebooks.map((nb) => ({
      sql: `INSERT INTO notebooks (id, name, external_id, external_url, icon_url, description, platform, order_index, updated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              external_id = COALESCE(excluded.external_id, notebooks.external_id),
              external_url = COALESCE(excluded.external_url, notebooks.external_url),
              icon_url = COALESCE(excluded.icon_url, notebooks.icon_url),
              description = COALESCE(excluded.description, notebooks.description),
              updated_at = excluded.updated_at`,
      bind: [
        nb.id,
        nb.name,
        nb.external_id ?? null,
        nb.external_url ?? null,
        nb.icon_url ?? null,
        nb.description ?? null,
        nb.platform ?? 'gemini',
        nb.order_index ?? 0,
        nb.updated_at ?? Math.floor(Date.now() / 1000),
        nb.created_at ?? Math.floor(Date.now() / 1000),
      ],
    }));
    await runBatch(operations);
  },

  getConversationsByNotebookId: async (notebookId: string): Promise<any[]> => {
    return (await runQuery(
      'SELECT * FROM conversations WHERE notebook_id = ? AND deleted_at IS NULL ORDER BY last_active_at DESC',
      [notebookId],
    )) as any[];
  },
};
