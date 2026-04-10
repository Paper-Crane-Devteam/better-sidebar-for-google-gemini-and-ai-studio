import {
  folderRepo,
  conversationRepo,
  messageRepo,
} from '@/shared/db/operations';
import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataUpdated } from '../notify';
import { resolveSyncFolderId } from './resolve-sync-folder';
import { triggerAutoSync, triggerPageLoadSync } from './gdrive-sync';

export async function handleConversations(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_CONVERSATIONS': {
      const { folderId } = message.payload || {};
      const conversations =
        folderId === undefined
          ? await conversationRepo.getAll(message.platform)
          : await conversationRepo.getByFolderId(folderId);
      return { success: true, data: conversations };
    }
    case 'SAVE_CONVERSATION': {
      const { messages, ...convoData } = message.payload;
      const platform = convoData.platform ?? message.platform ?? 'aistudio';
      await conversationRepo.save({ ...convoData, platform });
      if (messages?.length) {
        await messageRepo.deleteByConversationId(convoData.id);
        await messageRepo.bulkInsert(convoData.id, messages);
      }
      return { success: true };
    }
    case 'DELETE_CONVERSATION': {
      await conversationRepo.delete(message.payload.id);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_ITEMS': {
      const { conversationIds, folderIds } = message.payload;
      if (conversationIds?.length)
        await conversationRepo.deleteMultiple(conversationIds);
      if (folderIds?.length) await folderRepo.deleteMultiple(folderIds);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'UPDATE_CONVERSATION': {
      const { id, title, updated_at } = message.payload;
      const updates: { title?: string; last_active_at: number } = {
        last_active_at: updated_at ?? Math.floor(Date.now() / 1000),
      };
      if (title) updates.title = title;
      await conversationRepo.update(id, updates);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'CREATE_CONVERSATION': {
      const {
        id,
        title,
        created_at,
        prompt_metadata,
        external_id,
        external_url: providedExternalUrl,
        folderId: providedFolderId,
        type,
        platform: payloadPlatform,
        gem_id,
      } = message.payload;

      const platform = payloadPlatform ?? message.platform ?? 'aistudio';
      let folderId = providedFolderId;
      if (!folderId) {
        folderId = await resolveSyncFolderId(platform);
      }
      const external_url =
        providedExternalUrl ??
        (platform === 'gemini'
          ? `https://gemini.google.com/app/${id}`
          : platform === 'chatgpt'
            ? `https://chatgpt.com/c/${id}`
            : `https://aistudio.google.com/prompts/${id}`);
      await conversationRepo.save({
        id,
        title,
        folder_id: folderId,
        external_id,
        external_url,
        last_active_at: Math.floor(Date.now() / 1000),
        created_at,
        prompt_metadata: prompt_metadata
          ? JSON.stringify(prompt_metadata)
          : null,
        type: type || 'conversation',
        platform,
        gem_id: gem_id || null,
      });
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_CONVERSATION': {
      await conversationRepo.move(message.payload.id, message.payload.folderId);
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_CONVERSATIONS': {
      await conversationRepo.moveMultiple(
        message.payload.ids,
        message.payload.folderId,
      );
      triggerAutoSync();
      return { success: true };
    }
    case 'SYNC_CONVERSATIONS': {
      const { items } = message.payload;
      const platform = message.platform ?? 'aistudio';
      const deletedIds = await conversationRepo.getDeletedIds(platform);
      const deletedSet = new Set(deletedIds);

      const itemsToSync = items.filter((item) => !deletedSet.has(item.id));

      if (itemsToSync.length > 0) {
        const allExisting = await conversationRepo.getAll(platform);
        const existingMap = new Map(allExisting.map((c) => [c.id, c]));

        const defaultFolderId = await resolveSyncFolderId(platform);

        const conversationsToSave = itemsToSync.map((item) => {
          const existing = existingMap.get(item.id);
          const targetFolderId = existing
            ? existing.folder_id
            : defaultFolderId;
          return {
            ...item,
            folder_id: targetFolderId,
            platform,
          };
        });
        await conversationRepo.bulkSave(conversationsToSave);
        await notifyDataUpdated();
      }
      triggerAutoSync();
      triggerPageLoadSync();
      return { success: true, data: { added: itemsToSync.length } };
    }
    default:
      return null;
  }
}
