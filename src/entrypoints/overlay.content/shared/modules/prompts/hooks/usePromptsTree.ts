import { useAppStore } from '@/shared/lib/store';
import { useFolderTree } from '../../../components/folder-tree';
import { useDeleteHandler } from './useDeleteHandler';

export const STORAGE_KEY = 'AI_STUDIO_EXPANDED_PROMPT_FOLDERS';

export const usePromptsTree = () => {
  const {
    promptFolders,
    prompts,
    movePromptItem,
    renamePromptItem,
    favorites,
    toggleFavorite,
    createPromptFolder,
    ui,
  } = useAppStore();
  const { handleDelete } = useDeleteHandler();
  const { query: searchTerm } = ui.prompts.search;

  const tree = useFolderTree({
    storageKey: STORAGE_KEY,
    folders: promptFolders,
    searchTerm,
    onMoveItem: async (id, parentId, type) => {
      await movePromptItem(id, parentId, type);
    },
    onRenameItem: async (id, name, type) => {
      await renamePromptItem(id, name, type);
    },
    onDeleteItems: async (ids) => {
      await handleDelete(ids);
    },
    onCreateFolder: async (name, parentId) => {
      return createPromptFolder(name, parentId);
    },
  });

  return {
    ...tree,
    folders: promptFolders,
    conversations: prompts,
    favorites,
    searchTerm,
    ui,
    toggleFavorite,
    createFolder: createPromptFolder,
  };
};
