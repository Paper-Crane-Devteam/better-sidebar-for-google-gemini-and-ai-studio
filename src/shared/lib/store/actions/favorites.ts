import type { AppState, SetState } from '../types';

export function createFavoritesActions(set: SetState): Pick<
  AppState,
  'setFavoritesSearch' | 'setFavoritesTags' | 'setFavoritesTypeFilter'
> {
  return {
    setFavoritesSearch: (isOpen, query) =>
      set((state) => ({
        ui: {
          ...state.ui,
          favorites: {
            ...state.ui.favorites,
            search: {
              isOpen,
              query: query ?? state.ui.favorites.search.query,
            },
          },
        },
      })),
    setFavoritesTags: (isOpen, selected) =>
      set((state) => ({
        ui: {
          ...state.ui,
          favorites: {
            ...state.ui.favorites,
            tags: {
              isOpen,
              selected: selected ?? state.ui.favorites.tags.selected,
            },
          },
        },
      })),
    setFavoritesTypeFilter: (typeFilter) =>
      set((state) => ({
        ui: { ...state.ui, favorites: { ...state.ui.favorites, typeFilter } },
      })),
  };
}
