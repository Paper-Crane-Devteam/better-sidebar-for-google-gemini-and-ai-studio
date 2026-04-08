import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Trash2, FolderInput, Tag as TagIcon, CheckSquare, X } from 'lucide-react';
import { useAppStore } from '@/shared/lib/store';
import { modal } from '@/shared/lib/modal';
import { MoveItemsDialog } from './MoveItemsDialog';
import { AddTagsDialog } from './AddTagsDialog';
import { useI18n } from '@/shared/hooks/useI18n';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';

interface BatchToolbarProps {
  onSelectAll: () => void;
}

export const BatchToolbar = ({ onSelectAll }: BatchToolbarProps) => {
  const { t } = useI18n();
  const { ui, setExplorerBatchMode, setExplorerBatchSelection, deleteItems } = useAppStore();
  const { selectedIds } = ui.explorer.batch;

  const handleDelete = async () => {
    const state = useAppStore.getState();
    const validIds = selectedIds.filter(id => 
      state.conversations.some(c => c.id === id) || 
      state.folders.some(f => f.id === id)
    );
    if (validIds.length === 0) return;

    const confirmed = await modal.confirm({
      title: t('batch.deleteConfirmTitle', { count: validIds.length }),
      content: t('batch.deleteConfirmMessage'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      await deleteItems(validIds);
      setExplorerBatchSelection([]);
      setExplorerBatchMode(false);
    }
  };

  const handleMove = async () => {
    if (selectedIds.length === 0) return;

    let targetFolderId: string | null = null;

    const confirmed = await modal.confirm({
      title: t('batch.moveTitle'),
      content: (
        <MoveItemsDialog
          selectedIds={selectedIds}
          onSelect={(id) => (targetFolderId = id)}
        />
      ),
      modalClassName: 'max-w-xl',
      confirmText: t('common.move'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      const state = useAppStore.getState();
      const filesToMove = selectedIds.filter(id => state.conversations.some(c => c.id === id));
      await useAppStore.getState().moveItems(filesToMove, targetFolderId);
      setExplorerBatchSelection([]);
      setExplorerBatchMode(false);
    }
  };

  const handleTag = async () => {
    if (selectedIds.length === 0) return;

    let selectedTagIds: string[] = [];

    const confirmed = await modal.confirm({
      title: t('batch.addTags'),
      content: (
        <AddTagsDialog onSelectionChange={(ids) => (selectedTagIds = ids)} />
      ),
      modalClassName: 'max-w-xl',
      confirmText: t('common.save'),
      cancelText: t('common.cancel'),
    });

    if (confirmed && selectedTagIds.length > 0) {
      const state = useAppStore.getState();
      const filesToTag = selectedIds.filter(id => state.conversations.some(c => c.id === id));

      const promises: Promise<void>[] = [];
      for (const fileId of filesToTag) {
        for (const tagId of selectedTagIds) {
          const alreadyHasTag = state.conversationTags.some(ct => ct.conversation_id === fileId && ct.tag_id === tagId);
          if (!alreadyHasTag) {
            promises.push(state.addTagToConversation(fileId, tagId));
          }
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
      setExplorerBatchSelection([]);
    }
  };

  return (
    <div className="px-3 py-1.5 flex items-center justify-between border-t bg-muted/30">
      <span className="text-xs text-muted-foreground">
        {selectedIds.length > 0
          ? t('batch.selectedCount', { count: selectedIds.length })
          : t('batch.selectItems')}
      </span>
      <div className="flex items-center gap-1">
        <SimpleTooltip content={t('batch.selectAll')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSelectAll}>
            <CheckSquare className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <div className="w-[1px] h-4 bg-border mx-0.5" />

        <SimpleTooltip content={t('batch.deleteSelected')}>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={selectedIds.length === 0} onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <SimpleTooltip content={t('batch.moveSelected')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedIds.length === 0} onClick={handleMove}>
            <FolderInput className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <SimpleTooltip content={t('batch.addTag')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedIds.length === 0} onClick={handleTag}>
            <TagIcon className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <div className="w-[1px] h-4 bg-border mx-0.5" />

        <SimpleTooltip content={t('batch.exitBatchMode')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExplorerBatchMode(false)}>
            <X className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
      </div>
    </div>
  );
};
