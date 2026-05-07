import type { AppState, SetState, GetState } from '../types';

export function createNotebooksActions(
  set: SetState,
  _get: GetState,
): Pick<
  AppState,
  | 'setNotebooks'
  | 'setNotebooksSearch'
  | 'setNotebooksTags'
  | 'setNotebooksOnlyFavorites'
  | 'setNotebooksSortOrder'
> {
  return {
    setNotebooks: (notebooks) => set({ notebooks }),
    setNotebooksSearch: (isOpen, query) =>
      set((state) => ({
        ui: {
          ...state.ui,
          notebooks: {
            ...state.ui.notebooks,
            search: {
              isOpen,
              query: query ?? state.ui.notebooks.search.query,
            },
          },
        },
      })),
    setNotebooksTags: (isOpen, selected) =>
      set((state) => ({
        ui: {
          ...state.ui,
          notebooks: {
            ...state.ui.notebooks,
            tags: {
              isOpen,
              selected: selected ?? state.ui.notebooks.tags.selected,
            },
          },
        },
      })),
    setNotebooksOnlyFavorites: (onlyFavorites) =>
      set((state) => ({
        ui: {
          ...state.ui,
          notebooks: { ...state.ui.notebooks, onlyFavorites },
        },
      })),
    setNotebooksSortOrder: (sortOrder) =>
      set((state) => ({
        ui: { ...state.ui, notebooks: { ...state.ui.notebooks, sortOrder } },
      })),
  };
}
