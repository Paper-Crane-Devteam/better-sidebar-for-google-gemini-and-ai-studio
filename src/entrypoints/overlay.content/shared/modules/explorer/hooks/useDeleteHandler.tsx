import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';

export const useDeleteHandler = () => {
  const { t } = useI18n();
  const { folders, deleteItem, conversations } = useAppStore();

  const handleDelete = async (ids: string[]) => {
    if (!ids.length) return;

    // Simplify: Assume single item or treat as single for message
    const id = ids[0];
    const isFolder = folders.some((f) => f.id === id);

    const name = isFolder
      ? folders.find((f) => f.id === id)?.name
      : conversations.find((c) => c.id === id)?.title || t('common.untitled');

    const confirmMessage = isFolder
      ? t('node.deleteFolderConfirm', { name })
      : t('node.deleteConfirm', { name });

    const noteMessage = isFolder
      ? t('node.deleteFolderNote')
      : t('node.deleteNote');

    const confirmed = await modal.confirm({
      title: t('node.deleteItem'),
      content: (
        <div className="space-y-2">
          <p>{confirmMessage}</p>
          <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
            {noteMessage}
          </p>
        </div>
      ),
      confirmText: t('node.delete'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      // Loop just in case multiple IDs were somehow passed, but logic is simplified
      for (const itemId of ids) {
        const type = folders.some((f) => f.id === itemId) ? 'folder' : 'file';
        await deleteItem(itemId, type);
      }
    }
  };

  return { handleDelete };
};
