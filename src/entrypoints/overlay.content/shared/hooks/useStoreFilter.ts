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
export function useStoreFilter(slice: 'snippets'): FilterState<ExplorerTypeFilter>;
export function useStoreFilter(
  slice: 'explorer' | 'favorites' | 'prompts' | 'gems' | 'notebooks' | 'snippets',
): FilterState<ExplorerTypeFilter> | FilterState<PromptsTypeFilter> {
  // Only `ui` is reactive here. Subscribing to the whole store re-rendered every
  // header and filter bar on each data refresh. Actions are stable, read them directly.
  const ui = useAppStore((s) => s.ui);
  const store = useAppStore.getState();

  const uiState =
    slice === 'explorer'
      ? ui.explorer
      : slice === 'favorites'
        ? ui.favorites
        : slice === 'gems'
          ? ui.gems
          : slice === 'notebooks'
            ? ui.notebooks
            : slice === 'snippets'
              ? ui.snippets
              : ui.prompts;

  const setIsSearchOpen = (isOpen: boolean) => {
    if (slice === 'explorer') store.setExplorerSearch(isOpen);
    else if (slice === 'favorites') store.setFavoritesSearch(isOpen);
    else if (slice === 'gems') store.setGemsSearch(isOpen);
    else if (slice === 'notebooks') store.setNotebooksSearch(isOpen);
    else if (slice === 'snippets') store.setSnippetsSearch(isOpen);
    else store.setPromptsSearch(isOpen);
  };

  const setSearchQuery = (query: string) => {
    if (slice === 'explorer') store.setExplorerSearch(true, query);
    else if (slice === 'favorites') store.setFavoritesSearch(true, query);
    else if (slice === 'gems') store.setGemsSearch(true, query);
    else if (slice === 'notebooks') store.setNotebooksSearch(true, query);
    else if (slice === 'snippets') store.setSnippetsSearch(true, query);
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
    else if (slice === 'snippets') store.setSnippetsOnlyFavorites(value);
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
          ? ui.explorer.onlyFavorites
          : slice === 'gems'
            ? ui.gems.onlyFavorites
            : slice === 'notebooks'
              ? ui.notebooks.onlyFavorites
              : slice === 'snippets'
                ? ui.snippets.onlyFavorites
                : slice === 'prompts'
                  ? ui.prompts.onlyFavorites
                  : false,
      setValue: setOnlyFavorites,
    },
  } as FilterState<ExplorerTypeFilter> | FilterState<PromptsTypeFilter>;
}
