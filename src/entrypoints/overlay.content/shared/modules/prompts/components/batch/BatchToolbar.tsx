import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Trash2, FolderInput, X } from 'lucide-react';
import { useAppStore } from '@/shared/lib/store';
import { modal } from '@/shared/lib/modal';
import { MoveItemsDialog } from './MoveItemsDialog';
import { useI18n } from '@/shared/hooks/useI18n';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';

export const BatchToolbar = () => {
  const { t } = useI18n();
  const { ui, setPromptsBatchMode, setPromptsBatchSelection, deletePromptItems, movePromptItems } = useAppStore();
  const { selectedIds } = ui.prompts.batch;

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = await modal.confirm({
      title: t('batch.deleteConfirmTitle', { count: selectedIds.length }),
      content: t('batch.deleteConfirmMessage'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
        await deletePromptItems(selectedIds);
        setPromptsBatchSelection([]);
        setPromptsBatchMode(false);
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
        const filesToMove = selectedIds.filter(id => state.prompts.some(c => c.id === id));
        
        await movePromptItems(filesToMove, targetFolderId);

        setPromptsBatchSelection([]);
        setPromptsBatchMode(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <SimpleTooltip content={t('batch.deleteSelected')}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </SimpleTooltip>

      <SimpleTooltip content={t('batch.moveSelected')}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleMove}>
          <FolderInput className="h-4 w-4" />
        </Button>
      </SimpleTooltip>

      <div className="w-[1px] h-4 bg-border mx-1" />

      <SimpleTooltip content={t('batch.exitBatchMode')}>
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setPromptsBatchMode(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </SimpleTooltip>
    </div>
  );
};
