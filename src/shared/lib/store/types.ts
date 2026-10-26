import {
  Favorite,
  Tag,
  ConversationTag,
  Prompt,
  PromptFolder,
  Gem,
  Notebook,
  Snippet,
  SnippetFolder,
  CollectionFolder,
  CollectionScope,
} from '../../types/db';
import type { Platform } from '../../types/platform';
import type { DataScope } from '../../types/data-scope';

export interface Folder {
  id: string;
  name: string;
  order_index: number;
  parent_id?: string | null;
  color?: string | null;
  is_pinned?: number;
}

export interface Conversation {
  id: string;
  title: string;
  description?: string | null;
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
  /**
   * Manual position inside its folder, used by the explorer's `custom` sort.
   * 0 = never ranked (sorted by date above the ranked ones); ranks start at 1.
   */
  order_index?: number;
}

/**
 * Explorer sort mode. Only conversations follow it — folders are always in their
 * manual (`order_index`) order, whatever the mode.
 */
export type ExplorerSortOrder = 'alpha' | 'date' | 'custom';

/**
 * Gems / Notebooks panel sort mode. Applies to the gems/notebooks themselves;
 * their folders always keep their manual order.
 */
export type CollectionSortOrder = 'alpha' | 'date' | 'custom';

/** Sections available in the settings modal sidebar. */
export type SettingsSection =
  | 'general'
  | 'theme'
  | 'explorer'
  | 'data'
  | 'hotkeys'
  | 'platform'
  | 'integrations'
  | 'agent'
  | 'supportpack'
  | 'sponsor'
  | 'about';

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
      | 'notebooks'
      | 'snippets'
      | 'agent'
      | 'spark';
    isSettingsOpen: boolean;
    /** Section the settings modal should jump to when opened. null = keep current. */
    settingsSection: SettingsSection | null;
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
      useRegex: boolean;
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
      useRegex: boolean;
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
    sortOrder: ExplorerSortOrder;
    viewMode: 'tree' | 'timeline';
    batch: { isBatchMode: boolean; selectedIds: string[] };
  };
  favorites: {
    search: { isOpen: boolean; query: string };
    tags: { isOpen: boolean; selected: string[] };
    typeFilter: 'all' | 'conversation' | 'text-to-image' | 'gem' | 'notebook';
  };
  // Sort order for these two lives in the settings store (persisted).
  gems: {
    search: { isOpen: boolean; query: string };
    tags: { isOpen: boolean; selected: string[] };
    onlyFavorites: boolean;
  };
  notebooks: {
    search: { isOpen: boolean; query: string };
    tags: { isOpen: boolean; selected: string[] };
    onlyFavorites: boolean;
  };
  snippets: {
    search: { isOpen: boolean; query: string };
    sortOrder: 'alpha' | 'date';
    onlyFavorites: boolean;
    batch: { isBatchMode: boolean; selectedIds: string[] };
    readerDrawer: {
      isOpen: boolean;
      folderId: string | null;
      activeSnippetId: string | null;
    };
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
  snippetFolders: SnippetFolder[];
  snippets: Snippet[];
  /** Folders of the Gems and Notebooks panels (both scopes). */
  collectionFolders: CollectionFolder[];
  isLoading: boolean;
  ui: UIState;

  setFolders: (folders: Folder[]) => void;
  setConversations: (conversations: Conversation[]) => void;
  setPromptFolders: (folders: PromptFolder[]) => void;
  setPrompts: (prompts: Prompt[]) => void;
  /**
   * Refresh datasets from the background. `scopes` limits it to the tables a
   * write touched; omitted means all of them. Calls within a short window are
   * merged into one batch.
   */
  fetchData: (silent?: boolean, scopes?: readonly DataScope[]) => Promise<void>;
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
  updateConversationDescription: (
    itemId: string,
    description: string,
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
    targetType: 'conversation' | 'message' | 'prompt' | 'snippet',
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
  /** Open/close the settings modal, optionally jumping straight to a section. */
  setSettingsOpen: (isOpen: boolean, section?: SettingsSection) => void;
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
      | 'notebooks'
      | 'snippets'
      | 'agent'
      | 'spark',
  ) => void;
  setIsScanning: (isScanning: boolean) => void;
  setShowSqlInterface: (show: boolean) => void;
  setExplorerSearch: (isOpen: boolean, query?: string) => void;
  setExplorerTags: (isOpen: boolean, selected?: string[]) => void;
  setExplorerTypeFilter: (
    filter: 'all' | 'conversation' | 'text-to-image' | 'gem' | 'notebook',
  ) => void;
  setExplorerOnlyFavorites: (onlyFavorites: boolean) => void;
  setExplorerSortOrder: (order: ExplorerSortOrder) => void;
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

  // Notebooks
  setNotebooks: (notebooks: Notebook[]) => void;
  setNotebooksSearch: (isOpen: boolean, query?: string) => void;
  setNotebooksTags: (isOpen: boolean, selected?: string[]) => void;
  setNotebooksOnlyFavorites: (onlyFavorites: boolean) => void;

  // Gems / Notebooks panel folders
  /** Returns the new folder id, or null on failure. */
  createCollectionFolder: (
    scope: CollectionScope,
    name: string,
    parentId: string | null,
  ) => Promise<string | null>;
  renameCollectionFolder: (id: string, name: string) => Promise<void>;
  moveCollectionFolder: (id: string, parentId: string | null) => Promise<void>;
  /** False when the folder still has contents and was left in place. */
  deleteCollectionFolder: (id: string) => Promise<boolean>;
  /** Write positions for sibling folders, in this order. */
  reorderCollectionFolders: (orderedIds: string[]) => Promise<void>;
  /** Put a gem/notebook into a folder (null = top level). */
  moveCollectionItem: (
    scope: CollectionScope,
    id: string,
    folderId: string | null,
  ) => Promise<void>;
  /** Manual ranks 1..n for the gems/notebooks of one folder, in this order. */
  reorderCollectionItems: (scope: CollectionScope, orderedIds: string[]) => Promise<void>;

  // Pin
  reorderFolders: (
    parentId: string | null,
    orderedIds: string[],
  ) => Promise<void>;
  /** Write manual ranks 1..n for the conversations of one folder, in this order. */
  reorderConversations: (
    folderId: string | null,
    orderedIds: string[],
  ) => Promise<void>;

  togglePin: (
    id: string,
    table:
      | 'folders'
      | 'prompt_folders'
      | 'gems'
      | 'notebooks'
      | 'snippet_folders'
      | 'collection_folders',
    currentlyPinned: boolean,
  ) => Promise<void>;

  // Snippets
  setSnippetFolders: (folders: SnippetFolder[]) => void;
  setSnippets: (snippets: Snippet[]) => void;
  createSnippetFolder: (
    name: string,
    parentId: string | null,
  ) => Promise<string | null>;
  createSnippet: (
    title: string,
    content: string,
    sourceUrl: string | null,
    sourcePlatform: string | null,
    folderId: string | null,
  ) => Promise<void>;
  updateSnippet: (id: string, updates: Partial<Snippet>) => Promise<void>;
  deleteSnippetItem: (itemId: string, type: 'folder' | 'file') => Promise<void>;
  deleteSnippetItems: (itemIds: string[]) => Promise<void>;
  moveSnippetItems: (
    itemIds: string[],
    newParentId: string | null,
  ) => Promise<void>;
  moveSnippetItem: (
    itemId: string,
    newParentId: string | null,
    type: 'folder' | 'file',
  ) => Promise<void>;
  renameSnippetItem: (
    itemId: string,
    newName: string,
    type: 'folder' | 'file',
  ) => Promise<void>;
  setSnippetsSearch: (isOpen: boolean, query?: string) => void;
  setSnippetsSortOrder: (order: 'alpha' | 'date') => void;
  setSnippetsOnlyFavorites: (onlyFavorites: boolean) => void;
  setSnippetsBatchMode: (isBatchMode: boolean) => void;
  setSnippetsBatchSelection: (selectedIds: string[]) => void;
  toggleSnippetsBatchSelection: (id: string) => void;
  openSnippetReaderDrawer: (folderId: string | null, snippetId: string) => void;
  closeSnippetReaderDrawer: () => void;
}

export type SetState = (
  partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
) => void;
export type GetState = () => AppState;
