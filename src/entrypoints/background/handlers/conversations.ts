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
import { notifyDataChanged } from '../notify';
import { CONVERSATION_DELETE_SCOPES } from '@/shared/types/data-scope';
import { resolveGemNotebookFolderId, resolveSyncFolderId } from './resolve-sync-folder';
import { isInboxFolder } from '@/shared/constants/inbox';
import { triggerAutoSync, triggerPageLoadSync } from './gdrive-sync';
import { withConversationLock } from './conversation-write-lock';

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
      const {
        messages,
        replaceAfterMessageId,
        branched_from_conversation_id: branchedFrom,
        ...convoData
      } = message.payload;
      const platform = convoData.platform ?? message.platform ?? 'aistudio';

      // Held across the whole write: a MOVE_CONVERSATION for this same id follows
      // one millisecond behind on a new chat, and it must not reach the row until
      // the row exists. See conversation-write-lock.ts.
      await withConversationLock(convoData.id, async () => {
        // Both placement rules below turn on whether this row already exists, so it
        // is looked up once rather than per rule.
        const existing = await conversationRepo.getById(convoData.id);

        // A branch belongs where its parent belongs. Gemini's branch endpoint reports
        // the source conversation, so the fork can inherit folder and gem/notebook
        // membership instead of landing in the inbox away from the chat it came from.
        //
        // Only for a genuinely new row: re-applying this later would drag a branch
        // back to the parent's folder after the user had filed it somewhere else.
        const isNewBranch = !!branchedFrom && !existing;
        if (isNewBranch) {
          const parent = await conversationRepo.getById(branchedFrom!);
          if (parent) {
            convoData.folder_id = convoData.folder_id ?? parent.folder_id;
            convoData.gem_id = convoData.gem_id ?? parent.gem_id;
            convoData.notebook_id = convoData.notebook_id ?? parent.notebook_id;
            convoData.type = convoData.type ?? parent.type;
          }
        }

        // Resolve folder_id when not provided — ensures conversations never land at
        // root. This covers gem/notebook chats dispatched from PromptCreateScanner
        // (folder_id=null). If the UI layer later issues a MOVE_CONVERSATION (e.g.
        // user explicitly picked a folder via pendingEntry), that will override this
        // value — the lock is what makes "later" actually mean later.
        //
        // Existing conversation: leave folder_id null so COALESCE preserves current value.
        //
        // Temporary chats are excluded: they are never listed, so filing one is at best
        // a no-op and at worst leaves it sitting in the Inbox if the flag is ever lost.
        if (!convoData.folder_id && !existing && !convoData.is_temporary) {
          // New conversation: resolve gem/notebook default folder → inbox fallback
          convoData.folder_id = await resolveGemNotebookFolderId(
            platform,
            convoData.gem_id,
            convoData.notebook_id,
          );
        }

        // No last_active_at means "no opinion" (e.g. the user just opened the chat).
        // `save` would otherwise default it to now and move the row to the top.
        if (convoData.last_active_at == null && existing) {
          convoData.last_active_at = existing.last_active_at;
        }

        await conversationRepo.save({ ...convoData, platform });
        if (messages?.length) {
          if (replaceAfterMessageId) {
            // Regeneration: delete all messages after the anchor message, then insert new ones
            await messageRepo.deleteAfterMessage(convoData.id, replaceAfterMessageId);
            await messageRepo.bulkInsert(convoData.id, messages);
          } else {
            await messageRepo.deleteByConversationId(convoData.id);
            await messageRepo.bulkInsert(convoData.id, messages);
          }
        }

        // SAVE_CONVERSATION deliberately stays quiet in general — it fires on every
        // generated turn, and refreshing the whole tree that often would thrash the
        // UI. A new branch is the opposite case: it is a one-off, and it is the only
        // way a conversation appears without the user navigating, so without this the
        // row exists but the tree keeps looking stale until a reload.
        if (isNewBranch) {
          await notifyDataChanged('conversations', 'folders');
          triggerAutoSync();
        }
      });

      return { success: true };
    }
    case 'DELETE_CONVERSATION': {
      await conversationRepo.delete(message.payload.id);
      await notifyDataChanged(...CONVERSATION_DELETE_SCOPES);
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_ITEMS': {
      const { conversationIds, folderIds } = message.payload;
      if (conversationIds?.length)
        await conversationRepo.deleteMultiple(conversationIds);
      if (folderIds?.length) await folderRepo.deleteMultiple(folderIds);
      await notifyDataChanged('folders', ...CONVERSATION_DELETE_SCOPES);
      triggerAutoSync();
      return { success: true };
    }
    case 'UPDATE_CONVERSATION': {
      const { id, title, description, updated_at } = message.payload;
      const updates: { title?: string; description?: string; last_active_at: number } = {
        last_active_at: updated_at ?? Math.floor(Date.now() / 1000),
      };
      if (title) updates.title = title;
      if (description !== undefined) updates.description = description;
      await conversationRepo.update(id, updates);
      await notifyDataChanged('conversations');
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
        folderId = await resolveGemNotebookFolderId(platform, gem_id, message.payload.notebook_id);
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
      // 'folders' too: resolving the target folder can create the Inbox.
      await notifyDataChanged('conversations', 'folders');
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_CONVERSATION': {
      // Queued behind any in-flight SAVE_CONVERSATION for the same id. On a new chat
      // filed from a folder, the SAVE that creates the row is sent a millisecond
      // earlier, and an UPDATE that arrives first matches nothing at all.
      await withConversationLock(message.payload.id, async () => {
        let targetFolderId = message.payload.folderId;
        // If moving to an inbox folder, resolve it first to handle legacy/missing folders
        if (targetFolderId && isInboxFolder(targetFolderId)) {
          targetFolderId = await resolveSyncFolderId(message.platform ?? 'aistudio');
        }
        await conversationRepo.move(message.payload.id, targetFolderId);
      });
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_CONVERSATIONS': {
      let targetFolderId = message.payload.folderId;
      if (targetFolderId && isInboxFolder(targetFolderId)) {
        targetFolderId = await resolveSyncFolderId(message.platform ?? 'aistudio');
      }
      await conversationRepo.moveMultiple(
        message.payload.ids,
        targetFolderId,
      );
      triggerAutoSync();
      return { success: true };
    }
    case 'REORDER_CONVERSATIONS': {
      await conversationRepo.reorder(message.payload.orderedIds);
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

        const conversationsToSave = await Promise.all(
          itemsToSync.map(async (item) => {
            const existing = existingMap.get(item.id);
            let targetFolderId: string | null;
            if (existing) {
              targetFolderId = existing.folder_id;
            } else {
              // For new conversations, check gem/notebook default folder, fallback to inbox
              targetFolderId = await resolveGemNotebookFolderId(
                platform,
                item.gem_id,
                item.notebook_id,
              );
            }
            return {
              ...item,
              folder_id: targetFolderId,
              platform,
            };
          }),
        );
        await conversationRepo.bulkSave(conversationsToSave);
        // The list carries the authoritative last-active time, which may have just
        // pulled a wrongly bumped last_active_at back down. AI Studio messages have
        // no time of their own and were dated from it, so bring them along.
        if (platform === 'aistudio') {
          await messageRepo.clampToConversationActivity(itemsToSync.map((i) => i.id));
        }
        await notifyDataChanged('conversations', 'folders');
      }
      triggerAutoSync();
      triggerPageLoadSync();
      return { success: true, data: { added: itemsToSync.length } };
    }
    default:
      return null;
  }
}
