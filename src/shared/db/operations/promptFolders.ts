import { runQuery, runCommand } from '../index';
import { updateWithTimestamp } from './helpers';
import type { PromptFolder } from '../../types/db';

export const promptFolderRepo = {
  create: async (folder: {
    id: string;
    name: string;
    parentId?: string | null;
  }): Promise<void> => {
    await runCommand(
      'INSERT INTO prompt_folders (id, name, parent_id) VALUES (?, ?, ?)',
      [folder.id, folder.name, folder.parentId || null]
    );
  },

  getById: async (id: string): Promise<PromptFolder | undefined> => {
    const result = await runQuery('SELECT * FROM prompt_folders WHERE id = ?', [id]);
    return result[0] as PromptFolder | undefined;
  },

  getByParentId: async (parentId: string | null): Promise<PromptFolder[]> => {
    if (parentId === null) {
      return (await runQuery(
        'SELECT * FROM prompt_folders WHERE parent_id IS NULL ORDER BY order_index ASC, name ASC'
      )) as PromptFolder[];
    }
    return (await runQuery(
      'SELECT * FROM prompt_folders WHERE parent_id = ? ORDER BY order_index ASC, name ASC',
      [parentId]
    )) as PromptFolder[];
  },

  getAll: async (): Promise<PromptFolder[]> => {
    return (await runQuery(
      'SELECT * FROM prompt_folders ORDER BY order_index ASC, name ASC'
    )) as PromptFolder[];
  },

  update: async (
    id: string,
    updates: Partial<Pick<PromptFolder, 'name' | 'parent_id' | 'order_index'>>
  ): Promise<void> => {
    await updateWithTimestamp('prompt_folders', id, updates);
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('DELETE FROM prompt_folders WHERE id = ?', [id]);
  },

  deleteMultiple: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(`DELETE FROM prompt_folders WHERE id IN (${placeholders})`, ids);
  },
};
