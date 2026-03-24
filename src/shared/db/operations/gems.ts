import { runQuery, runCommand, runBatch } from '../index';
import type { Gem } from '../../types/db';

export const gemRepo = {
  save: async (gem: Partial<Gem> & Pick<Gem, 'id' | 'name'>): Promise<void> => {
    const platform = gem.platform ?? 'gemini';
    await runCommand(
      `INSERT INTO gems (id, name, external_id, external_url, icon_url, description, platform, order_index, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         external_id = COALESCE(excluded.external_id, gems.external_id),
         external_url = COALESCE(excluded.external_url, gems.external_url),
         icon_url = COALESCE(excluded.icon_url, gems.icon_url),
         description = COALESCE(excluded.description, gems.description),
         platform = COALESCE(excluded.platform, gems.platform),
         updated_at = excluded.updated_at`,
      [
        gem.id,
        gem.name,
        gem.external_id ?? null,
        gem.external_url ?? null,
        gem.icon_url ?? null,
        gem.description ?? null,
        platform,
        gem.order_index ?? 0,
        gem.updated_at ?? Math.floor(Date.now() / 1000),
        gem.created_at ?? Math.floor(Date.now() / 1000),
      ],
    );
  },

  getAll: async (platform?: string): Promise<Gem[]> => {
    if (platform) {
      return (await runQuery(
        'SELECT * FROM gems WHERE platform = ? ORDER BY order_index ASC, name ASC',
        [platform],
      )) as Gem[];
    }
    return (await runQuery(
      'SELECT * FROM gems ORDER BY order_index ASC, name ASC',
    )) as Gem[];
  },

  getById: async (id: string): Promise<Gem | undefined> => {
    const result = await runQuery('SELECT * FROM gems WHERE id = ?', [id]);
    return result[0] as Gem | undefined;
  },

  update: async (
    id: string,
    updates: Partial<Pick<Gem, 'name' | 'description' | 'icon_url' | 'order_index'>>,
  ): Promise<void> => {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    const values = Object.values(updates);
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    await runCommand(
      `UPDATE gems SET ${setClause}, updated_at = unixepoch() WHERE id = ?`,
      [...values, id],
    );
  },

  delete: async (id: string): Promise<void> => {
    // Unlink conversations from this gem first
    await runCommand('UPDATE conversations SET gem_id = NULL WHERE gem_id = ?', [id]);
    await runCommand('DELETE FROM gems WHERE id = ?', [id]);
  },

  bulkSave: async (gems: (Partial<Gem> & Pick<Gem, 'id' | 'name'>)[]): Promise<void> => {
    if (gems.length === 0) return;
    const operations = gems.map((gem) => ({
      sql: `INSERT INTO gems (id, name, external_id, external_url, icon_url, description, platform, order_index, updated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              external_id = COALESCE(excluded.external_id, gems.external_id),
              external_url = COALESCE(excluded.external_url, gems.external_url),
              icon_url = COALESCE(excluded.icon_url, gems.icon_url),
              description = COALESCE(excluded.description, gems.description),
              updated_at = excluded.updated_at`,
      bind: [
        gem.id,
        gem.name,
        gem.external_id ?? null,
        gem.external_url ?? null,
        gem.icon_url ?? null,
        gem.description ?? null,
        gem.platform ?? 'gemini',
        gem.order_index ?? 0,
        gem.updated_at ?? Math.floor(Date.now() / 1000),
        gem.created_at ?? Math.floor(Date.now() / 1000),
      ],
    }));
    await runBatch(operations);
  },

  getConversationsByGemId: async (gemId: string): Promise<any[]> => {
    return (await runQuery(
      'SELECT * FROM conversations WHERE gem_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC',
      [gemId],
    )) as any[];
  },
};
