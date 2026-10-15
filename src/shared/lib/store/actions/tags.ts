import type { AppState, GetState } from '../types';
import type { Tag } from '../../../types/db';

export function createTagActions(get: GetState): Pick<
  AppState,
  'createTag' | 'updateTag' | 'deleteTag' | 'addTagToConversation' | 'removeTagFromConversation'
> {
  return {
    createTag: async (name, color) => {
      try {
        await browser.runtime.sendMessage({
          type: 'CREATE_TAG',
          payload: { name, color },
        });
        await get().fetchData(true, ['tags', 'conversationTags']);
      } catch (error) {
        console.error('Failed to create tag:', error);
      }
    },
    updateTag: async (id, updates) => {
      try {
        await browser.runtime.sendMessage({
          type: 'UPDATE_TAG',
          payload: { id, updates },
        });
        await get().fetchData(true, ['tags', 'conversationTags']);
      } catch (error) {
        console.error('Failed to update tag:', error);
      }
    },
    deleteTag: async (id) => {
      try {
        await browser.runtime.sendMessage({
          type: 'DELETE_TAG',
          payload: { id },
        });
        await get().fetchData(true, ['tags', 'conversationTags']);
      } catch (error) {
        console.error('Failed to delete tag:', error);
      }
    },
    addTagToConversation: async (conversationId, tagId) => {
      try {
        await browser.runtime.sendMessage({
          type: 'ADD_TAG_TO_CONVERSATION',
          payload: { conversationId, tagId },
        });
        await get().fetchData(true, ['conversationTags']);
      } catch (error) {
        console.error('Failed to add tag to conversation:', error);
      }
    },
    removeTagFromConversation: async (conversationId, tagId) => {
      try {
        await browser.runtime.sendMessage({
          type: 'REMOVE_TAG_FROM_CONVERSATION',
          payload: { conversationId, tagId },
        });
        await get().fetchData(true, ['conversationTags']);
      } catch (error) {
        console.error('Failed to remove tag from conversation:', error);
      }
    },
  };
}
