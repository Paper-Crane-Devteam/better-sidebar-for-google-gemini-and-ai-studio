import {
  Favorite,
  Tag,
  ConversationTag,
  Prompt,
  PromptFolder,
  Gem,
  Notebook,
} from '../../types/db';
import type { Platform } from '../../types/platform';

export interface Folder {
  id: string;
  name: string;
  order_index: number;
  parent_id?: string | null;
  color?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  folder_id: string | null;
  updated_at: number;
  created_at?: number;
  last_active_at?: number;
  prompt_metadata?: any;
  external_url?: string;
  external_id?: string;
  type?: 'conversation' | 'text-to-image' | 'gem' | 'notebook';
  platform?: string;
  gem_id?: string | null;
  notebook_id?: string | null;
}

export interface UIState {
  overlay: {
    currentPlatform: Platform;
    isOpen: boolean;
    isSidebarExpanded: boolean;
    activeTab:
      | 'files'
      | 'favorites'
      | 'tags'
      | 'feedback'
      | 'settings'
      | 'search'
      | 'prompts'
      | 'gems'
      | 'notebooks';
    isSettingsOpen: boolean;
    isScanning: boolean;
    showSqlInterface: boolean;
    tempHiddenToken: string | null;
  };
  search: {
    query: string;
    activeQuery: string;
    results: any[];
    isSearching: boolean;
    options: {
      caseSensitive: boolean;
      wholeWord: boolean;
      include: string;
      exclude: string;
      roleFilter: 'all' | 'user' | 'model';
      platforms: string[];
      showOptions: boolean;
      conversationId?: string;
    };
    activeOptions: {
      caseSensitive: boolean;
      wholeWord: boolean;
      include: string;
      exclude: string;
      roleFilter: 'all' | 'user' | 'model';
      platforms: string[];
      conversationId?: string;
    };
  };
  prompts: {
    search: { isOpen: boolean; query: string };
    typeFilter: 'all' | 'normal' | 'system';
    onlyFavorites: boolean;
    sortOrder: 'alpha' | 'date';
    batch: { isBatchMode: boolean; selectedIds: string[] };
  };
  explorer: {
    search: { isOpen: boolean; query: string };
    tags: { isOpen: boolean; selected: string[] };
    typeFilter: 'all' | 'conversation' | 'text-to-image' | 'gem' | 'notebook';
    onlyFavorites: boolean;
    sortOrder: 'alpha' | 'date';
    viewMode: 'tree' | 'timeline';
    batch: { isBatchMode: boolean; selectedIds: string[] };
  };
  favorites: {
    search: { isOpen: boolean; query: string };
    tags: { isOpen: boolean; selected: string[] };
    typeFilter: 'all' | 'conversation' | 'text-to-image' | 'gem' | 'notebook';
  };
  gems: {
    search: { isOpen: boolean; query: string };
    tags: { isOpen: boolean; selected: string[] };
    onlyFavorites: boolean;
    sortOrder: 'alpha' | 'date';
  };
  notebooks: {
    search: { isOpen: boolean; query: string };
    tags: { isOpen: boolean; selected: string[] };
    onlyFavorites: boolean;
    sortOrder: 'alpha' | 'date';
  };
}

export interface AppState {
  folders: Folder[];
  conversations: Conversation[];
  promptFolders: PromptFolder[];
  prompts: Prompt[];
  favorites: Favorite[];
  tags: Tag[];
  conversationTags: ConversationTag[];
  gems: Gem[];
  notebooks: Notebook[];
  isLoading: boolean;
  ui: UIState;

  setFolders: (folders: Folder[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  setPromptFolders: (folders: PromptFolder[]) => void;
  setPrompts: (prompts: Prompt[]) => void;
  fetchData: (silent?: boolean) => Promise<void>;
  moveItems: (itemIds: string[], newParentId: string | null) => Promise<void>;
  moveItem: (
    itemId: string,
    newParentId: string | null,
    type: 'folder' | 'file',
  ) => Promise<void>;
  renameItem: (
    itemId: string,
    newName: string,
    type: 'folder' | 'file',
  ) => Promise<void>;
  createFolder: (
    name: string,
    parentId: string | null,
  ) => Promise<string | null>;
  deleteItem: (itemId: string, type: 'folder' | 'file') => Promise<void>;
  deleteItems: (itemIds: string[]) => Promise<void>;
  updateFolderColor: (folderId: string, color: string | null) => Promise<void>;
  toggleFavorite: (
    targetId: string,
    targetType: 'conversation' | 'message' | 'prompt',
    isFavorite: boolean,
  ) => Promise<void>;

  createTag: (name: string, color?: string) => Promise<void>;
  updateTag: (
    id: string,
    updates: Partial<Pick<Tag, 'name' | 'color'>>,
  ) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  addTagToConversation: (
    conversationId: string,
    tagId: string,
  ) => Promise<void>;
  removeTagFromConversation: (
    conversationId: string,
    tagId: string,
  ) => Promise<void>;

  setCurrentPlatform: (platform: Platform) => void;
  setOverlayOpen: (isOpen: boolean) => void;
  setSidebarExpanded: (isExpanded: boolean) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setTempHiddenToken: (token: string | null) => void;
  setActiveTab: (
    tab:
      | 'files'
      | 'favorites'
      | 'tags'
      | 'feedback'
      | 'settings'
      | 'search'
      | 'prompts'
      | 'gems'
      | 'notebooks',
  ) => void;
  setIsScanning: (isScanning: boolean) => void;
  setShowSqlInterface: (show: boolean) => void;
  setExplorerSearch: (isOpen: boolean, query?: string) => void;
  setExplorerTags: (isOpen: boolean, selected?: string[]) => void;
  setExplorerTypeFilter: (
    filter: 'all' | 'conversation' | 'text-to-image' | 'gem' | 'notebook',
  ) => void;
  setExplorerOnlyFavorites: (onlyFavorites: boolean) => void;
  setExplorerSortOrder: (order: 'alpha' | 'date') => void;
  setExplorerViewMode: (mode: 'tree' | 'timeline') => void;
  setExplorerBatchMode: (isBatchMode: boolean) => void;
  setExplorerBatchSelection: (selectedIds: string[]) => void;
  toggleExplorerBatchSelection: (id: string) => void;

  setFavoritesSearch: (isOpen: boolean, query?: string) => void;
  setFavoritesTags: (isOpen: boolean, selected?: string[]) => void;
  setFavoritesTypeFilter: (
    filter: 'all' | 'conversation' | 'text-to-image' | 'gem' | 'notebook',
  ) => void;

  setSearchQuery: (query: string) => void;
  setSearchOptions: (
    options: Partial<AppState['ui']['search']['options']>,
  ) => void;
  performGlobalSearch: () => Promise<void>;

  createPromptFolder: (
    name: string,
    parentId: string | null,
  ) => Promise<string | null>;
  createPrompt: (
    title: string,
    content: string,
    type: 'normal' | 'system',
    icon: string,
    folderId: string | null,
  ) => Promise<void>;
  updatePrompt: (id: string, updates: Partial<Prompt>) => Promise<void>;
  deletePromptItem: (itemId: string, type: 'folder' | 'file') => Promise<void>;
  deletePromptItems: (itemIds: string[]) => Promise<void>;
  movePromptItems: (
    itemIds: string[],
    newParentId: string | null,
  ) => Promise<void>;
  movePromptItem: (
    itemId: string,
    newParentId: string | null,
    type: 'folder' | 'file',
  ) => Promise<void>;
  renamePromptItem: (
    itemId: string,
    newName: string,
    type: 'folder' | 'file',
  ) => Promise<void>;

  setPromptsSearch: (isOpen: boolean, query?: string) => void;
  setPromptsTypeFilter: (filter: 'all' | 'normal' | 'system') => void;
  setPromptsOnlyFavorites: (onlyFavorites: boolean) => void;
  setPromptsSortOrder: (order: 'alpha' | 'date') => void;
  setPromptsBatchMode: (isBatchMode: boolean) => void;
  setPromptsBatchSelection: (selectedIds: string[]) => void;
  togglePromptsBatchSelection: (id: string) => void;

  // Gems
  setGems: (gems: Gem[]) => void;
  setGemsSearch: (isOpen: boolean, query?: string) => void;
  setGemsTags: (isOpen: boolean, selected?: string[]) => void;
  setGemsOnlyFavorites: (onlyFavorites: boolean) => void;
  setGemsSortOrder: (order: 'alpha' | 'date') => void;

  // Notebooks
  setNotebooks: (notebooks: Notebook[]) => void;
  setNotebooksSearch: (isOpen: boolean, query?: string) => void;
  setNotebooksTags: (isOpen: boolean, selected?: string[]) => void;
  setNotebooksOnlyFavorites: (onlyFavorites: boolean) => void;
  setNotebooksSortOrder: (order: 'alpha' | 'date') => void;
}

export type SetState = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
) => void;
export type GetState = () => AppState;
