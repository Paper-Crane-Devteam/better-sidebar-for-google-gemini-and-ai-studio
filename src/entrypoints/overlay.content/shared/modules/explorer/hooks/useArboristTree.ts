import { useAppStore } from '@/shared/lib/store';
import { useFolderTree } from '../../../components/folder-tree';
import { useDeleteHandler } from './useDeleteHandler';

export const STORAGE_KEY = 'AI_STUDIO_EXPANDED_FOLDERS';

export const useArboristTree = () => {
  const {
    folders,
    conversations,
    moveItem,
    renameItem,
    favorites,
    toggleFavorite,
    createFolder,
    ui,
  } = useAppStore();
  const { handleDelete } = useDeleteHandler();
  const { query: searchTerm } = ui.explorer.search;

  const tree = useFolderTree({
    storageKey: STORAGE_KEY,
    folders,
    searchTerm,
    onMoveItem: async (id, parentId, type) => {
      await moveItem(id, parentId, type);
    },
    onRenameItem: async (id, name, type) => {
      await renameItem(id, name, type);
    },
    onDeleteItems: async (ids) => {
      await handleDelete(ids);
    },
    onCreateFolder: async (name, parentId) => {
      return createFolder(name, parentId);
    },
  });

  return {
    ...tree,
    folders,
    conversations,
    favorites,
    searchTerm,
    ui,
    toggleFavorite,
    createFolder,
  };
};
