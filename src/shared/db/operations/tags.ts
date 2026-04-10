import { runQuery, runCommand } from '../index';
import { updateWithTimestamp } from './helpers';
import type { Tag } from '../../types/db';

export const tagRepo = {
  create: async (name: string, color?: string): Promise<string> => {
    const idResult = await runQuery('SELECT hex(randomblob(16)) as id');
    const id = idResult[0].id;

    await runCommand(
      'INSERT INTO tags (id, name, color) VALUES (?, ?, ?)',
      [id, name, color || null]
    );
    return id;
  },

  getAll: async (): Promise<Tag[]> => {
    return (await runQuery('SELECT * FROM tags ORDER BY name ASC')) as Tag[];
  },

  getById: async (id: string): Promise<Tag | undefined> => {
    const result = await runQuery('SELECT * FROM tags WHERE id = ?', [id]);
    return result[0] as Tag | undefined;
  },

  update: async (
    id: string,
    updates: Partial<Pick<Tag, 'name' | 'color'>>
  ): Promise<void> => {
    await updateWithTimestamp('tags', id, updates);
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('DELETE FROM tags WHERE id = ?', [id]);
  },
};
