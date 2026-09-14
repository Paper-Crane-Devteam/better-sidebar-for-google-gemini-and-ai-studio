import { Folder, Tag, Prompt, PromptFolder } from './db';

export type ExtensionMessage = (
  | { type: 'BROWSER_AGENT'; payload: import('../browser-agent/contracts').BrowserRequest }
  | { type: 'GET_FOLDERS' }
  | {
      type: 'CREATE_FOLDER';
      payload: { id: string; name: string; parentId?: string | null };
    }
  | {
      type: 'UPDATE_FOLDER';
      payload: {
        id: string;
        updates: Partial<
          Pick<Folder, 'name' | 'parent_id' | 'order_index' | 'color' | 'is_pinned'>
        >;
      };
    }
  | { type: 'DELETE_FOLDER'; payload: { id: string } }
  | {
      type: 'REORDER_FOLDERS';
      payload: { parentId: string | null; orderedIds: string[] };
    }
  | { type: 'GET_CONVERSATIONS'; payload?: { folderId?: string | null } }
  | {
      type: 'SAVE_CONVERSATION';
      payload: {
        id: string;
        title: string;
        folder_id?: string | null;
        external_id?: string;
        external_url?: string;
        model_name?: string;
        updated_at: number;
        platform?: string;
        created_at?: number;
        prompt_metadata?: any;
        type?: string;
        gem_id?: string | null;
        notebook_id?: string | null;
        /** When set, delete all messages after this ID before inserting the new ones (regeneration) */
        replaceAfterMessageId?: string;
        messages: {
          id?: string;
          role: 'user' | 'model';
          content: string;
          message_type: 'text' | 'thought';
          created_at?: number | null;
        }[];
      };
    }
  | { type: 'DELETE_CONVERSATION'; payload: { id: string } }
  | {
      type: 'DELETE_ITEMS';
      payload: { conversationIds?: string[]; folderIds?: string[] };
    }
  | {
      type: 'MOVE_CONVERSATION';
      payload: { id: string; folderId: string | null };
    }
  | {
      type: 'MOVE_CONVERSATIONS';
      payload: { ids: string[]; folderId: string | null };
    }
  | {
      type: 'UPDATE_CONVERSATION';
      payload: { id: string; title?: string; description?: string; updated_at?: number };
    }
  | {
      type: 'CREATE_CONVERSATION';
      payload: {
        id: string;
        title: string;
        prompt_metadata?: any;
        created_at: number;
        external_id: string;
        external_url?: string;
        folderId?: string | null;
        type?: string;
        platform?: string;
        gem_id?: string | null;
        notebook_id?: string | null;
      };
    }
  | { type: 'SCAN_LIBRARY' }
  | { type: 'START_LIBRARY_SCAN' }
  | { type: 'START_GEM_SCAN' }
  | { type: 'START_NOTEBOOK_SCAN' }
  | { type: 'START_SYNC_CONVERSATIONS' }
  | { type: 'SYNC_CONVERSATIONS'; payload: { items: any[] } }
  | { type: 'GET_PAGE_LOCAL_STORAGE'; payload: { key: string } }
  | {
      type: 'SAVE_SCANNED_ITEMS';
      payload: {
        items: {
          id: string;
          title: string;
          external_id: string;
          external_url: string;
          model_name?: string;
          updated_at: number;
          platform?: string;
          created_at?: number;
          prompt_metadata?: any;
          type?: string;
          folder_id?: string | null;
          gem_id?: string | null;
          notebook_id?: string | null;
        }[];
      };
    }
  | { type: 'EXECUTE_SQL'; payload: { sql: string } }
  /**
   * Agent tool call ledger, from the content script.
   *
   * Routed through the background rather than called directly, because `@/shared/db`
   * does not work in a content script: `DB_REQUEST` reaches the offscreen document but
   * the `DB_RESPONSE` never comes back to a content script, so every call sat until its
   * 30-second timeout. The background is also where `ensureDbForTab` runs, so this is
   * additionally the only path that writes to the right profile in a multi-account setup.
   */
  | {
      type: 'AGENT_LEDGER';
      payload:
        | { op: 'sessionCreate'; session: { id: string; conversationId: string | null; title: string | null; skillId?: string | null } }
        | { op: 'sessionClaim'; sessionId: string; conversationId: string }
        | { op: 'sessionEnd'; sessionId: string; endReason: string; rounds: number }
        | {
            op: 'callBegin';
            call: {
              id: string;
              sessionId: string | null;
              conversationId: string | null;
              joinKey: string;
              round: number;
              orderIndex: number;
              toolName: string;
              description?: string;
              params?: Record<string, string>;
              isWrite: boolean;
            };
          }
        | { op: 'callSettle'; id: string; status: 'running' | 'ok' | 'failed' | 'rejected'; resultBody: string | null }
        | { op: 'roundDelivered'; sessionId: string; round: number }
        | { op: 'sessionDiscardUndelivered'; sessionId: string }
        | { op: 'markDelivered'; ids: string[] }
        | { op: 'listByConversation'; conversationId: string }
        | { op: 'clearUndelivered'; conversationId: string };
    }
  | { type: 'RESET_DATABASE' }
  | { type: 'OPEN_URL'; payload: { url: string } }
  | {
      type: 'ADD_FAVORITE';
      payload: {
        targetId: string;
        targetType: 'conversation' | 'message' | 'prompt';
        note?: string;
      };
    }
  | {
      type: 'REMOVE_FAVORITE';
      payload: {
        targetId: string;
        targetType: 'conversation' | 'message' | 'prompt';
      };
    }
  | { type: 'GET_FAVORITES' }
  | { type: 'GET_TAGS' }
  | {
      type: 'CREATE_TAG';
      payload: { name: string; color?: string };
    }
  | {
      type: 'UPDATE_TAG';
      payload: { id: string; updates: Partial<Pick<Tag, 'name' | 'color'>> };
    }
  | {
      type: 'DELETE_TAG';
      payload: { id: string };
    }
  | {
      type: 'ADD_TAG_TO_CONVERSATION';
      payload: { conversationId: string; tagId: string };
    }
  | {
      type: 'REMOVE_TAG_FROM_CONVERSATION';
      payload: { conversationId: string; tagId: string };
    }
  | {
      type: 'GET_CONVERSATION_TAGS';
      payload?: { conversationId?: string; tagId?: string };
    }
  | { type: 'GET_ALL_CONVERSATION_TAGS' }
  | {
      type: 'EXPORT_CHUNK';
      payload: {
        transferId: string;
        chunk: string;
        index: number;
        total: number;
      };
    }
  | { type: 'EXPORT_DATABASE' }
  | { type: 'VACUUM_DATABASE' }
  | {
      type: 'IMPORT_DATABASE';
      payload: {
        data: string;
        chunk?: { index: number; total: number };
      };
    }
  | {
      type: 'SEARCH_MESSAGES';
      payload: {
        query: string;
        options: {
          caseSensitive?: boolean;
          wholeWord?: boolean;
          includeFolderNames?: string[];
          excludeFolderNames?: string[];
          roleFilter?: 'all' | 'user' | 'model';
          platforms?: string[];
          conversationId?: string;
        };
      };
    }
  | {
      type: 'GET_MESSAGES_BY_CONVERSATION_ID';
      payload: { conversationId: string };
    }
  | {
      type: 'DELETE_MESSAGES_BY_CONVERSATION_ID';
      payload: { conversationId: string };
    }
  | {
      /** Delete a specific set of messages inside one conversation. */
      type: 'DELETE_MESSAGES_BY_IDS';
      payload: { conversationId: string; ids: string[] };
    }
  | {
      type: 'BULK_INSERT_MESSAGES';
      payload: {
        conversationId: string;
        messages: {
          id?: string;
          role: 'user' | 'model';
          content: string;
          message_type: 'text' | 'thought';
          created_at?: number | null;
        }[];
      };
    }
  | {
      type: 'REPLACE_MESSAGES';
      payload: {
        conversationId: string;
        messages: {
          role: 'user' | 'model';
          content: string;
          message_type: 'text' | 'thought';
        }[];
      };
    }
  | {
      type: 'UPSERT_MESSAGES';
      payload: {
        conversationId: string;
        title?: string;
        /** When set, delete all messages after this ID before inserting the new ones (regeneration) */
        replaceAfterMessageId?: string;
        messages: {
          id: string;
          role: 'user' | 'model';
          content: string;
          message_type: 'text' | 'thought';
          created_at?: number | null;
        }[];
      };
    }
  | {
      type: 'GET_MESSAGE_SCROLL_INDEX';
      payload: { messageId: string; conversationId: string };
    }
  | {
      type: 'GET_ADJACENT_MESSAGE';
      payload: {
        messageId: string;
        conversationId: string;
        currentRole: 'user' | 'model';
      };
    }
  | { type: 'GET_PROMPT_FOLDERS' }
  | {
      type: 'CREATE_PROMPT_FOLDER';
      payload: { id: string; name: string; parentId?: string | null };
    }
  | {
      type: 'UPDATE_PROMPT_FOLDER';
      payload: {
        id: string;
        updates: Partial<
          Pick<PromptFolder, 'name' | 'parent_id' | 'order_index' | 'is_pinned'>
        >;
      };
    }
  | { type: 'DELETE_PROMPT_FOLDER'; payload: { id: string } }
  | { type: 'GET_PROMPTS'; payload?: { folderId?: string | null } }
  | {
      type: 'CREATE_PROMPT';
      payload: {
        id: string;
        title: string;
        content: string;
        type: 'normal' | 'system';
        icon?: string;
        folderId?: string | null;
        orderIndex?: number;
      };
    }
  | {
      type: 'UPDATE_PROMPT';
      payload: {
        id: string;
        updates: Partial<
          Pick<
            Prompt,
            'title' | 'content' | 'type' | 'icon' | 'folder_id' | 'order_index'
          >
        >;
      };
    }
  | { type: 'DELETE_PROMPT'; payload: { id: string } }
  | {
      type: 'DELETE_PROMPT_ITEMS';
      payload: { promptIds?: string[]; folderIds?: string[] };
    }
  | {
      type: 'MOVE_PROMPT';
      payload: { id: string; folderId: string | null };
    }
  | {
      type: 'MOVE_PROMPTS';
      payload: { ids: string[]; folderId: string | null };
    }
  // Profile management
  | {
      type: 'DETECT_ACCOUNT';
      payload: { platform: string; username: string };
    }
  | { type: 'GET_ACTIVE_PROFILE' }
  | { type: 'GET_ALL_PROFILES' }
  | {
      type: 'CREATE_PROFILE';
      payload: { name: string };
    }
  | {
      type: 'BIND_ACCOUNT';
      payload: { profileId: string; platform: string; username: string };
    }
  | {
      type: 'SWITCH_PROFILE';
      payload: { profileId: string };
    }
  | {
      type: 'DISABLE_PLATFORM';
      payload: { platform: string; disabled: boolean };
    }
  | { type: 'GET_PROFILE_STATUS' }
  | {
      type: 'DELETE_PROFILE';
      payload: { profileId: string };
    }
  | {
      type: 'RENAME_PROFILE';
      payload: { profileId: string; name: string };
    }
  // Gems
  | { type: 'GET_GEMS' }
  | {
      type: 'SAVE_GEM';
      payload: {
        id: string;
        name: string;
        external_id?: string;
        external_url?: string;
        icon_url?: string;
        description?: string;
        platform?: string;
      };
    }
  | {
      type: 'SAVE_GEMS';
      payload: {
        gems: {
          id: string;
          name: string;
          external_id?: string;
          external_url?: string;
          icon_url?: string;
          description?: string;
          platform?: string;
        }[];
      };
    }
  | { type: 'DELETE_GEM'; payload: { id: string } }
  | { type: 'HIDE_GEM'; payload: { id: string } }
  | {
      type: 'UPDATE_GEM';
      payload: {
        id: string;
        updates: Partial<{ name: string; description: string; icon_url: string; is_pinned: number }>;
      };
    }
  | { type: 'GET_GEM_CONVERSATIONS'; payload: { gemId: string } }
  // Notebooks
  | { type: 'GET_NOTEBOOKS' }
  | {
      type: 'SAVE_NOTEBOOK';
      payload: {
        id: string;
        name: string;
        external_id?: string;
        external_url?: string;
        icon_url?: string;
        description?: string;
        platform?: string;
      };
    }
  | {
      type: 'SAVE_NOTEBOOKS';
      payload: {
        notebooks: {
          id: string;
          name: string;
          external_id?: string;
          external_url?: string;
          icon_url?: string;
          description?: string;
          platform?: string;
        }[];
      };
    }
  | { type: 'DELETE_NOTEBOOK'; payload: { id: string } }
  | {
      type: 'UPDATE_NOTEBOOK';
      payload: {
        id: string;
        updates: Partial<{ name: string; description: string; icon_url: string; is_pinned: number }>;
      };
    }
  | { type: 'GET_NOTEBOOK_CONVERSATIONS'; payload: { notebookId: string } }
  // Google Drive sync
  | { type: 'GDRIVE_AUTH' }
  | { type: 'GDRIVE_DISCONNECT' }
  | { type: 'GDRIVE_GET_STATUS' }
  | { type: 'GDRIVE_SYNC_UP' }
  | { type: 'GDRIVE_SYNC_DOWN' }
  | { type: 'GDRIVE_CHECK_SUPPORT' }
  // Backup (save slots)
  | { type: 'BACKUP_LIST'; payload: { dbName: string } }
  | { type: 'BACKUP_CREATE'; payload: { dbName: string } }
  | { type: 'BACKUP_DELETE'; payload: { dbName: string; backupId: string } }
  | { type: 'BACKUP_RESTORE'; payload: { dbName: string; backupId: string } }
  // Snippets
  | { type: 'GET_SNIPPET_FOLDERS' }
  | {
      type: 'CREATE_SNIPPET_FOLDER';
      payload: { id: string; name: string; parentId?: string | null };
    }
  | {
      type: 'UPDATE_SNIPPET_FOLDER';
      payload: {
        id: string;
        updates: Partial<{ name: string; parent_id: string | null; order_index: number; is_pinned: number }>;
      };
    }
  | { type: 'DELETE_SNIPPET_FOLDER'; payload: { id: string } }
  | { type: 'GET_SNIPPETS'; payload?: { folderId?: string | null } }
  | {
      type: 'CREATE_SNIPPET';
      payload: {
        id: string;
        title: string;
        content?: string;
        sourceUrl?: string | null;
        sourcePlatform?: string | null;
        folderId?: string | null;
        orderIndex?: number;
      };
    }
  | {
      type: 'UPDATE_SNIPPET';
      payload: {
        id: string;
        updates: Partial<{ title: string; content: string; source_url: string; source_platform: string; folder_id: string | null; order_index: number; is_pinned: number }>;
      };
    }
  | { type: 'DELETE_SNIPPET'; payload: { id: string } }
  | {
      type: 'DELETE_SNIPPET_ITEMS';
      payload: { snippetIds?: string[]; folderIds?: string[] };
    }
  | { type: 'MOVE_SNIPPET'; payload: { id: string; folderId: string | null } }
  | {
      type: 'MOVE_SNIPPETS';
      payload: { ids: string[]; folderId: string | null };
    }
  | { type: 'RESOLVE_SNIPPET_INBOX' }
  | { type: 'RESOLVE_PROMPT_INBOX' }
  // Notion API proxy
  | {
      type: 'NOTION_API_REQUEST';
      payload: { endpoint: string; method: string; body?: any; apiKey: string };
    }
  // Permission page (open via background to avoid popup blocker)
  | {
      type: 'OPEN_PERMISSION_PAGE';
      payload: { origin: string };
    }
  | {
      type: 'CHECK_HOST_PERMISSION';
      payload: { origin: string };
    }
  | {
      type: 'REMOVE_HOST_PERMISSION';
      payload: { origin: string };
    }
) & { platform?: string };

export interface ExtensionResponse {
  success: boolean;
  data?: any;
  error?: string;
}
