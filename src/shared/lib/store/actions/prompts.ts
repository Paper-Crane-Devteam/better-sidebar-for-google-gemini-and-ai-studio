import type { AppState, SetState, GetState } from '../types';

export function createPromptsActions(
  set: SetState,
  get: GetState,
): Pick<
  AppState,
  | 'createPromptFolder'
  | 'createPrompt'
  | 'updatePrompt'
  | 'deletePromptItem'
  | 'deletePromptItems'
  | 'movePromptItems'
  | 'movePromptItem'
  | 'renamePromptItem'
  | 'setPromptsSearch'
  | 'setPromptsTypeFilter'
  | 'setPromptsOnlyFavorites'
  | 'setPromptsSortOrder'
  | 'setPromptsBatchMode'
  | 'setPromptsBatchSelection'
  | 'togglePromptsBatchSelection'
> {
  return {
    createPromptFolder: async (name, parentId) => {
      try {
        const newId = crypto.randomUUID();
        await browser.runtime.sendMessage({
          type: 'CREATE_PROMPT_FOLDER',
          payload: { id: newId, name, parentId: parentId || null },
        });
        await get().fetchData(true, ['prompts', 'promptFolders']);
        return newId;
      } catch (error) {
        console.error('Failed to create prompt folder:', error);
        return null;
      }
    },

    createPrompt: async (title, content, type, icon, folderId) => {
      try {
        const newId = crypto.randomUUID();
        await browser.runtime.sendMessage({
          type: 'CREATE_PROMPT',
          payload: {
            id: newId,
            title,
            content,
            type,
            icon,
            folderId: folderId || null,
          },
        });
        await get().fetchData(true, ['prompts', 'promptFolders']);
      } catch (error) {
        console.error('Failed to create prompt:', error);
      }
    },

    updatePrompt: async (id, updates) => {
      try {
        await browser.runtime.sendMessage({
          type: 'UPDATE_PROMPT',
          payload: { id, updates },
        });
        await get().fetchData(true, ['prompts', 'promptFolders']);
      } catch (error) {
        console.error('Failed to update prompt:', error);
      }
    },

    deletePromptItem: async (itemId, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'DELETE_PROMPT_FOLDER',
            payload: { id: itemId },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'DELETE_PROMPT',
            payload: { id: itemId },
          });
        }
        await get().fetchData(true, ['prompts', 'promptFolders']);
      } catch (error) {
        console.error('Failed to delete prompt item:', error);
      }
    },

    deletePromptItems: async (itemIds) => {
      try {
        const state = get();
        const folderIds = itemIds.filter((id) =>
          state.promptFolders.some((f) => f.id === id),
        );
        const promptIds = itemIds.filter((id) =>
          state.prompts.some((p) => p.id === id),
        );
        if (folderIds.length === 0 && promptIds.length === 0) return;
        await browser.runtime.sendMessage({
          type: 'DELETE_PROMPT_ITEMS',
          payload: { promptIds, folderIds },
        });
        await get().fetchData(true, ['prompts', 'promptFolders']);
      } catch (error) {
        console.error('Failed to delete prompt items:', error);
      }
    },

    movePromptItems: async (itemIds, newParentId) => {
      try {
        await browser.runtime.sendMessage({
          type: 'MOVE_PROMPTS',
          payload: { ids: itemIds, folderId: newParentId },
        });
        await get().fetchData(true, ['prompts', 'promptFolders']);
      } catch (error) {
        console.error('Failed to move prompt items:', error);
      }
    },

    movePromptItem: async (itemId, newParentId, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'UPDATE_PROMPT_FOLDER',
            payload: { id: itemId, updates: { parent_id: newParentId } },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'MOVE_PROMPT',
            payload: { id: itemId, folderId: newParentId },
          });
        }
        await get().fetchData(true, ['prompts', 'promptFolders']);
      } catch (error) {
        console.error('Failed to move prompt item:', error);
      }
    },

    renamePromptItem: async (itemId, newName, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'UPDATE_PROMPT_FOLDER',
            payload: { id: itemId, updates: { name: newName } },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'UPDATE_PROMPT',
            payload: { id: itemId, updates: { title: newName } },
          });
        }
        await get().fetchData(true, ['prompts', 'promptFolders']);
      } catch (error) {
        console.error('Failed to rename prompt item:', error);
      }
    },

    setPromptsSearch: (isOpen, query) =>
      set((state) => ({
        ui: {
          ...state.ui,
          prompts: {
            ...state.ui.prompts,
            search: {
              isOpen,
              query: query ?? state.ui.prompts.search.query,
            },
          },
        },
      })),

    setPromptsTypeFilter: (typeFilter) =>
      set((state) => ({
        ui: { ...state.ui, prompts: { ...state.ui.prompts, typeFilter } },
      })),

    setPromptsOnlyFavorites: (onlyFavorites) =>
      set((state) => ({
        ui: { ...state.ui, prompts: { ...state.ui.prompts, onlyFavorites } },
      })),

    setPromptsSortOrder: (sortOrder) =>
      set((state) => ({
        ui: { ...state.ui, prompts: { ...state.ui.prompts, sortOrder } },
      })),

    setPromptsBatchMode: (isBatchMode) =>
      set((state) => ({
        ui: {
          ...state.ui,
          prompts: {
            ...state.ui.prompts,
            batch: {
              ...state.ui.prompts.batch,
              isBatchMode,
              selectedIds: isBatchMode
                ? state.ui.prompts.batch.selectedIds
                : [],
            },
          },
        },
      })),

    setPromptsBatchSelection: (selectedIds) =>
      set((state) => ({
        ui: {
          ...state.ui,
          prompts: {
            ...state.ui.prompts,
            batch: { ...state.ui.prompts.batch, selectedIds },
          },
        },
      })),

    togglePromptsBatchSelection: (id) =>
      set((state) => {
        const { promptFolders, prompts } = state;
        const currentSelected = new Set(state.ui.prompts.batch.selectedIds);
        const isSelected = currentSelected.has(id);

        const getAllDescendants = (folderId: string): string[] => {
          const descendants: string[] = [];
          const childFolders = promptFolders.filter(
            (f) => f.parent_id === folderId,
          );
          childFolders.forEach((f) => {
            descendants.push(f.id);
            descendants.push(...getAllDescendants(f.id));
          });
          const childFiles = prompts.filter((c) => c.folder_id === folderId);
          childFiles.forEach((c) => descendants.push(c.id));
          return descendants;
        };

        const getAncestors = (itemId: string): string[] => {
          const ancestors: string[] = [];
          let currentId = itemId;
          while (true) {
            const folder = promptFolders.find((f) => f.id === currentId);
            if (folder?.parent_id) {
              ancestors.push(folder.parent_id);
              currentId = folder.parent_id;
            } else {
              const file = prompts.find((c) => c.id === currentId);
              if (file?.folder_id) {
                ancestors.push(file.folder_id);
                currentId = file.folder_id;
              } else break;
            }
          }
          return ancestors;
        };

        const areAllChildrenSelected = (folderId: string): boolean => {
          const childFolders = promptFolders.filter(
            (f) => f.parent_id === folderId,
          );
          const childFiles = prompts.filter((c) => c.folder_id === folderId);
          if (childFolders.length === 0 && childFiles.length === 0) return false;
          return (
            childFolders.every((f) => currentSelected.has(f.id)) &&
            childFiles.every((c) => currentSelected.has(c.id))
          );
        };

        if (isSelected) {
          currentSelected.delete(id);
          getAllDescendants(id).forEach((d) => currentSelected.delete(d));
          getAncestors(id).forEach((a) => currentSelected.delete(a));
        } else {
          currentSelected.add(id);
          getAllDescendants(id).forEach((d) => currentSelected.add(d));
          // Recursively check ancestors: if all children of a parent are selected, select the parent too
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
            prompts: {
              ...state.ui.prompts,
              batch: {
                ...state.ui.prompts.batch,
                selectedIds: Array.from(currentSelected),
              },
            },
          },
        };
      }),
  };
}
