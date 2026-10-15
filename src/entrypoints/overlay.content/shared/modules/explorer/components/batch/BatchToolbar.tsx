import { Button } from '@/shared/components/ui/button';
import { Trash2, FolderInput, Tag as TagIcon, CheckSquare, X, Download } from 'lucide-react';
import { useAppStore } from '@/shared/lib/store';
import { modal } from '@/shared/lib/modal';
import { MoveItemsDialog } from './MoveItemsDialog';
import { AddTagsDialog } from './AddTagsDialog';
import { useI18n } from '@/shared/hooks/useI18n';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { openExportDialog } from '../../../../features/export/ExportFormatDialog';
import { useExport } from '../../../../features/export';
import {
  fetchMessagesForExport,
  buildExportMarkdown,
} from '../../lib/exportConversation';
import type { ExportFormat, ExportItem } from '../../../../features/export/types';
import { useShallow } from 'zustand/react/shallow';

interface BatchToolbarProps {
  onSelectAll: () => void;
}

export const BatchToolbar = ({ onSelectAll }: BatchToolbarProps) => {
  const { t } = useI18n();
  const {
    ui,
    setExplorerBatchMode,
    setExplorerBatchSelection,
    deleteItems,
  } = useAppStore(
    useShallow((s) => ({
      ui: s.ui,
      setExplorerBatchMode: s.setExplorerBatchMode,
      setExplorerBatchSelection: s.setExplorerBatchSelection,
      deleteItems: s.deleteItems,
    })),
  );
  const { selectedIds } = ui.explorer.batch;
  const { exportItems } = useExport({
    multiFileZip: true,
    obsidianFolder: 'Conversations',
    batchPrefix: 'conversations',
  });

  const handleDelete = async () => {
    const state = useAppStore.getState();
    const validIds = selectedIds.filter(id => 
      state.conversations.some(c => c.id === id) || 
      state.folders.some(f => f.id === id)
    );
    if (validIds.length === 0) return;

    const confirmed = await modal.confirmDelete({
      title: t('batch.deleteConfirmTitle', { count: validIds.length }),
      content: t('batch.deleteConfirmMessage'),
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

  const handleExport = async (format: ExportFormat) => {
    if (selectedIds.length === 0) return;
    const state = useAppStore.getState();
    const conversationIds = selectedIds.filter(id =>
      state.conversations.some(c => c.id === id),
    );
    if (conversationIds.length === 0) return;

    // Build ExportItem[] from conversations by fetching their messages
    const items: ExportItem[] = [];
    for (const id of conversationIds) {
      const messages = await fetchMessagesForExport(id);
      if (messages?.length) {
        const convo = state.conversations.find(c => c.id === id);
        const title = convo?.title || id;
        const md = buildExportMarkdown(messages);
        // Get tags for this conversation
        const tagIds = state.conversationTags
          .filter(ct => ct.conversation_id === id)
          .map(ct => ct.tag_id);
        const tags = tagIds.length > 0
          ? state.tags.filter(t => tagIds.includes(t.id)).map(t => t.name)
          : undefined;
        items.push({ id, title, content: md, tags });
      }
    }
    if (items.length === 0) return;

    exportItems(items, format);
  };

  return (
    <div className="px-3 py-2 flex items-center justify-between bg-muted/40">
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

        <SimpleTooltip content={t('export.export')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={selectedIds.length === 0}
            onClick={() => openExportDialog(handleExport)}
          >
            <Download className="h-4 w-4" />
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
