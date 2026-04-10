import { runQuery, runCommand, runBatch } from '../index';
import { updateWithTimestamp } from './helpers';
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
        'SELECT * FROM gems WHERE platform = ? AND is_deleted = 0 ORDER BY order_index ASC, name ASC',
        [platform],
      )) as Gem[];
    }
    return (await runQuery(
      'SELECT * FROM gems WHERE is_deleted = 0 ORDER BY order_index ASC, name ASC',
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
    await updateWithTimestamp('gems', id, updates);
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('DELETE FROM gems WHERE id = ?', [id]);
  },

  softDelete: async (id: string): Promise<void> => {
    await updateWithTimestamp('gems', id, { is_deleted: 1 });
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
      'SELECT * FROM conversations WHERE gem_id = ? AND deleted_at IS NULL ORDER BY last_active_at DESC',
      [gemId],
    )) as any[];
  },
};
