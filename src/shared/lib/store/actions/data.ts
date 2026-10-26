import type { AppState, SetState, GetState } from '../types';
import { useToastStore } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { navigateToNewChat } from '@/shared/lib/navigation';
import {
  CONVERSATION_DELETE_SCOPES,
  DATA_SCOPES,
  DATA_SCOPE_REQUEST,
  type DataScope,
} from '@/shared/types/data-scope';

/** Check if the current page is viewing one of the given conversation IDs, and navigate away if so. */
function redirectIfViewing(ids: string[]) {
  try {
    const path = window.location.pathname;
    const platform = detectPlatform();
    let currentId: string | null = null;

    if (platform === Platform.GEMINI) {
      const m = path.match(/\/(?:app|gem\/[^/]+)\/([a-zA-Z0-9_-]+)/);
      currentId = m?.[1] || null;
    } else if (platform === Platform.AI_STUDIO) {
      const m = path.match(/\/prompts\/([a-zA-Z0-9_-]+)/);
      currentId = m?.[1] || null;
    }

    if (currentId && ids.includes(currentId)) {
      navigateToNewChat();
    }
  } catch {
    // non-critical
  }
}

/**
 * Fetch the given datasets.
 *
 * A rejected request resolves to a failure response instead of tearing down the
 * whole batch, so one broken table cannot blank the entire sidebar.
 */
async function requestData(
  scopes: DataScope[],
): Promise<{ success: boolean; data?: any }[]> {
  return Promise.all(
    scopes.map((scope) => {
      const type = DATA_SCOPE_REQUEST[scope];
      return browser.runtime.sendMessage({ type }).catch((error: unknown) => {
        console.error(`[Store] ${type} failed:`, error);
        return { success: false };
      });
    }),
  );
}

/** Dataset refreshed after `togglePin`, keyed by its DB table. */
const PIN_TABLE_SCOPE: Record<Parameters<AppState['togglePin']>[1], DataScope> = {
  folders: 'folders',
  prompt_folders: 'promptFolders',
  gems: 'gems',
  notebooks: 'notebooks',
  snippet_folders: 'snippetFolders',
  collection_folders: 'collectionFolders',
};

/** Shallow row comparison; nested values (rare) fall back to JSON. */
function sameRow(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      if (JSON.stringify(x) !== JSON.stringify(y)) return false;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Whether a fresh dataset is identical to the one in the store.
 *
 * Keeping the old array when nothing changed is what stops a refresh from
 * re-rendering every subscriber (and rebuilding the whole tree) for nothing.
 */
function sameRows(prev: unknown, next: unknown): boolean {
  if (prev === next) return true;
  if (!Array.isArray(prev) || !Array.isArray(next)) return false;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (!sameRow(prev[i], next[i])) return false;
  }
  return true;
}

/**
 * Window in which refresh requests are merged into one batch.
 *
 * A local write typically asks twice within a few milliseconds: the action calls
 * `fetchData` once the background replies, and the background's `DATA_UPDATED`
 * broadcast for the same write lands at about the same moment.
 */
const COALESCE_MS = 50;

let queuedScopes: Set<DataScope> | null = null;
let queuedRun: Promise<void> | null = null;
let currentRun: Promise<void> = Promise.resolve();

/**
 * Queue a refresh of `scopes`, merged with any other request in the same window.
 * Requests that arrive while a batch is in flight form the next batch, so they
 * still see data written after the in-flight batch was read.
 */
function enqueueRefresh(
  scopes: readonly DataScope[],
  run: (scopes: DataScope[]) => Promise<void>,
): Promise<void> {
  queuedScopes ??= new Set();
  for (const scope of scopes) queuedScopes.add(scope);

  if (!queuedRun) {
    queuedRun = (async () => {
      await new Promise((resolve) => setTimeout(resolve, COALESCE_MS));
      await currentRun;
      const batch = DATA_SCOPES.filter((s) => queuedScopes?.has(s));
      queuedScopes = null;
      queuedRun = null;
      currentRun = run(batch).catch((error) => {
        console.error('Failed to fetch data:', error);
      });
      await currentRun;
    })();
  }
  return queuedRun;
}

export function createDataActions(
  set: SetState,
  get: GetState,
): Pick<
  AppState,
  | 'setFolders'
  | 'setConversations'
  | 'setPromptFolders'
  | 'setPrompts'
  | 'fetchData'
  | 'moveItems'
  | 'moveItem'
  | 'renameItem'
  | 'updateConversationDescription'
  | 'createFolder'
  | 'deleteItem'
  | 'deleteItems'
  | 'toggleFavorite'
  | 'updateFolderColor'
  | 'togglePin'
  | 'reorderFolders'
  | 'reorderConversations'
> {
  return {
    setFolders: (folders) => set({ folders }),
    setConversations: (conversations) => set({ conversations }),
    setPromptFolders: (promptFolders) => set({ promptFolders }),
    setPrompts: (prompts) => set({ prompts }),

    fetchData: async (silent = false, scopes) => {
      if (!silent) set({ isLoading: true });
      try {
        await enqueueRefresh(scopes?.length ? scopes : DATA_SCOPES, async (batch) => {
          let responses = await requestData(batch);

          // This batch is often what wakes the service worker up, and its
          // database may still be opening — or need reopening, if the storage
          // handle was revoked while the machine slept. That shows up as every
          // response failing at once, which would otherwise leave the sidebar
          // silently empty until the user reloads the page. One retry is enough:
          // by then the background has rebuilt the connection.
          if (responses.every((r) => !r?.success)) {
            console.warn('[Store] All data requests failed, retrying once...');
            await new Promise((resolve) => setTimeout(resolve, 800));
            responses = await requestData(batch);
          }

          // One `set` for the whole batch (it used to be one per table, i.e. up
          // to eleven renders per refresh), and only for tables whose rows
          // actually changed.
          const state = get();
          const patch: Partial<AppState> = {};
          batch.forEach((scope, i) => {
            const response = responses[i];
            if (!response?.success) return;
            if (sameRows(state[scope], response.data)) return;
            (patch as Record<DataScope, unknown>)[scope] = response.data;
          });
          if (Object.keys(patch).length > 0) set(patch);
        });
      } finally {
        if (!silent) set({ isLoading: false });
      }
    },

    moveItems: async (itemIds, newParentId) => {
      try {
        await browser.runtime.sendMessage({
          type: 'MOVE_CONVERSATIONS',
          payload: { ids: itemIds, folderId: newParentId },
        });
        // 'folders' too: moving to the Inbox can create it.
        await get().fetchData(true, ['conversations', 'folders']);
      } catch (error) {
        console.error('Failed to move items:', error);
      }
    },

    moveItem: async (itemId, newParentId, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'UPDATE_FOLDER',
            payload: { id: itemId, updates: { parent_id: newParentId } },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'MOVE_CONVERSATION',
            payload: { id: itemId, folderId: newParentId },
          });
        }
        await get().fetchData(true, ['conversations', 'folders']);
      } catch (error) {
        console.error('Failed to move item:', error);
      }
    },

    renameItem: async (itemId, newName, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'UPDATE_FOLDER',
            payload: { id: itemId, updates: { name: newName } },
          });
        } else {
          const convo = get().conversations.find((c) => c.id === itemId);
          if (convo) {
            await browser.runtime.sendMessage({
              type: 'SAVE_CONVERSATION',
              payload: { ...convo, title: newName },
            });

            // Call platform API to rename the conversation on the server side
            try {
              const platform = convo.platform || 'aistudio';
              if (platform === 'gemini') {
                window.dispatchEvent(
                  new CustomEvent('GEMINI_API_EXECUTE', {
                    detail: {
                      rpcid: 'MUAZcd',
                      payload: [
                        null,
                        [['title']],
                        [`c_${itemId}`, newName],
                      ],
                      callbackEvent: `GEMINI_RENAME_RESULT_${itemId}`,
                    },
                  }),
                );
              } else if (platform === 'aistudio') {
                window.dispatchEvent(
                  new CustomEvent('AISTUDIO_RENAME', {
                    detail: {
                      promptId: itemId,
                      newName,
                      callbackEvent: `AISTUDIO_RENAME_RESULT_${itemId}`,
                    },
                  }),
                );
              }
            } catch (apiError) {
              console.warn('Failed to rename on API (local rename still applied):', apiError);
            }
          }
        }
        await get().fetchData(true, type === 'folder' ? ['folders'] : ['conversations']);
      } catch (error) {
        console.error('Failed to rename item:', error);
      }
    },

    updateConversationDescription: async (itemId: string, description: string) => {
      try {
        await browser.runtime.sendMessage({
          type: 'UPDATE_CONVERSATION',
          payload: { id: itemId, description },
        });
        await get().fetchData(true, ['conversations']);
      } catch (error) {
        console.error('Failed to update conversation description:', error);
      }
    },

    createFolder: async (name, parentId) => {
      try {
        const newId = crypto.randomUUID();
        await browser.runtime.sendMessage({
          type: 'CREATE_FOLDER',
          payload: { id: newId, name, parentId: parentId || null },
        });
        await get().fetchData(true, ['folders']);
        return newId;
      } catch (error) {
        console.error('Failed to create folder:', error);
        return null;
      }
    },

    deleteItem: async (itemId, type) => {
      try {
        if (type === 'folder') {
          await browser.runtime.sendMessage({
            type: 'DELETE_FOLDER',
            payload: { id: itemId },
          });
        } else {
          const convo = get().conversations.find((c) => c.id === itemId);
          const platform = convo?.platform || 'aistudio';

          // Call platform API to delete the conversation on the server
          try {
            if (platform === 'gemini') {
              window.dispatchEvent(
                new CustomEvent('GEMINI_API_EXECUTE', {
                  detail: {
                    rpcid: 'GzXR5e',
                    payload: [`c_${itemId}`],
                    callbackEvent: `GEMINI_DELETE_RESULT_${itemId}`,
                  },
                }),
              );
            } else if (platform === 'aistudio') {
              window.dispatchEvent(
                new CustomEvent('AISTUDIO_API_EXECUTE', {
                  detail: {
                    method: 'DeletePrompt',
                    body: [`prompts/${itemId}`],
                    callbackEvent: `AISTUDIO_DELETE_RESULT_${itemId}`,
                  },
                }),
              );
            }
          } catch (apiError) {
            console.warn('Failed to delete on API:', apiError);
          }

          await browser.runtime.sendMessage({
            type: 'DELETE_CONVERSATION',
            payload: { id: itemId },
          });

          redirectIfViewing([itemId]);
        }
        await get().fetchData(
          true,
          type === 'folder'
            ? ['folders', ...CONVERSATION_DELETE_SCOPES]
            : CONVERSATION_DELETE_SCOPES,
        );
      } catch (error) {
        console.error('Failed to delete item:', error);
      }
    },

    deleteItems: async (itemIds) => {
      try {
        const state = get();
        const folderIds = itemIds.filter((id) =>
          state.folders.some((f) => f.id === id),
        );
        const conversationIds = itemIds.filter((id) =>
          state.conversations.some((c) => c.id === id),
        );
        if (folderIds.length === 0 && conversationIds.length === 0) return;

        // Chain API delete calls for conversations
        if (conversationIds.length > 0) {
          const total = conversationIds.length;
          let succeeded = 0;
          let failed = 0;
          let cancelled = false;
          const succeededIds: string[] = [];

          const { addToast, removeToast, updateToast } = useToastStore.getState();
          const pId = addToast(
            i18n.t('batch.deletingProgress', { current: 1, total }),
            'info',
            Infinity,
            { label: i18n.t('batch.cancelDelete'), onClick: () => { cancelled = true; } },
          );

          for (let i = 0; i < conversationIds.length; i++) {
            // Check if user cancelled
            if (cancelled) break;

            const cid = conversationIds[i];
            const convo = state.conversations.find((c) => c.id === cid);
            const platform = convo?.platform || 'aistudio';

            // Update progress toast
            updateToast(pId, {
              message: i18n.t('batch.deletingProgress', { current: i + 1, total }),
            });

            try {
              await new Promise<void>((resolve) => {
                const callbackEvent = `DELETE_RESULT_${cid}_${Date.now()}`;
                const TIMEOUT = 10_000;

                const handler = () => {
                  clearTimeout(timer);
                  window.removeEventListener(callbackEvent, handler);
                  succeeded++;
                  succeededIds.push(cid);
                  resolve();
                };

                const timer = setTimeout(() => {
                  window.removeEventListener(callbackEvent, handler);
                  failed++;
                  resolve();
                }, TIMEOUT);

                window.addEventListener(callbackEvent, handler, { once: true });

                if (platform === 'gemini') {
                  window.dispatchEvent(
                    new CustomEvent('GEMINI_API_EXECUTE', {
                      detail: {
                        rpcid: 'GzXR5e',
                        payload: [`c_${cid}`],
                        callbackEvent,
                      },
                    }),
                  );
                } else if (platform === 'aistudio') {
                  window.dispatchEvent(
                    new CustomEvent('AISTUDIO_API_EXECUTE', {
                      detail: {
                        method: 'DeletePrompt',
                        body: [`prompts/${cid}`],
                        callbackEvent,
                      },
                    }),
                  );
                } else {
                  // Unknown platform, skip API call
                  clearTimeout(timer);
                  window.removeEventListener(callbackEvent, handler);
                  succeeded++;
                  succeededIds.push(cid);
                  resolve();
                }
              });
            } catch {
              failed++;
            }
          }

          removeToast(pId);
          if (cancelled) {
            addToast(i18n.t('batch.deleteCancelled', { succeeded, total }), 'info');
          } else if (failed === 0) {
            addToast(i18n.t('batch.deleteSuccess', { count: succeeded }), 'success');
          } else {
            addToast(i18n.t('batch.deletePartial', { succeeded, total, failed }), 'warning');
          }

          // Only clean up items that were actually deleted
          const deletedConversationIds = cancelled ? succeededIds : conversationIds;

          if (deletedConversationIds.length > 0 || folderIds.length > 0) {
            await browser.runtime.sendMessage({
              type: 'DELETE_ITEMS',
              payload: { conversationIds: deletedConversationIds, folderIds },
            });
            redirectIfViewing(deletedConversationIds);
          }
        } else {
          // Only folders to delete, no conversations
          await browser.runtime.sendMessage({
            type: 'DELETE_ITEMS',
            payload: { conversationIds, folderIds },
          });
          redirectIfViewing(conversationIds);
        }

        await get().fetchData(true, ['folders', ...CONVERSATION_DELETE_SCOPES]);
      } catch (error) {
        console.error('Failed to delete items:', error);
      }
    },

    toggleFavorite: async (targetId, targetType, isFavorite) => {
      try {
        if (isFavorite) {
          await browser.runtime.sendMessage({
            type: 'REMOVE_FAVORITE',
            payload: { targetId, targetType },
          });
        } else {
          await browser.runtime.sendMessage({
            type: 'ADD_FAVORITE',
            payload: { targetId, targetType },
          });
        }
        await get().fetchData(true, ['favorites']);
      } catch (error) {
        console.error('Failed to toggle favorite:', error);
      }
    },

    updateFolderColor: async (folderId, color) => {
      try {
        await browser.runtime.sendMessage({
          type: 'UPDATE_FOLDER',
          payload: { id: folderId, updates: { color } },
        });
        await get().fetchData(true, ['folders']);
      } catch (error) {
        console.error('Failed to update folder color:', error);
      }
    },

    togglePin: async (id, table, currentlyPinned) => {
      try {
        const newValue = currentlyPinned ? 0 : 1;
        const messageTypeMap: Record<string, string> = {
          folders: 'UPDATE_FOLDER',
          prompt_folders: 'UPDATE_PROMPT_FOLDER',
          gems: 'UPDATE_GEM',
          notebooks: 'UPDATE_NOTEBOOK',
          snippet_folders: 'UPDATE_SNIPPET_FOLDER',
          collection_folders: 'UPDATE_COLLECTION_FOLDER',
        };
        await browser.runtime.sendMessage({
          type: messageTypeMap[table],
          payload: { id, updates: { is_pinned: newValue } },
        } as any);
        await get().fetchData(true, [PIN_TABLE_SCOPE[table]]);
      } catch (error) {
        console.error('Failed to toggle pin:', error);
      }
    },

    reorderFolders: async (parentId, orderedIds) => {
      try {
        await browser.runtime.sendMessage({
          type: 'REORDER_FOLDERS',
          payload: { parentId, orderedIds },
        });
        await get().fetchData(true, ['folders']);
      } catch (error) {
        console.error('Failed to reorder folders:', error);
      }
    },

    reorderConversations: async (folderId, orderedIds) => {
      if (orderedIds.length === 0) return;
      // Apply locally first so the row lands where it was dropped instead of
      // snapping back for a round trip; fetchData below replaces it with the DB.
      const rank = new Map(orderedIds.map((id, i) => [id, i + 1]));
      set((state) => ({
        conversations: state.conversations.map((c) =>
          rank.has(c.id) ? { ...c, order_index: rank.get(c.id) } : c,
        ),
      }));
      try {
        await browser.runtime.sendMessage({
          type: 'REORDER_CONVERSATIONS',
          payload: { folderId, orderedIds },
        });
        await get().fetchData(true, ['conversations']);
      } catch (error) {
        console.error('Failed to reorder conversations:', error);
        await get().fetchData(true, ['conversations']);
      }
    },
  };
}
