import { notebookRepo } from '@/shared/db/operations';
import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataUpdated } from '../notify';

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
      await notifyDataUpdated();
      return { success: true };
    }
    case 'SAVE_NOTEBOOKS': {
      const platform = message.platform ?? 'gemini';
      const notebooks = message.payload.notebooks.map((n) => ({
        ...n,
        platform: n.platform ?? platform,
      }));
      await notebookRepo.bulkSave(notebooks);
      await notifyDataUpdated();
      return { success: true };
    }
    case 'DELETE_NOTEBOOK': {
      await notebookRepo.delete(message.payload.id);
      await notifyDataUpdated();
      return { success: true };
    }
    case 'HIDE_NOTEBOOK': {
      await notebookRepo.softDelete(message.payload.id);
      await notifyDataUpdated();
      return { success: true };
    }
    case 'UPDATE_NOTEBOOK': {
      await notebookRepo.update(message.payload.id, message.payload.updates);
      await notifyDataUpdated();
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
