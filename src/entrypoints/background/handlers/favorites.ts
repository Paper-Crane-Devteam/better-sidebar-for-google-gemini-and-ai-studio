import { favoriteRepo } from '@/shared/db/operations';
import type { ExtensionMessage, ExtensionResponse } from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataChanged } from '../notify';
import { triggerAutoSync } from './gdrive-sync';

export async function handleFavorites(
  message: ExtensionMessage,
  _sender: MessageSender
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'ADD_FAVORITE': {
      const { targetId, targetType, note } = message.payload;
      await favoriteRepo.add(targetId, targetType, note);
      await notifyDataChanged('favorites');
      triggerAutoSync();
      return { success: true };
    }
    case 'REMOVE_FAVORITE': {
      const { targetId, targetType } = message.payload;
      await favoriteRepo.remove(targetId, targetType);
      await notifyDataChanged('favorites');
      triggerAutoSync();
      return { success: true };
    }
    case 'GET_FAVORITES': {
      const favorites = await favoriteRepo.getAll();
      return { success: true, data: favorites };
    }
    default:
      return null;
  }
}
