import type { UIState } from './types';

import { Platform } from '@/shared/types/platform';

export const initialUIState: UIState = {
  overlay: {
    currentPlatform: Platform.AI_STUDIO,
    isOpen: true,
    isSidebarExpanded: true,
    activeTab: 'files',
    isScanning: false,
    isSettingsOpen: false,
    showSqlInterface: false,
    tempHiddenToken: null,
  },
  explorer: {
    search: { isOpen: false, query: '' },
    tags: { isOpen: false, selected: [] },
    typeFilter: 'all',
    onlyFavorites: false,
    sortOrder: 'alpha',
    viewMode: 'tree',
    batch: { isBatchMode: false, selectedIds: [] },
  },
  favorites: {
    search: { isOpen: false, query: '' },
    tags: { isOpen: false, selected: [] },
    typeFilter: 'all',
  },
  gems: {
    search: { isOpen: false, query: '' },
    tags: { isOpen: false, selected: [] },
    onlyFavorites: false,
    sortOrder: 'alpha',
  },
  notebooks: {
    search: { isOpen: false, query: '' },
    tags: { isOpen: false, selected: [] },
    onlyFavorites: false,
    sortOrder: 'alpha',
  },
  prompts: {
    search: { isOpen: false, query: '' },
    typeFilter: 'all',
    onlyFavorites: false,
    sortOrder: 'alpha',
    batch: { isBatchMode: false, selectedIds: [] },
  },
  search: {
    query: '',
    activeQuery: '',
    results: [],
    isSearching: false,
    options: {
      caseSensitive: false,
      wholeWord: false,
      include: '',
      exclude: '',
      roleFilter: 'all',
      platforms: [],
      showOptions: false,
    },
    activeOptions: {
      caseSensitive: false,
      wholeWord: false,
      include: '',
      exclude: '',
      roleFilter: 'all',
      platforms: [],
    },
  },
};
