import { Folder, Tag, Prompt, PromptFolder } from './db';

export type ExtensionMessage = (
  | { type: 'BROWSER_AGENT'; payload: import('../browser-agent/contracts').BrowserRequest }
  | { type: 'WEB_AGENT'; payload: import('../web-agent/contracts').WebAgentRequest }
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
        /**
         * 1 when this is a temporary chat, which is hidden from every list and from
         * search. Only meaningful on the save that creates the row — the flag is
         * sticky in the database, so later saves for the same conversation can leave
         * it out (and do, since they have no way of knowing it).
         */
        is_temporary?: number;
        /**
         * Source conversation when this row is a branch (fork) of another chat.
         *
         * Two effects, and both apply only on first save: the new row inherits the
         * parent's folder and gem/notebook membership, and the tree is told to
         * refresh. The refresh is not redundant — a branch is the one case where a
         * conversation appears without the user navigating anywhere.
         */
        branched_from_conversation_id?: string;
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
      /** Manual (custom-sort) order of the conversations inside one folder. */
      type: 'REORDER_CONVERSATIONS';
      payload: { folderId: string | null; orderedIds: string[] };
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
        | { op: 'sessionBindWorkspace'; sessionId: string; workspaceId: string }
        | { op: 'boundWorkspace'; conversationId: string }
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
  /**
   * Open a fresh chat in a new tab next to the sender, optionally with text waiting in
   * its composer. The text is parked in the background under the new tab's id and handed
   * over by `CLAIM_COMPOSER_PREFILL` once that tab's content script is up — see
   * `overlay.content/shared/lib/composer-prefill.ts`.
   */
  | { type: 'OPEN_NEW_CHAT_TAB'; payload: { url: string; prompt?: string } }
  /** Sent by every page load: "is there text waiting for my composer?" Consumes it. */
  | { type: 'CLAIM_COMPOSER_PREFILL' }
  /** Ask the store for a newer version now — see `background/handlers/extension-update.ts`. */
  | { type: 'CHECK_EXTENSION_UPDATE' }
  /** Version already downloaded and waiting for a reload, or null. Never hits the store. */
  | { type: 'GET_PENDING_EXTENSION_UPDATE' }
  /** Reload into the downloaded update. Waits briefly if the download is still running. */
  | { type: 'APPLY_EXTENSION_UPDATE' }
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
          useRegex?: boolean;
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
      /** Every conversation and how many messages we hold, for the status dialog. */
      type: 'GET_MESSAGE_SYNC_STATUS';
      payload: { platform: string };
    }
  | {
      /**
       * Conversations whose transcript is missing or incomplete, for the silent
       * backfill scheduler. `excludeIds` carries the caller's cooldown record so
       * the exclusion happens in SQL rather than after the LIMIT.
       */
      type: 'GET_BACKFILL_CANDIDATES';
      payload: {
        platform: string;
        limit?: number;
        staleSlackSec?: number;
        excludeIds?: string[];
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
  /**
   * Agent workspace filesystem, from the content script.
   *
   * Routed through the background because OPFS is origin-scoped: a content script's
   * `navigator.storage` belongs to gemini.google.com, so calling it there would put
   * the workspace in Google's quota and give each platform a separate one. The
   * background runs at the extension origin, which is the only place the workspace
   * can live and be shared across platforms.
   */
  | {
      type: 'WORKSPACE_FS';
      /**
       * Which workspace to operate in.
       *
       * Sent per call rather than remembered by the background: the selection lives in
       * a content-script store, and a background copy could lag behind a switch —
       * landing the next tool call in the workspace the user just left.
       */
      workspaceId: string;
      payload:
        | { op: 'read'; path: string; offset?: number; limit?: number }
        | { op: 'write'; path: string; content: string }
        /**
         * Raw bytes, base64-encoded, for upload and download.
         *
         * Separate ops rather than a flag on `read`/`write` because the encoding is
         * not an option the caller picks — it follows from who is asking. The agent
         * reads text and gets a string; a download needs the exact bytes and cannot
         * survive a UTF-8 round trip. Base64 is what `runtime.sendMessage` will carry
         * intact (see `workspace/base64.ts`).
         */
        | { op: 'readBytes'; path: string }
        | { op: 'writeBytes'; path: string; base64: string }
        | {
            op: 'edit';
            path: string;
            oldString: string;
            newString: string;
            replaceAll?: boolean;
          }
        | { op: 'list'; path?: string; recursive?: boolean }
        | { op: 'glob'; pattern: string; base?: string }
        | {
            op: 'grep';
            pattern: string;
            path?: string;
            include?: string;
            caseSensitive?: boolean;
          }
        | { op: 'delete'; path: string; recursive?: boolean }
        | { op: 'mkdir'; path: string }
        | { op: 'move'; from: string; to: string }
        | { op: 'stat'; path: string }
        | { op: 'stats' }
        | { op: 'clear' };
    }
  /**
   * Office / PDF / subtitle document operations, from the content script.
   *
   * Routed to the background for the same origin reason as `WORKSPACE_FS`, and then on
   * to a worker in the offscreen document — which is where the parsing actually happens.
   *
   * ⚠️ Note what is *not* in this payload: bytes. The engine opens the file out of OPFS
   * itself, so a 20 MB workbook never gets base64-encoded onto the message channel. Only
   * the request and the projection text travel. See `.kiro/docs/document-formats.md` §4.
   */
  | {
      type: 'DOCUMENT_OP';
      workspaceId: string;
      payload: import('@/shared/documents/types').DocRequest;
    }
) & { platform?: string };

export interface ExtensionResponse {
  success: boolean;
  data?: any;
  error?: string;
}
