import { notebookRepo } from '@/shared/db/operations';
import { runCommand } from '@/shared/db';
import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataChanged } from '../notify';
import { CONVERSATION_DELETE_SCOPES } from '@/shared/types/data-scope';
import { triggerAutoSync } from './gdrive-sync';

export async function handleNotebooks(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_NOTEBOOKS': {
      const notebooks = await notebookRepo.getAll(message.platform);
      return { success: true, data: notebooks };
    }
    case 'SAVE_NOTEBOOK': {
      const platform = message.payload.platform ?? message.platform ?? 'gemini';
      await notebookRepo.save({ ...message.payload, platform });
      await notifyDataChanged('notebooks');
      return { success: true };
    }
    case 'SAVE_NOTEBOOKS': {
      const platform = message.platform ?? 'gemini';
      const notebooks = message.payload.notebooks.map((n) => ({
        ...n,
        platform: n.platform ?? platform,
      }));
      await notebookRepo.bulkSave(notebooks);
      await notifyDataChanged('notebooks');
      return { success: true };
    }
    case 'DELETE_NOTEBOOK': {
      // Soft-delete all conversations under this notebook first
      await runCommand(
        'UPDATE conversations SET deleted_at = unixepoch() WHERE notebook_id = ? AND deleted_at IS NULL',
        [message.payload.id],
      );
      await notebookRepo.delete(message.payload.id);
      await notifyDataChanged('notebooks', ...CONVERSATION_DELETE_SCOPES);
      return { success: true };
    }
    case 'UPDATE_NOTEBOOK': {
      await notebookRepo.update(message.payload.id, message.payload.updates);
      await notifyDataChanged('notebooks');
      // Pin / default folder are user settings, unlike the scan writes above.
      triggerAutoSync();
      return { success: true };
    }
    case 'GET_NOTEBOOK_CONVERSATIONS': {
      const conversations = await notebookRepo.getConversationsByNotebookId(
        message.payload.notebookId,
      );
      return { success: true, data: conversations };
    }
    default:
      return null;
  }
}
