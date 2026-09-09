import { snippetRepo, snippetFolderRepo } from '@/shared/db/operations';
import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataUpdated } from '../notify';
import { triggerAutoSync } from './gdrive-sync';
import i18n from '@/locale/i18n';
import { SNIPPET_INBOX_ID } from '@/shared/constants/inbox';

/** Find or create the snippet inbox folder */
async function resolveSnippetInbox(): Promise<string> {
  const existing = await snippetFolderRepo.getById(SNIPPET_INBOX_ID);
  if (existing) return SNIPPET_INBOX_ID;

  // Check by name fallback
  const all = await snippetFolderRepo.getAll();
  const inboxName = i18n.t('snippets.inbox');
  const byName = all.find(
    (f) => f.name === inboxName || f.name === 'Inbox' || f.name === '收件箱',
  );
  if (byName) return byName.id;

  // Create with deterministic ID
  await snippetFolderRepo.create({ id: SNIPPET_INBOX_ID, name: inboxName });
  return SNIPPET_INBOX_ID;
}

export async function handleSnippets(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_SNIPPET_FOLDERS': {
      const folders = await snippetFolderRepo.getAll();
      return { success: true, data: folders };
    }
    case 'CREATE_SNIPPET_FOLDER': {
      await snippetFolderRepo.create(message.payload);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'UPDATE_SNIPPET_FOLDER': {
      await snippetFolderRepo.update(
        message.payload.id,
        message.payload.updates,
      );
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_SNIPPET_FOLDER': {
      await snippetFolderRepo.delete(message.payload.id);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'GET_SNIPPETS': {
      const { folderId } = message.payload || {};
      const snippets =
        folderId === undefined
          ? await snippetRepo.getAll()
          : await snippetRepo.getByFolderId(folderId);
      return { success: true, data: snippets };
    }
    case 'CREATE_SNIPPET': {
      const { id, title, content, sourceUrl, sourcePlatform, folderId, orderIndex } =
        message.payload;
      console.log('[handleSnippets] CREATE_SNIPPET:', { id, title, sourcePlatform, folderId });
      await snippetRepo.create({
        id,
        title,
        content,
        source_url: sourceUrl,
        source_platform: sourcePlatform,
        folder_id: folderId,
        order_index: orderIndex,
      });
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'UPDATE_SNIPPET': {
      await snippetRepo.update(message.payload.id, message.payload.updates);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_SNIPPET': {
      await snippetRepo.delete(message.payload.id);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_SNIPPET_ITEMS': {
      const { snippetIds, folderIds } = message.payload;
      if (snippetIds?.length) await snippetRepo.deleteMultiple(snippetIds);
      if (folderIds?.length) await snippetFolderRepo.deleteMultiple(folderIds);
      await notifyDataUpdated();
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_SNIPPET': {
      await snippetRepo.move(message.payload.id, message.payload.folderId);
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_SNIPPETS': {
      await snippetRepo.moveMultiple(
        message.payload.ids,
        message.payload.folderId,
      );
      triggerAutoSync();
      return { success: true };
    }
    case 'RESOLVE_SNIPPET_INBOX': {
      const inboxId = await resolveSnippetInbox();
      return { success: true, data: inboxId };
    }
    default:
      return null;
  }
}
