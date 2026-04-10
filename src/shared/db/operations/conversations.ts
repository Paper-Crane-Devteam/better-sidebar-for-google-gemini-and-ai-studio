import { runQuery, runCommand, runBatch } from '../index';
import type { Conversation } from '../../types/db';

export const conversationRepo = {
  save: async (
    c: Partial<Conversation> & Pick<Conversation, 'id'>
  ): Promise<void> => {
    const platform = c.platform ?? 'aistudio';
    await runCommand(
      `
      INSERT INTO conversations (id, title, folder_id, external_id, external_url, model_name, type, platform, updated_at, created_at, last_active_at, prompt_metadata, deleted_at, gem_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        folder_id = COALESCE(excluded.folder_id, conversations.folder_id),
        external_url = excluded.external_url,
        model_name = excluded.model_name,
        type = COALESCE(excluded.type, conversations.type),
        platform = COALESCE(excluded.platform, conversations.platform),
        updated_at = unixepoch(),
        created_at = COALESCE(excluded.created_at, conversations.created_at),
        last_active_at = COALESCE(excluded.last_active_at, conversations.last_active_at),
        prompt_metadata = COALESCE(excluded.prompt_metadata, conversations.prompt_metadata),
        gem_id = COALESCE(excluded.gem_id, conversations.gem_id),
        deleted_at = NULL
    `,
      [
        c.id,
        c.title,
        c.folder_id,
        c.external_id,
        c.external_url,
        c.model_name,
        c.type || 'conversation',
        platform,
        c.created_at || null,
        c.last_active_at || Math.floor(Date.now() / 1000),
        c.prompt_metadata ? JSON.stringify(c.prompt_metadata) : null,
        c.gem_id ?? null,
      ]
    );
  },

  getById: async (id: string): Promise<Conversation | undefined> => {
    const result = await runQuery('SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL', [
      id,
    ]);
    const row = result[0];
    if (!row) return undefined;
    return row as Conversation;
  },

  getByFolderId: async (folderId: string | null): Promise<Conversation[]> => {
    if (folderId === null) {
      return (await runQuery(
        'SELECT * FROM conversations WHERE folder_id IS NULL AND deleted_at IS NULL ORDER BY last_active_at DESC'
      )) as Conversation[];
    } else {
      return (await runQuery(
        'SELECT * FROM conversations WHERE folder_id = ? AND deleted_at IS NULL ORDER BY last_active_at DESC',
        [folderId]
      )) as Conversation[];
    }
  },

  getAll: async (platform?: string): Promise<Conversation[]> => {
    if (platform) {
      return (await runQuery(
        'SELECT * FROM conversations WHERE platform = ? AND deleted_at IS NULL ORDER BY last_active_at DESC',
        [platform]
      )) as Conversation[];
    }
    return (await runQuery(
      'SELECT * FROM conversations WHERE deleted_at IS NULL ORDER BY last_active_at DESC'
    )) as Conversation[];
  },

  update: async (
    id: string,
    updates: Partial<
      Pick<
        Conversation,
        | 'title'
        | 'folder_id'
        | 'external_url'
        | 'model_name'
        | 'last_active_at'
        | 'prompt_metadata'
        | 'platform'
      >
    >
  ): Promise<void> => {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const values = fields.map((field) => {
      const val = (updates as any)[field];
      if (field === 'prompt_metadata') {
        if (val === null) return null;
        return JSON.stringify(val);
      }
      return val;
    });

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    await runCommand(
      `UPDATE conversations SET ${setClause}, updated_at = unixepoch() WHERE id = ?`,
      [...values, id],
    );
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('UPDATE conversations SET deleted_at = unixepoch() WHERE id = ?', [id]);
  },

  move: async (id: string, folderId: string | null): Promise<void> => {
    await runCommand('UPDATE conversations SET folder_id = ?, updated_at = unixepoch() WHERE id = ?', [
      folderId,
      id,
    ]);
  },

  moveMultiple: async (
    ids: string[],
    folderId: string | null
  ): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(
      `UPDATE conversations SET folder_id = ?, updated_at = unixepoch() WHERE id IN (${placeholders})`,
      [folderId, ...ids]
    );
  },

  bulkSave: async (
    conversations: (Partial<Conversation> & Pick<Conversation, 'id'>)[]
  ): Promise<void> => {
    if (conversations.length === 0) return;

    const operations = conversations.map((c) => {
      const platform = c.platform ?? 'aistudio';
      return {
        sql: `
      INSERT INTO conversations (id, title, folder_id, external_id, external_url, model_name, type, platform, updated_at, created_at, last_active_at, prompt_metadata, deleted_at, gem_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        folder_id = COALESCE(excluded.folder_id, conversations.folder_id),
        external_url = excluded.external_url,
        model_name = excluded.model_name,
        type = COALESCE(excluded.type, conversations.type),
        platform = COALESCE(excluded.platform, conversations.platform),
        updated_at = unixepoch(),
        created_at = COALESCE(excluded.created_at, conversations.created_at),
        last_active_at = COALESCE(excluded.last_active_at, conversations.last_active_at),
        prompt_metadata = COALESCE(excluded.prompt_metadata, conversations.prompt_metadata),
        gem_id = COALESCE(excluded.gem_id, conversations.gem_id),
        deleted_at = NULL
    `,
        bind: [
          c.id,
          c.title,
          c.folder_id,
          c.external_id,
          c.external_url,
          c.model_name,
          c.type || 'conversation',
          platform,
          c.created_at || null,
          c.last_active_at || Math.floor(Date.now() / 1000),
          c.prompt_metadata ? JSON.stringify(c.prompt_metadata) : null,
          c.gem_id ?? null,
        ],
      };
    });

    await runBatch(operations);
  },

  getAllIds: async (): Promise<string[]> => {
    const result = await runQuery('SELECT id FROM conversations WHERE deleted_at IS NULL');
    return result.map((r: any) => r.id);
  },

  deleteMultiple: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(
      `UPDATE conversations SET deleted_at = unixepoch() WHERE id IN (${placeholders})`,
      ids
    );
  },

  getDeletedIds: async (platform?: string): Promise<string[]> => {
    if (platform) {
      const result = await runQuery(
        'SELECT id FROM conversations WHERE platform = ? AND deleted_at IS NOT NULL',
        [platform]
      );
      return result.map((r: any) => r.id);
    }
    const result = await runQuery('SELECT id FROM conversations WHERE deleted_at IS NOT NULL');
    return result.map((r: any) => r.id);
  },
};
