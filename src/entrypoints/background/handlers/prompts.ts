import { promptRepo, promptFolderRepo } from '@/shared/db/operations';
import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataChanged } from '../notify';
import { triggerAutoSync } from './gdrive-sync';
import i18n from '@/locale/i18n';
import { PROMPT_INBOX_ID } from '@/shared/constants/inbox';

/** Find or create the prompt inbox folder */
async function resolvePromptInbox(): Promise<string> {
  const existing = await promptFolderRepo.getById(PROMPT_INBOX_ID);
  if (existing) return PROMPT_INBOX_ID;

  // Check by name fallback
  const all = await promptFolderRepo.getAll();
  const inboxName = i18n.t('prompts.inbox');
  const byName = all.find(
    (f) => f.name === inboxName || f.name === 'Inbox' || f.name === '收件箱',
  );
  if (byName) return byName.id;

  // Create with deterministic ID
  await promptFolderRepo.create({ id: PROMPT_INBOX_ID, name: inboxName });
  return PROMPT_INBOX_ID;
}

export async function handlePrompts(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_PROMPT_FOLDERS': {
      const folders = await promptFolderRepo.getAll();
      return { success: true, data: folders };
    }
    case 'CREATE_PROMPT_FOLDER': {
      await promptFolderRepo.create(message.payload);
      triggerAutoSync();
      return { success: true };
    }
    case 'UPDATE_PROMPT_FOLDER': {
      await promptFolderRepo.update(
        message.payload.id,
        message.payload.updates,
      );
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_PROMPT_FOLDER': {
      await promptFolderRepo.delete(message.payload.id);
      triggerAutoSync();
      return { success: true };
    }
    case 'GET_PROMPTS': {
      const { folderId } = message.payload || {};
      const prompts =
        folderId === undefined
          ? await promptRepo.getAll()
          : await promptRepo.getByFolderId(folderId);
      return { success: true, data: prompts };
    }
    case 'CREATE_PROMPT': {
      const { id, title, content, type, icon, folderId, orderIndex } =
        message.payload;
      await promptRepo.create({
        id,
        title,
        content,
        type,
        icon,
        folder_id: folderId,
        order_index: orderIndex,
      });
      await notifyDataChanged('prompts', 'promptFolders');
      triggerAutoSync();
      return { success: true };
    }
    case 'UPDATE_PROMPT': {
      await promptRepo.update(message.payload.id, message.payload.updates);
      await notifyDataChanged('prompts', 'promptFolders');
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_PROMPT': {
      await promptRepo.delete(message.payload.id);
      await notifyDataChanged('prompts', 'promptFolders');
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_PROMPT_ITEMS': {
      const { promptIds, folderIds } = message.payload;
      if (promptIds?.length) await promptRepo.deleteMultiple(promptIds);
      if (folderIds?.length) await promptFolderRepo.deleteMultiple(folderIds);
      await notifyDataChanged('prompts', 'promptFolders');
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_PROMPT': {
      await promptRepo.move(message.payload.id, message.payload.folderId);
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_PROMPTS': {
      await promptRepo.moveMultiple(
        message.payload.ids,
        message.payload.folderId,
      );
      triggerAutoSync();
      return { success: true };
    }
    case 'RESOLVE_PROMPT_INBOX': {
      const inboxId = await resolvePromptInbox();
      return { success: true, data: inboxId };
    }
    default:
      return null;
  }
}
