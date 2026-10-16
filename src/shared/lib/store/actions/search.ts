import type { AppState, SetState, GetState } from '../types';
import { getSearchRegexError } from '../../search-pattern';

export function createSearchActions(
  set: SetState,
  get: GetState
): Pick<AppState, 'setSearchQuery' | 'setSearchOptions' | 'performGlobalSearch'> {
  return {
    setSearchQuery: (query) =>
      set((state) => ({
        ui: {
          ...state.ui,
          search: { ...state.ui.search, query },
        },
      })),
    setSearchOptions: (options) =>
      set((state) => ({
        ui: {
          ...state.ui,
          search: {
            ...state.ui.search,
            options: { ...state.ui.search.options, ...options },
          },
        },
      })),
    performGlobalSearch: async () => {
      const state = get();
      const { query, options } = state.ui.search;

      if (!query.trim()) {
        set((s) => ({
          ui: { ...s.ui, search: { ...s.ui.search, results: [], activeQuery: '', isSearching: false } },
        }));
        return;
      }

      // A half-typed regex is invalid most of the time. The input shows the error;
      // don't round-trip to the DB just to get it back.
      if (getSearchRegexError(query, options)) {
        set((s) => ({
          ui: { ...s.ui, search: { ...s.ui.search, results: [], activeQuery: '', isSearching: false } },
        }));
        return;
      }

      set((s) => ({
        ui: { ...s.ui, search: { ...s.ui.search, isSearching: true } },
      }));

      try {
        const resolveFolderNames = (input: string) => {
          if (!input.trim()) return undefined;
          return input
            .split(',')
            .map((s) => s.trim())
            .filter((n) => n.length > 0);
        };
        const includeFolderNames = resolveFolderNames(options.include);
        const excludeFolderNames = resolveFolderNames(options.exclude);

        const response = await browser.runtime.sendMessage({
          type: 'SEARCH_MESSAGES',
          payload: {
            query,
            options: {
              caseSensitive: options.caseSensitive,
              wholeWord: options.wholeWord,
              useRegex: options.useRegex,
              includeFolderNames,
              excludeFolderNames,
              roleFilter: options.roleFilter,
              platforms: options.platforms,
              conversationId: options.conversationId,
            },
          },
        });

        if (response.success) {
          set((s) => ({
            ui: {
              ...s.ui,
              search: {
                ...s.ui.search,
                results: response.data,
                activeQuery: query,
                activeOptions: { ...options },
                isSearching: false,
              },
            },
          }));
        } else {
          console.error('Search failed:', response.error);
          set((s) => ({
            ui: { ...s.ui, search: { ...s.ui.search, isSearching: false } },
          }));
        }
      } catch (error) {
        console.error('Search error:', error);
        set((s) => ({
          ui: { ...s.ui, search: { ...s.ui.search, isSearching: false } },
        }));
      }
    },
  };
}
