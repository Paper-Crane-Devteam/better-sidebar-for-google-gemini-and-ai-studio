import type { AppState, SetState, GetState } from '../types';

export function createGemsActions(
  set: SetState,
  _get: GetState,
): Pick<
  AppState,
  | 'setGems'
  | 'setGemsSearch'
  | 'setGemsTags'
  | 'setGemsOnlyFavorites'
  | 'setGemsSortOrder'
> {
  return {
    setGems: (gems) => set({ gems }),
    setGemsSearch: (isOpen, query) =>
      set((state) => ({
        ui: {
          ...state.ui,
          gems: {
            ...state.ui.gems,
            search: {
              isOpen,
              query: query ?? state.ui.gems.search.query,
            },
          },
        },
      })),
    setGemsTags: (isOpen, selected) =>
      set((state) => ({
        ui: {
          ...state.ui,
          gems: {
            ...state.ui.gems,
            tags: {
              isOpen,
              selected: selected ?? state.ui.gems.tags.selected,
            },
          },
        },
      })),
    setGemsOnlyFavorites: (onlyFavorites) =>
      set((state) => ({
        ui: { ...state.ui, gems: { ...state.ui.gems, onlyFavorites } },
      })),
    setGemsSortOrder: (sortOrder) =>
      set((state) => ({
        ui: { ...state.ui, gems: { ...state.ui.gems, sortOrder } },
      })),
  };
}
