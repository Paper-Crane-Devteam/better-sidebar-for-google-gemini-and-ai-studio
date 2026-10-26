import { runQuery, runCommand, runBatch } from '../index';
import { updateWithTimestamp } from './helpers';
import type { CollectionFolder, CollectionScope } from '../../types/db';
import { COLLECTION_SCOPES } from '../../types/db';

/**
 * `scope` is also the table holding the items, and it is interpolated into SQL,
 * so anything that isn't a known scope is refused before it gets there.
 */
function itemTable(scope: string): CollectionScope {
  if (!COLLECTION_SCOPES.includes(scope as CollectionScope)) {
    throw new Error(`Unknown collection scope: ${scope}`);
  }
  return scope as CollectionScope;
}

/** Folders of the Gems / Notebooks panels and the placement of items in them. */
export const collectionFolderRepo = {
  getAll: async (): Promise<CollectionFolder[]> => {
    return (await runQuery(
      'SELECT * FROM collection_folders ORDER BY scope ASC, order_index ASC, name ASC',
    )) as CollectionFolder[];
  },

  getById: async (id: string): Promise<CollectionFolder | undefined> => {
    const result = await runQuery('SELECT * FROM collection_folders WHERE id = ?', [id]);
    return result[0] as CollectionFolder | undefined;
  },

  create: async (folder: {
    id: string;
    scope: CollectionScope;
    name: string;
    parentId?: string | null;
  }): Promise<void> => {
    itemTable(folder.scope);
    // Appended after its siblings, so a new folder doesn't jump ahead of an
    // order the user arranged.
    const rows = await runQuery(
      `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM collection_folders
       WHERE scope = ? AND parent_id IS ?`,
      [folder.scope, folder.parentId || null],
    );
    await runCommand(
      'INSERT INTO collection_folders (id, scope, name, parent_id, order_index) VALUES (?, ?, ?, ?, ?)',
      [folder.id, folder.scope, folder.name, folder.parentId || null, rows[0]?.next ?? 0],
    );
  },

  update: async (
    id: string,
    updates: Partial<Pick<CollectionFolder, 'name' | 'parent_id' | 'is_pinned'>>,
  ): Promise<void> => {
    await updateWithTimestamp('collection_folders', id, updates);
  },

  /**
   * Delete a folder only when nothing is left inside it: no subfolders and no
   * visible items. Gems and notebooks live in Gemini, so a folder delete must
   * never take them along — the user empties the folder first.
   *
   * Returns false (and deletes nothing) when the folder still has contents.
   */
  deleteIfEmpty: async (id: string): Promise<boolean> => {
    const folder = await collectionFolderRepo.getById(id);
    if (!folder) return true;
    const table = itemTable(folder.scope);

    const [subfolders, items] = await Promise.all([
      runQuery('SELECT 1 FROM collection_folders WHERE parent_id = ? LIMIT 1', [id]),
      runQuery(`SELECT 1 FROM ${table} WHERE folder_id = ? AND is_deleted = 0 LIMIT 1`, [id]),
    ]);
    if (subfolders.length > 0 || items.length > 0) return false;

    // Hidden items can't be seen to be moved out; send them back to the top
    // level so they don't point at a folder that no longer exists.
    await runBatch([
      { sql: `UPDATE ${table} SET folder_id = NULL WHERE folder_id = ?`, bind: [id] },
      { sql: 'DELETE FROM collection_folders WHERE id = ?', bind: [id] },
    ]);
    return true;
  },

  /** Write positions 0..n-1 for sibling folders, in this order. */
  reorder: async (orderedIds: string[]): Promise<void> => {
    if (orderedIds.length === 0) return;
    await runBatch(
      orderedIds.map((id, i) => ({
        sql: 'UPDATE collection_folders SET order_index = ?, updated_at = unixepoch() WHERE id = ?',
        bind: [i, id],
      })),
    );
  },

  /**
   * Put an item into a folder (null = top level). Its manual rank is reset, the
   * same way a Library chat moved to another folder starts out unranked.
   *
   * updated_at is left alone on purpose: the panels' date sort reads it, and
   * filing a gem away is not an edit to the gem.
   */
  moveItem: async (scope: CollectionScope, id: string, folderId: string | null): Promise<void> => {
    const table = itemTable(scope);
    await runCommand(`UPDATE ${table} SET folder_id = ?, order_index = 0 WHERE id = ?`, [
      folderId,
      id,
    ]);
  },

  /** Manual ranks 1..n for the items of one folder (0 means never ranked). */
  reorderItems: async (scope: CollectionScope, orderedIds: string[]): Promise<void> => {
    if (orderedIds.length === 0) return;
    const table = itemTable(scope);
    await runBatch(
      orderedIds.map((id, i) => ({
        sql: `UPDATE ${table} SET order_index = ? WHERE id = ?`,
        bind: [i + 1, id],
      })),
    );
  },
};
