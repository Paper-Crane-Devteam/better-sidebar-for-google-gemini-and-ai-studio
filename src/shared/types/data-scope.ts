/**
 * The datasets the sidebar keeps in `useAppStore`, one per background GET_* request.
 *
 * Used to refresh only what a write touched instead of re-fetching all eleven
 * tables: the background tags its `DATA_UPDATED` broadcast with the scopes it
 * changed, and local store actions pass theirs to `fetchData`. No scopes means
 * "anything may have changed" and refreshes everything — the safe default for
 * restores, imports, Drive sync, profile switches and raw SQL.
 */
export const DATA_SCOPES = [
  'folders',
  'conversations',
  'favorites',
  'tags',
  'conversationTags',
  'promptFolders',
  'prompts',
  'gems',
  'notebooks',
  'snippetFolders',
  'snippets',
] as const;

export type DataScope = (typeof DATA_SCOPES)[number];

/** Background message that returns each dataset. */
export const DATA_SCOPE_REQUEST: Record<DataScope, string> = {
  folders: 'GET_FOLDERS',
  conversations: 'GET_CONVERSATIONS',
  favorites: 'GET_FAVORITES',
  tags: 'GET_TAGS',
  conversationTags: 'GET_ALL_CONVERSATION_TAGS',
  promptFolders: 'GET_PROMPT_FOLDERS',
  prompts: 'GET_PROMPTS',
  gems: 'GET_GEMS',
  notebooks: 'GET_NOTEBOOKS',
  snippetFolders: 'GET_SNIPPET_FOLDERS',
  snippets: 'GET_SNIPPETS',
};

/**
 * Removing a conversation can also drop its favorite and tag links, so every
 * delete refreshes those alongside it.
 */
export const CONVERSATION_DELETE_SCOPES: DataScope[] = [
  'conversations',
  'favorites',
  'conversationTags',
];
