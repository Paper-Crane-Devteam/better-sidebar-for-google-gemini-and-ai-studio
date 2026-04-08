import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';

export const useDeleteHandler = () => {
  const { t } = useI18n();
  const { folders, deleteItem, conversations } = useAppStore();

  /** Recursively collect all conversation IDs inside a folder */
  const getConversationsInFolder = (folderId: string): string[] => {
    const ids: string[] = [];
    for (const c of conversations) {
      if (c.folder_id === folderId) ids.push(c.id);
    }
    for (const f of folders) {
      if (f.parent_id === folderId) {
        ids.push(...getConversationsInFolder(f.id));
      }
    }
    return ids;
  };

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;

    const id = ids[0];
    const isFolder = folders.some((f) => f.id === id);

    // If folder, check if it contains conversations
    if (isFolder) {
      const convosInside = getConversationsInFolder(id);
      if (convosInside.length > 0) {
        toast.warning(t('node.folderNotEmpty', { count: convosInside.length }));
        return;
      }
    }

    const name = isFolder
      ? folders.find((f) => f.id === id)?.name
      : conversations.find((c) => c.id === id)?.title || t('common.untitled');

    const confirmMessage = isFolder
      ? t('node.deleteFolderConfirm', { name })
      : t('node.deleteConfirm', { name });

    const confirmed = await modal.confirm({
      title: t('node.deleteItem'),
      content: (
        <div className="space-y-2">
          <p>{confirmMessage}</p>
          {!isFolder && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              {t('node.deleteNote')}
            </p>
          )}
        </div>
      ),
      confirmText: t('node.delete'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      for (const itemId of ids) {
        const type = folders.some((f) => f.id === itemId) ? 'folder' : 'file';
        await deleteItem(itemId, type);
      }
    }
  };

  return { handleDelete };
};
