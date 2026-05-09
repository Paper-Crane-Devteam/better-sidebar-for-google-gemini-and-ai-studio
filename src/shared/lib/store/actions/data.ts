import type { AppState, SetState, GetState } from '../types';
import { useToastStore } from '@/shared/lib/toast';
import i18n from '@/locale/i18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { navigateToNewChat } from '@/shared/lib/navigation';

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
  | 'createFolder'
  | 'deleteItem'
  | 'deleteItems'
  | 'toggleFavorite'
  | 'updateFolderColor'
> {
  return {
    setFolders: (folders) => set({ folders }),
    setConversations: (conversations) => set({ conversations }),
    setPromptFolders: (promptFolders) => set({ promptFolders }),
    setPrompts: (prompts) => set({ prompts }),

    fetchData: async (silent = false) => {
      if (!silent) set({ isLoading: true });
      try {
        const [
          foldersResponse,
          conversationsResponse,
          favoritesResponse,
          tagsResponse,
          conversationTagsResponse,
          promptFoldersResponse,
          promptsResponse,
          gemsResponse,
          notebooksResponse,
        ] = await Promise.all([
          browser.runtime.sendMessage({ type: 'GET_FOLDERS' }),
          browser.runtime.sendMessage({ type: 'GET_CONVERSATIONS' }),
          browser.runtime.sendMessage({ type: 'GET_FAVORITES' }),
          browser.runtime.sendMessage({ type: 'GET_TAGS' }),
          browser.runtime.sendMessage({ type: 'GET_ALL_CONVERSATION_TAGS' }),
          browser.runtime.sendMessage({ type: 'GET_PROMPT_FOLDERS' }),
          browser.runtime.sendMessage({ type: 'GET_PROMPTS' }),
          browser.runtime.sendMessage({ type: 'GET_GEMS' }),
          browser.runtime.sendMessage({ type: 'GET_NOTEBOOKS' }),
        ]);
        if (foldersResponse.success) set({ folders: foldersResponse.data });
        if (conversationsResponse.success)
          set({ conversations: conversationsResponse.data });
        if (favoritesResponse.success)
          set({ favorites: favoritesResponse.data });
        if (tagsResponse.success) set({ tags: tagsResponse.data });
        if (conversationTagsResponse.success)
          set({ conversationTags: conversationTagsResponse.data });
        if (promptFoldersResponse.success)
          set({ promptFolders: promptFoldersResponse.data });
        if (promptsResponse.success) set({ prompts: promptsResponse.data });
        if (gemsResponse.success) set({ gems: gemsResponse.data });
        if (notebooksResponse.success)
          set({ notebooks: notebooksResponse.data });
      } catch (error) {
        console.error('Failed to fetch data:', error);
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
        await get().fetchData(true);
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
        await get().fetchData(true);
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
        await get().fetchData(true);
      } catch (error) {
        console.error('Failed to rename item:', error);
      }
    },

    createFolder: async (name, parentId) => {
      try {
        const newId = crypto.randomUUID();
        await browser.runtime.sendMessage({
          type: 'CREATE_FOLDER',
          payload: { id: newId, name, parentId: parentId || null },
        });
        await get().fetchData(true);
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
        await get().fetchData(true);
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

          const { addToast, removeToast } = useToastStore.getState();
          addToast(i18n.t('batch.deletingProgress', { current: 1, total }), 'info', Infinity);
          const toasts = useToastStore.getState().toasts;
          const pId = toasts[toasts.length - 1]?.id || '';

          for (let i = 0; i < conversationIds.length; i++) {
            const cid = conversationIds[i];
            const convo = state.conversations.find((c) => c.id === cid);
            const platform = convo?.platform || 'aistudio';

            // Update progress toast
            useToastStore.setState((s) => ({
              toasts: s.toasts.map((t) =>
                t.id === pId
                  ? { ...t, message: i18n.t('batch.deletingProgress', { current: i + 1, total }) }
                  : t,
              ),
            }));

            try {
              await new Promise<void>((resolve) => {
                const callbackEvent = `DELETE_RESULT_${cid}_${Date.now()}`;
                const TIMEOUT = 10_000;

                const handler = () => {
                  clearTimeout(timer);
                  window.removeEventListener(callbackEvent, handler);
                  succeeded++;
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
                  resolve();
                }
              });
            } catch {
              failed++;
            }
          }

          removeToast(pId);
          if (failed === 0) {
            addToast(i18n.t('batch.deleteSuccess', { count: succeeded }), 'success');
          } else {
            addToast(i18n.t('batch.deletePartial', { succeeded, total, failed }), 'warning');
          }
        }

        // Clean up local DB
        await browser.runtime.sendMessage({
          type: 'DELETE_ITEMS',
          payload: { conversationIds, folderIds },
        });

        redirectIfViewing(conversationIds);
        await get().fetchData(true);
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
        await get().fetchData(true);
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
        await get().fetchData(true);
      } catch (error) {
        console.error('Failed to update folder color:', error);
      }
    },
  };
}
