import { runQuery, runCommand } from '../index';
import { updateWithTimestamp } from './helpers';
import type { Folder } from '../../types/db';

export const folderRepo = {
  create: async (folder: {
    id: string;
    name: string;
    parentId?: string | null;
    platform?: string;
  }): Promise<void> => {
    const platform = folder.platform ?? 'aistudio';
    await runCommand(
      'INSERT INTO folders (id, name, parent_id, platform) VALUES (?, ?, ?, ?)',
      [folder.id, folder.name, folder.parentId || null, platform],
    );
  },

  getById: async (id: string): Promise<Folder | undefined> => {
    const result = await runQuery('SELECT * FROM folders WHERE id = ?', [id]);
    return result[0] as Folder | undefined;
  },

  getByParentId: async (
    parentId: string | null,
    platform?: string,
  ): Promise<Folder[]> => {
    if (parentId === null) {
      if (platform) {
        return (await runQuery(
          'SELECT * FROM folders WHERE parent_id IS NULL AND platform = ? ORDER BY order_index ASC, name ASC',
          [platform],
        )) as Folder[];
      }
      return (await runQuery(
        'SELECT * FROM folders WHERE parent_id IS NULL ORDER BY order_index ASC, name ASC',
      )) as Folder[];
    }
    return (await runQuery(
      'SELECT * FROM folders WHERE parent_id = ? ORDER BY order_index ASC, name ASC',
      [parentId],
    )) as Folder[];
  },

  getAll: async (platform?: string): Promise<Folder[]> => {
    if (platform) {
      return (await runQuery(
        'SELECT * FROM folders WHERE platform = ? ORDER BY order_index ASC, name ASC',
        [platform],
      )) as Folder[];
    }
    return (await runQuery(
      'SELECT * FROM folders ORDER BY order_index ASC, name ASC',
    )) as Folder[];
  },

  update: async (
    id: string,
    updates: Partial<
      Pick<Folder, 'name' | 'parent_id' | 'order_index' | 'color'>
    >,
  ): Promise<void> => {
    await updateWithTimestamp('folders', id, updates);
  },

  delete: async (id: string): Promise<void> => {
    // Get all descendant folder IDs using recursive CTE
    const descendants = await runQuery(
      `
      WITH RECURSIVE descendants AS (
        SELECT id FROM folders WHERE parent_id = ?
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN descendants d ON f.parent_id = d.id
      )
      SELECT id FROM descendants
    `,
      [id],
    );

    const allFolderIds = [id, ...descendants.map((r: any) => r.id)];
    const placeholders = allFolderIds.map(() => '?').join(',');

    // Soft delete all conversations in these folders and remove folder association
    await runCommand(
      `UPDATE conversations SET deleted_at = unixepoch(), folder_id = NULL WHERE folder_id IN (${placeholders})`,
      allFolderIds,
    );

    // Hard delete all folders (CASCADE will handle child folders)
    await runCommand('DELETE FROM folders WHERE id = ?', [id]);
  },

  deleteMultiple: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;

    // For each folder, delete it (which will cascade soft delete conversations)
    for (const id of ids) {
      await folderRepo.delete(id);
    }
  },
};
