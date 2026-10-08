import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Trash2, FolderInput, CheckSquare, X } from 'lucide-react';
import { useAppStore } from '@/shared/lib/store';
import { modal } from '@/shared/lib/modal';
import { MoveItemsDialog } from './MoveItemsDialog';
import { useI18n } from '@/shared/hooks/useI18n';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useShallow } from 'zustand/react/shallow';

interface BatchToolbarProps {
  onSelectAll?: () => void;
}

export const BatchToolbar = ({ onSelectAll }: BatchToolbarProps) => {
  const { t } = useI18n();
  const {
    ui,
    setPromptsBatchMode,
    setPromptsBatchSelection,
    deletePromptItems,
    movePromptItems,
  } = useAppStore(
    useShallow((s) => ({
      ui: s.ui,
      setPromptsBatchMode: s.setPromptsBatchMode,
      setPromptsBatchSelection: s.setPromptsBatchSelection,
      deletePromptItems: s.deletePromptItems,
      movePromptItems: s.movePromptItems,
    })),
  );
  const { selectedIds } = ui.prompts.batch;

  const handleDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = await modal.confirmDelete({
      title: t('batch.deleteConfirmTitle', { count: selectedIds.length }),
      content: t('batch.deleteConfirmMessage'),
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
    <div className="px-3 py-2 flex items-center justify-between bg-muted/40">
      <span className="text-xs text-muted-foreground">
        {selectedIds.length > 0
          ? t('batch.selectedCount', { count: selectedIds.length })
          : t('batch.selectItems')}
      </span>
      <div className="flex items-center gap-1">
        {onSelectAll && (
          <SimpleTooltip content={t('batch.selectAll')}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSelectAll}>
              <CheckSquare className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        )}

        {onSelectAll && <div className="w-[1px] h-4 bg-border mx-0.5" />}

        <SimpleTooltip content={t('batch.deleteSelected')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedIds.length === 0} onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <SimpleTooltip content={t('batch.moveSelected')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedIds.length === 0} onClick={handleMove}>
            <FolderInput className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <div className="w-[1px] h-4 bg-border mx-0.5" />

        <SimpleTooltip content={t('batch.exitBatchMode')}>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPromptsBatchMode(false)}>
            <X className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
      </div>
    </div>
  );
};
