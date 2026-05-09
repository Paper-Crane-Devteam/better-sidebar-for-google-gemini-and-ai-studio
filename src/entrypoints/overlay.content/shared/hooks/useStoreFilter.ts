import { useAppStore } from '@/shared/lib/store';
import type {
  FilterState,
  ExplorerTypeFilter,
  PromptsTypeFilter,
} from '../types/filter';

export function useStoreFilter(
  slice: 'explorer' | 'favorites' | 'gems' | 'notebooks',
): FilterState<ExplorerTypeFilter>;
export function useStoreFilter(slice: 'prompts'): FilterState<PromptsTypeFilter>;
export function useStoreFilter(
  slice: 'explorer' | 'favorites' | 'prompts' | 'gems' | 'notebooks',
): FilterState<ExplorerTypeFilter> | FilterState<PromptsTypeFilter> {
  const store = useAppStore();

  const uiState =
    slice === 'explorer'
      ? store.ui.explorer
      : slice === 'favorites'
        ? store.ui.favorites
        : slice === 'gems'
          ? store.ui.gems
          : slice === 'notebooks'
            ? store.ui.notebooks
            : store.ui.prompts;

  const setIsSearchOpen = (isOpen: boolean) => {
    if (slice === 'explorer') store.setExplorerSearch(isOpen);
    else if (slice === 'favorites') store.setFavoritesSearch(isOpen);
    else if (slice === 'gems') store.setGemsSearch(isOpen);
    else if (slice === 'notebooks') store.setNotebooksSearch(isOpen);
    else store.setPromptsSearch(isOpen);
  };

  const setSearchQuery = (query: string) => {
    if (slice === 'explorer') store.setExplorerSearch(true, query);
    else if (slice === 'favorites') store.setFavoritesSearch(true, query);
    else if (slice === 'gems') store.setGemsSearch(true, query);
    else if (slice === 'notebooks') store.setNotebooksSearch(true, query);
    else store.setPromptsSearch(true, query);
  };

  const setIsTagsOpen = (isOpen: boolean) => {
    if (slice === 'explorer') store.setExplorerTags(isOpen);
    else if (slice === 'favorites') store.setFavoritesTags(isOpen);
    else if (slice === 'gems') store.setGemsTags(isOpen);
    else if (slice === 'notebooks') store.setNotebooksTags(isOpen);
  };

  const setSelectedTags = (selected: string[]) => {
    if (slice === 'explorer') store.setExplorerTags(true, selected);
    else if (slice === 'favorites') store.setFavoritesTags(true, selected);
    else if (slice === 'gems') store.setGemsTags(true, selected);
    else if (slice === 'notebooks') store.setNotebooksTags(true, selected);
  };

  const setTypeFilter = (value: ExplorerTypeFilter | PromptsTypeFilter) => {
    if (slice === 'explorer') store.setExplorerTypeFilter(value as ExplorerTypeFilter);
    else if (slice === 'favorites') store.setFavoritesTypeFilter(value as ExplorerTypeFilter);
    else store.setPromptsTypeFilter(value as PromptsTypeFilter);
  };

  const setOnlyFavorites = (value: boolean) => {
    if (slice === 'explorer') store.setExplorerOnlyFavorites(value);
    else if (slice === 'gems') store.setGemsOnlyFavorites(value);
    else if (slice === 'notebooks') store.setNotebooksOnlyFavorites(value);
    else if (slice === 'prompts') store.setPromptsOnlyFavorites(value);
  };

  return {
    search: {
      isOpen: uiState.search.isOpen,
      setIsOpen: setIsSearchOpen,
      query: uiState.search.query,
      setQuery: setSearchQuery,
    },
    tags: {
      isOpen: (uiState as { tags?: { isOpen: boolean; selected: string[] } }).tags?.isOpen ?? false,
      setIsOpen: setIsTagsOpen,
      selected: (uiState as { tags?: { isOpen: boolean; selected: string[] } }).tags?.selected ?? [],
      setSelected: setSelectedTags,
    },
    type: {
      value: (uiState as any).typeFilter ?? 'all',
      setValue: setTypeFilter,
    },
    onlyFavorites: {
      value:
        slice === 'explorer'
          ? store.ui.explorer.onlyFavorites
          : slice === 'gems'
            ? store.ui.gems.onlyFavorites
            : slice === 'notebooks'
              ? store.ui.notebooks.onlyFavorites
              : slice === 'prompts'
                ? store.ui.prompts.onlyFavorites
                : false,
      setValue: setOnlyFavorites,
    },
  } as FilterState<ExplorerTypeFilter> | FilterState<PromptsTypeFilter>;
}
