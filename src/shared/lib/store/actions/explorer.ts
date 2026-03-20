import type { AppState, SetState, GetState } from '../types';

export function createExplorerActions(
  set: SetState,
  get: GetState
): Pick<
  AppState,
  | 'setExplorerSearch'
  | 'setExplorerTags'
  | 'setExplorerTypeFilter'
  | 'setExplorerOnlyFavorites'
  | 'setExplorerSortOrder'
  | 'setExplorerViewMode'
  | 'setExplorerBatchMode'
  | 'setExplorerBatchSelection'
  | 'toggleExplorerBatchSelection'
> {
  return {
    setExplorerSearch: (isOpen, query) =>
      set((state) => ({
        ui: {
          ...state.ui,
          explorer: {
            ...state.ui.explorer,
            search: {
              isOpen,
              query: query ?? state.ui.explorer.search.query,
            },
          },
        },
      })),
    setExplorerTags: (isOpen, selected) =>
      set((state) => ({
        ui: {
          ...state.ui,
          explorer: {
            ...state.ui.explorer,
            tags: {
              isOpen,
              selected: selected ?? state.ui.explorer.tags.selected,
            },
          },
        },
      })),
    setExplorerTypeFilter: (typeFilter) =>
      set((state) => ({
        ui: { ...state.ui, explorer: { ...state.ui.explorer, typeFilter } },
      })),
    setExplorerOnlyFavorites: (onlyFavorites) =>
      set((state) => ({
        ui: { ...state.ui, explorer: { ...state.ui.explorer, onlyFavorites } },
      })),
    setExplorerSortOrder: (sortOrder) =>
      set((state) => ({
        ui: { ...state.ui, explorer: { ...state.ui.explorer, sortOrder } },
      })),
    setExplorerViewMode: (viewMode) =>
      set((state) => ({
        ui: { ...state.ui, explorer: { ...state.ui.explorer, viewMode } },
      })),
    setExplorerBatchMode: (isBatchMode) =>
      set((state) => ({
        ui: {
          ...state.ui,
          explorer: {
            ...state.ui.explorer,
            batch: {
              ...state.ui.explorer.batch,
              isBatchMode,
              selectedIds: isBatchMode ? state.ui.explorer.batch.selectedIds : [],
            },
          },
        },
      })),
    setExplorerBatchSelection: (selectedIds) =>
      set((state) => ({
        ui: {
          ...state.ui,
          explorer: {
            ...state.ui.explorer,
            batch: { ...state.ui.explorer.batch, selectedIds },
          },
        },
      })),
    toggleExplorerBatchSelection: (id) =>
      set((state) => {
        const { folders, conversations } = state;
        const currentSelected = new Set(state.ui.explorer.batch.selectedIds);
        const isSelected = currentSelected.has(id);

        const getAllDescendants = (folderId: string): string[] => {
          const descendants: string[] = [];
          const childFolders = folders.filter((f) => f.parent_id === folderId);
          childFolders.forEach((f) => {
            descendants.push(f.id);
            descendants.push(...getAllDescendants(f.id));
          });
          const childFiles = conversations.filter((c) => c.folder_id === folderId);
          childFiles.forEach((c) => descendants.push(c.id));
          return descendants;
        };

        const getAncestors = (itemId: string): string[] => {
          const ancestors: string[] = [];
          let currentId = itemId;
          while (true) {
            const folder = folders.find((f) => f.id === currentId);
            if (folder?.parent_id) {
              ancestors.push(folder.parent_id);
              currentId = folder.parent_id;
            } else {
              const file = conversations.find((c) => c.id === currentId);
              if (file?.folder_id) {
                ancestors.push(file.folder_id);
                currentId = file.folder_id;
              } else break;
            }
          }
          return ancestors;
        };

        if (isSelected) {
          currentSelected.delete(id);
          getAllDescendants(id).forEach((d) => currentSelected.delete(d));
          getAncestors(id).forEach((a) => currentSelected.delete(a));
        } else {
          currentSelected.add(id);
          getAllDescendants(id).forEach((d) => currentSelected.add(d));
        }

        return {
          ui: {
            ...state.ui,
            explorer: {
              ...state.ui.explorer,
              batch: { ...state.ui.explorer.batch, selectedIds: Array.from(currentSelected) },
            },
          },
        };
      }),
  };
}
