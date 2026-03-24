import { gemRepo } from '@/shared/db/operations';
import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataUpdated } from '../notify';

export async function handleGems(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_GEMS': {
      const gems = await gemRepo.getAll(message.platform);
      return { success: true, data: gems };
    }
    case 'SAVE_GEM': {
      const platform = message.payload.platform ?? message.platform ?? 'gemini';
      await gemRepo.save({ ...message.payload, platform });
      await notifyDataUpdated();
      return { success: true };
    }
    case 'SAVE_GEMS': {
      const platform = message.platform ?? 'gemini';
      const gems = message.payload.gems.map((g) => ({
        ...g,
        platform: g.platform ?? platform,
      }));
      await gemRepo.bulkSave(gems);
      await notifyDataUpdated();
      return { success: true };
    }
    case 'DELETE_GEM': {
      await gemRepo.delete(message.payload.id);
      await notifyDataUpdated();
      return { success: true };
    }
    case 'UPDATE_GEM': {
      await gemRepo.update(message.payload.id, message.payload.updates);
      await notifyDataUpdated();
      return { success: true };
    }
    case 'GET_GEM_CONVERSATIONS': {
      const conversations = await gemRepo.getConversationsByGemId(
        message.payload.gemId,
      );
      return { success: true, data: conversations };
    }
    default:
      return null;
  }
}
