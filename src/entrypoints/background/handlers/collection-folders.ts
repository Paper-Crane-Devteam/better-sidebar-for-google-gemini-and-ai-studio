import { collectionFolderRepo } from '@/shared/db/operations';
import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { notifyDataChanged } from '../notify';
import { triggerAutoSync } from './gdrive-sync';

/** Folders of the Gems / Notebooks panels, and moving/ordering items in them. */
export async function handleCollectionFolders(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GET_COLLECTION_FOLDERS': {
      const folders = await collectionFolderRepo.getAll();
      return { success: true, data: folders };
    }
    case 'CREATE_COLLECTION_FOLDER': {
      await collectionFolderRepo.create(message.payload);
      await notifyDataChanged('collectionFolders');
      triggerAutoSync();
      return { success: true };
    }
    case 'UPDATE_COLLECTION_FOLDER': {
      await collectionFolderRepo.update(message.payload.id, message.payload.updates);
      await notifyDataChanged('collectionFolders');
      triggerAutoSync();
      return { success: true };
    }
    case 'DELETE_COLLECTION_FOLDER': {
      const deleted = await collectionFolderRepo.deleteIfEmpty(message.payload.id);
      if (deleted) {
        await notifyDataChanged('collectionFolders');
        triggerAutoSync();
      }
      return { success: true, data: { deleted } };
    }
    case 'REORDER_COLLECTION_FOLDERS': {
      await collectionFolderRepo.reorder(message.payload.orderedIds);
      await notifyDataChanged('collectionFolders');
      triggerAutoSync();
      return { success: true };
    }
    case 'MOVE_COLLECTION_ITEM': {
      const { scope, id, folderId } = message.payload;
      await collectionFolderRepo.moveItem(scope, id, folderId);
      await notifyDataChanged(scope);
      triggerAutoSync();
      return { success: true };
    }
    case 'REORDER_COLLECTION_ITEMS': {
      const { scope, orderedIds } = message.payload;
      await collectionFolderRepo.reorderItems(scope, orderedIds);
      await notifyDataChanged(scope);
      triggerAutoSync();
      return { success: true };
    }
    default:
      return null;
  }
}
