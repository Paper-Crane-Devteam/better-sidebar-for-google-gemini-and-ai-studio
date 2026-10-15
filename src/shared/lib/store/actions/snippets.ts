import type { AppState, SetState, GetState } from '../types';

export function createSnippetsActions(
  set: SetState,
  get: GetState,
): Pick<
  AppState,
  | 'setSnippetFolders'
  | 'setSnippets'
  | 'createSnippetFolder'
  | 'createSnippet'
  | 'updateSnippet'
  | 'deleteSnippetItem'
  | 'deleteSnippetItems'
  | 'moveSnippetItems'
  | 'moveSnippetItem'
  | 'renameSnippetItem'
  | 'setSnippetsSearch'
  | 'setSnippetsSortOrder'
  | 'setSnippetsOnlyFavorites'
  | 'setSnippetsBatchMode'
  | 'setSnippetsBatchSelection'
  | 'toggleSnippetsBatchSelection'
  | 'openSnippetReaderDrawer'
  | 'closeSnippetReaderDrawer'
> {
  return {
    setSnippetFolders: (snippetFolders) => set({ snippetFolders }),
    setSnippets: (snippets) => set({ snippets }),

    createSnippetFolder: async (name, parentId) => {
      try {
        const newId = crypto.randomUUID();
        await browser.runtime.sendMessage({
          type: 'CREATE_SNIPPET_FOLDER',
          payload: { id: newId, name, parentId: parentId || null },
        });
        await get().fetchData(true, ['snippets', 'snippetFolders']);
        return newId;
      } catch (error) {
        console.error('Failed to create snippet folder:', error);
        return null;
      }
    },

    createSnippet: async (title, content, sourceUrl, sourcePlatform, folderId) => {
      try {
        const newId = crypto.randomUUID();
        await browser.runtime.sendMessage({
          type: 'CREATE_SNIPPET',
          payload: {
            id: newId,
            title,
            content,
            sourceUrl,
            sourcePlatform,
            folderId: folderId || null,
          },
        });
        await get().fetchData(true, ['snippets', 'snippetFolders']);
      } catch (error) {
        console.error('Failed to create snippet:', error);
      }
    },

    updateSnippet: async (id, updates) => {
      try {
        await browser.runtime.sendMessage({
          type: 'UPDATE_SNIPPET',
          payload: { id, updates },
        });
        await get().fetchData(true, ['snippets', 'snippetFolders']);
      } catch (error) {
        console.error('Failed to update snippet:', error);
      }
    },

    deleteSnippetItem: async (itemId, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'DELETE_SNIPPET_FOLDER',
            payload: { id: itemId },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'DELETE_SNIPPET',
            payload: { id: itemId },
          });
        }
        await get().fetchData(true, ['snippets', 'snippetFolders']);
      } catch (error) {
        console.error('Failed to delete snippet item:', error);
      }
    },

    deleteSnippetItems: async (itemIds) => {
      try {
        const state = get();
        const folderIds = itemIds.filter((id) =>
          state.snippetFolders.some((f) => f.id === id),
        );
        const snippetIds = itemIds.filter((id) =>
          state.snippets.some((s) => s.id === id),
        );
        if (folderIds.length === 0 && snippetIds.length === 0) return;
        await browser.runtime.sendMessage({
          type: 'DELETE_SNIPPET_ITEMS',
          payload: { snippetIds, folderIds },
        });
        await get().fetchData(true, ['snippets', 'snippetFolders']);
      } catch (error) {
        console.error('Failed to delete snippet items:', error);
      }
    },

    moveSnippetItems: async (itemIds, newParentId) => {
      try {
        await browser.runtime.sendMessage({
          type: 'MOVE_SNIPPETS',
          payload: { ids: itemIds, folderId: newParentId },
        });
        await get().fetchData(true, ['snippets', 'snippetFolders']);
      } catch (error) {
        console.error('Failed to move snippet items:', error);
      }
    },

    moveSnippetItem: async (itemId, newParentId, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'UPDATE_SNIPPET_FOLDER',
            payload: { id: itemId, updates: { parent_id: newParentId } },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'MOVE_SNIPPET',
            payload: { id: itemId, folderId: newParentId },
          });
        }
        await get().fetchData(true, ['snippets', 'snippetFolders']);
      } catch (error) {
        console.error('Failed to move snippet item:', error);
      }
    },

    renameSnippetItem: async (itemId, newName, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'UPDATE_SNIPPET_FOLDER',
            payload: { id: itemId, updates: { name: newName } },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'UPDATE_SNIPPET',
            payload: { id: itemId, updates: { title: newName } },
          });
        }
        await get().fetchData(true, ['snippets', 'snippetFolders']);
      } catch (error) {
        console.error('Failed to rename snippet item:', error);
      }
    },

    setSnippetsSearch: (isOpen, query) =>
      set((state) => ({
        ui: {
          ...state.ui,
          snippets: {
            ...state.ui.snippets,
            search: {
              isOpen,
              query: query ?? state.ui.snippets.search.query,
            },
          },
        },
      })),

    setSnippetsSortOrder: (sortOrder) =>
      set((state) => ({
        ui: { ...state.ui, snippets: { ...state.ui.snippets, sortOrder } },
      })),

    setSnippetsOnlyFavorites: (onlyFavorites) =>
      set((state) => ({
        ui: { ...state.ui, snippets: { ...state.ui.snippets, onlyFavorites } },
      })),

    setSnippetsBatchMode: (isBatchMode) =>
      set((state) => ({
        ui: {
          ...state.ui,
          snippets: {
            ...state.ui.snippets,
            batch: {
              ...state.ui.snippets.batch,
              isBatchMode,
              selectedIds: isBatchMode
                ? state.ui.snippets.batch.selectedIds
                : [],
            },
          },
        },
      })),

    setSnippetsBatchSelection: (selectedIds) =>
      set((state) => ({
        ui: {
          ...state.ui,
          snippets: {
            ...state.ui.snippets,
            batch: { ...state.ui.snippets.batch, selectedIds },
          },
        },
      })),

    toggleSnippetsBatchSelection: (id) =>
      set((state) => {
        const { snippetFolders, snippets } = state;
        const currentSelected = new Set(state.ui.snippets.batch.selectedIds);
        const isSelected = currentSelected.has(id);

        const getAllDescendants = (folderId: string): string[] => {
          const descendants: string[] = [];
          const childFolders = snippetFolders.filter(
            (f) => f.parent_id === folderId,
          );
          childFolders.forEach((f) => {
            descendants.push(f.id);
            descendants.push(...getAllDescendants(f.id));
          });
          const childFiles = snippets.filter((s) => s.folder_id === folderId);
          childFiles.forEach((s) => descendants.push(s.id));
          return descendants;
        };

        const getAncestors = (itemId: string): string[] => {
          const ancestors: string[] = [];
          let currentId = itemId;
          while (true) {
            const folder = snippetFolders.find((f) => f.id === currentId);
            if (folder?.parent_id) {
              ancestors.push(folder.parent_id);
              currentId = folder.parent_id;
            } else {
              const file = snippets.find((s) => s.id === currentId);
              if (file?.folder_id) {
                ancestors.push(file.folder_id);
                currentId = file.folder_id;
              } else break;
            }
          }
          return ancestors;
        };

        const areAllChildrenSelected = (folderId: string): boolean => {
          const childFolders = snippetFolders.filter(
            (f) => f.parent_id === folderId,
          );
          const childFiles = snippets.filter((s) => s.folder_id === folderId);
          if (childFolders.length === 0 && childFiles.length === 0) return false;
          return (
            childFolders.every((f) => currentSelected.has(f.id)) &&
            childFiles.every((s) => currentSelected.has(s.id))
          );
        };

        if (isSelected) {
          currentSelected.delete(id);
          getAllDescendants(id).forEach((d) => currentSelected.delete(d));
          getAncestors(id).forEach((a) => currentSelected.delete(a));
        } else {
          currentSelected.add(id);
          getAllDescendants(id).forEach((d) => currentSelected.add(d));
          for (const ancestorId of getAncestors(id)) {
            if (areAllChildrenSelected(ancestorId)) {
              currentSelected.add(ancestorId);
            } else {
              break;
            }
          }
        }

        return {
          ui: {
            ...state.ui,
            snippets: {
              ...state.ui.snippets,
              batch: {
                ...state.ui.snippets.batch,
                selectedIds: Array.from(currentSelected),
              },
            },
          },
        };
      }),

    openSnippetReaderDrawer: (folderId, snippetId) =>
      set((state) => ({
        ui: {
          ...state.ui,
          snippets: {
            ...state.ui.snippets,
            readerDrawer: {
              isOpen: true,
              folderId,
              activeSnippetId: snippetId,
            },
          },
        },
      })),

    closeSnippetReaderDrawer: () =>
      set((state) => ({
        ui: {
          ...state.ui,
          snippets: {
            ...state.ui.snippets,
            readerDrawer: {
              isOpen: false,
              folderId: null,
              activeSnippetId: null,
            },
          },
        },
      })),
  };
}
