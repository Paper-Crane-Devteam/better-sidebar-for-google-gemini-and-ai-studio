import type { AppState, SetState, GetState } from '../types';

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
        ] = await Promise.all([
          browser.runtime.sendMessage({ type: 'GET_FOLDERS' }),
          browser.runtime.sendMessage({ type: 'GET_CONVERSATIONS' }),
          browser.runtime.sendMessage({ type: 'GET_FAVORITES' }),
          browser.runtime.sendMessage({ type: 'GET_TAGS' }),
          browser.runtime.sendMessage({ type: 'GET_ALL_CONVERSATION_TAGS' }),
          browser.runtime.sendMessage({ type: 'GET_PROMPT_FOLDERS' }),
          browser.runtime.sendMessage({ type: 'GET_PROMPTS' }),
          browser.runtime.sendMessage({ type: 'GET_GEMS' }),
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
          await browser.runtime.sendMessage({
            type: 'DELETE_CONVERSATION',
            payload: { id: itemId },
          });
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
        await browser.runtime.sendMessage({
          type: 'DELETE_ITEMS',
          payload: { conversationIds, folderIds },
        });
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
