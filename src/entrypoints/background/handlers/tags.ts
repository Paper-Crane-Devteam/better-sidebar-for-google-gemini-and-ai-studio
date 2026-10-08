import { tagRepo, conversationTagRepo } from '@/shared/db/operations';
import type { ExtensionMessage, ExtensionResponse } from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataChanged } from '../notify';
import { triggerAutoSync } from './gdrive-sync';

export async function handleTags(
  message: ExtensionMessage,
  _sender: MessageSender
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_TAGS': {
      const tags = await tagRepo.getAll();
      return { success: true, data: tags };
    }
    case 'CREATE_TAG': {
      const { name, color } = message.payload;
      const id = await tagRepo.create(name, color);
      await notifyDataChanged('tags', 'conversationTags');
      triggerAutoSync();
      return { success: true, data: { id } };
    }
    case 'UPDATE_TAG': {
      const { id, updates } = message.payload;
      await tagRepo.update(id, updates);
      await notifyDataChanged('tags', 'conversationTags');
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_TAG': {
      await tagRepo.delete(message.payload.id);
      await notifyDataChanged('tags', 'conversationTags');
      triggerAutoSync();
      return { success: true };
    }
    case 'ADD_TAG_TO_CONVERSATION': {
      const { conversationId, tagId } = message.payload;
      await conversationTagRepo.addTag(conversationId, tagId);
      await notifyDataChanged('conversationTags');
      triggerAutoSync();
      return { success: true };
    }
    case 'REMOVE_TAG_FROM_CONVERSATION': {
      const { conversationId, tagId } = message.payload;
      await conversationTagRepo.removeTag(conversationId, tagId);
      await notifyDataChanged('conversationTags');
      triggerAutoSync();
      return { success: true };
    }
    case 'GET_CONVERSATION_TAGS': {
      const { conversationId, tagId } = message.payload || {};
      if (conversationId) {
        const tags = await conversationTagRepo.getTagsByConversationId(conversationId);
        return { success: true, data: tags };
      }
      if (tagId) {
        const conversations = await conversationTagRepo.getConversationsByTagId(tagId);
        return { success: true, data: conversations };
      }
      return { success: false, error: 'Missing parameters' };
    }
    case 'GET_ALL_CONVERSATION_TAGS': {
      const pairs = await conversationTagRepo.getAll();
      return { success: true, data: pairs };
    }
    default:
      return null;
  }
}
