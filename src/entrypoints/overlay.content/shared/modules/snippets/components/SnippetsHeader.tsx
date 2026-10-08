import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  FolderPlus,
  CopyMinus,
  ListChecks,
  Plus,
  ArrowDownAZ,
  Clock,
  Cloud,
  Loader2,
  X,
  Trash2,
  FolderInput,
  CheckSquare,
  Download,
} from 'lucide-react';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { FilterActions } from '../../../components/FilterActions';
import { GDriveSyncSection } from '@/entrypoints/overlay.content/shared/components/GDriveSyncSection';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { useModalStore } from '@/shared/lib/modal';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { modal } from '@/shared/lib/modal';
import { SnippetMoveDialog } from './SnippetMoveDialog';
import { useExport } from '../../../features/export';
import { openExportDialog } from '../../../features/export/ExportFormatDialog';
import type { ExportFormat } from '../../../features/export/types';
import type { FilterState, ExplorerTypeFilter } from '../../../types/filter';
import { useShallow } from 'zustand/react/shallow';

interface SnippetsHeaderProps {
  onNewFolder: () => void;
  onCollapseAll: () => void;
  onSelectAll: () => void;
  onNewSnippet: () => void;
  filter: FilterState<ExplorerTypeFilter>;
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
  };
}

export const SnippetsHeader = ({
  onNewFolder,
  onCollapseAll,
  onSelectAll,
  onNewSnippet,
  filter,
  menuActions,
}: SnippetsHeaderProps) => {
  const { t } = useI18n();
  const {
    ui,
    setSnippetsSortOrder,
    setSnippetsBatchMode,
    setSnippetsBatchSelection,
    deleteSnippetItems,
    moveSnippetItems,
  } = useAppStore(
    useShallow((s) => ({
      ui: s.ui,
      setSnippetsSortOrder: s.setSnippetsSortOrder,
      setSnippetsBatchMode: s.setSnippetsBatchMode,
      setSnippetsBatchSelection: s.setSnippetsBatchSelection,
      deleteSnippetItems: s.deleteSnippetItems,
      moveSnippetItems: s.moveSnippetItems,
    })),
  );

  const { sortOrder } = ui.snippets;
  const { isBatchMode, selectedIds } = ui.snippets.batch;
  const { gdriveSyncing } = usePegasusStore();
  const { exportItems } = useExport({ batchPrefix: 'snippets' });

  const handleSort = () => {
    const newOrder = sortOrder === 'alpha' ? 'date' : 'alpha';
    setSnippetsSortOrder(newOrder);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = await modal.confirmDelete({
      title: t('batch.deleteConfirmTitle', { count: selectedIds.length }),
      content: t('batch.deleteConfirmMessage'),
    });

    if (confirmed) {
      await deleteSnippetItems(selectedIds);
      setSnippetsBatchSelection([]);
      setSnippetsBatchMode(false);
    }
  };

  const handleBatchMove = async () => {
    if (selectedIds.length === 0) return;

    let targetFolderId: string | null = null;

    const confirmed = await modal.confirm({
      title: t('batch.moveTitle'),
      content: (
        <SnippetMoveDialog
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
      const filesToMove = selectedIds.filter(id =>
        state.snippets.some(s => s.id === id),
      );
      await moveSnippetItems(filesToMove, targetFolderId);
      setSnippetsBatchSelection([]);
      setSnippetsBatchMode(false);
    }
  };

  const handleBatchExport = (format: ExportFormat) => {
    if (selectedIds.length === 0) return;
    const state = useAppStore.getState();
    const items = selectedIds
      .map((id) => state.snippets.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({
        id: s!.id,
        title: s!.title || t('common.untitled'),
        content: s!.content || '',
        sourceUrl: s!.source_url,
        createdAt: s!.created_at,
        updatedAt: s!.updated_at,
      }));
    exportItems(items, format);
  };

  return (
    <div className="flex flex-col">
      {/* Row 1: Title + actions */}
      <div className="px-3 py-2 flex items-center justify-between">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('tabs.snippets')}
        </h1>

        <div className="flex items-center gap-1">
          <SimpleTooltip content={gdriveSyncing ? t('data.gdriveAutoSyncing') : t('data.gdriveSync')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => {
                useModalStore.getState().open({
                  type: 'info',
                  title: t('data.gdriveSync'),
                  content: (
                    <div className="py-2">
                      <GDriveSyncSection hideTitle={true} />
                    </div>
                  ),
                  modalClassName: 'max-w-md',
                });
              }}
            >
              {gdriveSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
            </Button>
          </SimpleTooltip>

          <div className="h-4 w-[1px] bg-border mx-1" />

          <SimpleTooltip content={t('batch.batchSelection')}>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${isBatchMode ? 'bg-primary/15 text-primary' : ''}`}
              onClick={() => setSnippetsBatchMode(!isBatchMode)}
            >
              <ListChecks className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip
            content={
              sortOrder === 'alpha'
                ? t('menu.sortByDate')
                : t('menu.sortAlphabetically')
            }
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSort}
            >
              {sortOrder === 'alpha' ? (
                <ArrowDownAZ className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('menu.collapseAll')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onCollapseAll}
            >
              <CopyMinus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SidePanelMenu menuActions={menuActions} />
        </div>
      </div>

      {/* Row 2: FilterActions (search, favorites) + New Folder, New Snippet */}
      <div className="px-3 pb-2 pt-1 flex items-center justify-between">
        <div className="flex-1 mr-2">
          <FilterActions
            filter={filter}
            visibleFilters={['search', 'favorites']}
          />
        </div>
        <div className="flex items-center gap-1">
          <SimpleTooltip content={t('menu.newFolder')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNewFolder}
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('snippets.createSnippet')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNewSnippet}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>
      </div>

      {/* Row 3: Batch toolbar (conditional) */}
      {isBatchMode && (
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                disabled={selectedIds.length === 0}
                onClick={handleBatchDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </SimpleTooltip>

            <SimpleTooltip content={t('batch.moveSelected')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={selectedIds.length === 0}
                onClick={handleBatchMove}
              >
                <FolderInput className="h-4 w-4" />
              </Button>
            </SimpleTooltip>

            <SimpleTooltip content={t('export.export')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={selectedIds.length === 0}
                onClick={() => openExportDialog(handleBatchExport)}
              >
                <Download className="h-4 w-4" />
              </Button>
            </SimpleTooltip>

            <div className="w-[1px] h-4 bg-border mx-0.5" />

            <SimpleTooltip content={t('batch.exitBatchMode')}>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSnippetsBatchMode(false)}>
                <X className="h-4 w-4" />
              </Button>
            </SimpleTooltip>
          </div>
        </div>
      )}
    </div>
  );
};
