import type { AppState, SetState, GetState } from '../types';

/** Folders of the Gems / Notebooks panels, and placing items in them. */
export function createCollectionsActions(
  set: SetState,
  get: GetState,
): Pick<
  AppState,
  | 'createCollectionFolder'
  | 'renameCollectionFolder'
  | 'moveCollectionFolder'
  | 'deleteCollectionFolder'
  | 'reorderCollectionFolders'
  | 'moveCollectionItem'
  | 'reorderCollectionItems'
> {
  const refreshFolders = () => get().fetchData(true, ['collectionFolders']);

  return {
    createCollectionFolder: async (scope, name, parentId) => {
      try {
        const id = crypto.randomUUID();
        await browser.runtime.sendMessage({
          type: 'CREATE_COLLECTION_FOLDER',
          payload: { id, scope, name, parentId: parentId || null },
        });
        await refreshFolders();
        return id;
      } catch (error) {
        console.error('Failed to create collection folder:', error);
        return null;
      }
    },

    renameCollectionFolder: async (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await browser.runtime.sendMessage({
          type: 'UPDATE_COLLECTION_FOLDER',
          payload: { id, updates: { name: trimmed } },
        });
        await refreshFolders();
      } catch (error) {
        console.error('Failed to rename collection folder:', error);
      }
    },

    moveCollectionFolder: async (id, parentId) => {
      try {
        await browser.runtime.sendMessage({
          type: 'UPDATE_COLLECTION_FOLDER',
          payload: { id, updates: { parent_id: parentId } },
        });
        await refreshFolders();
      } catch (error) {
        console.error('Failed to move collection folder:', error);
      }
    },

    deleteCollectionFolder: async (id) => {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'DELETE_COLLECTION_FOLDER',
          payload: { id },
        });
        const deleted = !!response?.data?.deleted;
        if (deleted) await refreshFolders();
        return deleted;
      } catch (error) {
        console.error('Failed to delete collection folder:', error);
        return false;
      }
    },

    reorderCollectionFolders: async (orderedIds) => {
      if (orderedIds.length === 0) return;
      // Applied locally first so the row stays where it was dropped instead of
      // snapping back for the round trip; the refetch replaces it with the DB.
      const position = new Map(orderedIds.map((id, i) => [id, i]));
      set((state) => ({
        collectionFolders: state.collectionFolders.map((f) =>
          position.has(f.id) ? { ...f, order_index: position.get(f.id)! } : f,
        ),
      }));
      try {
        await browser.runtime.sendMessage({
          type: 'REORDER_COLLECTION_FOLDERS',
          payload: { orderedIds },
        });
      } catch (error) {
        console.error('Failed to reorder collection folders:', error);
      }
      await refreshFolders();
    },

    moveCollectionItem: async (scope, id, folderId) => {
      set((state) => ({
        [scope]: (state[scope] as any[]).map((item) =>
          item.id === id ? { ...item, folder_id: folderId, order_index: 0 } : item,
        ),
      }) as Partial<AppState>);
      try {
        await browser.runtime.sendMessage({
          type: 'MOVE_COLLECTION_ITEM',
          payload: { scope, id, folderId },
        });
      } catch (error) {
        console.error('Failed to move collection item:', error);
      }
      await get().fetchData(true, [scope]);
    },

    reorderCollectionItems: async (scope, orderedIds) => {
      if (orderedIds.length === 0) return;
      const rank = new Map(orderedIds.map((id, i) => [id, i + 1]));
      set((state) => ({
        [scope]: (state[scope] as any[]).map((item) =>
          rank.has(item.id) ? { ...item, order_index: rank.get(item.id)! } : item,
        ),
      }) as Partial<AppState>);
      try {
        await browser.runtime.sendMessage({
          type: 'REORDER_COLLECTION_ITEMS',
          payload: { scope, orderedIds },
        });
      } catch (error) {
        console.error('Failed to reorder collection items:', error);
      }
      await get().fetchData(true, [scope]);
    },
  };
}
