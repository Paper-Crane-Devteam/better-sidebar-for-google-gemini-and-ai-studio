import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  MessageSquarePlus,
  FolderPlus,
  ListCollapse,
  ArrowDownAZ,
  Clock,
  ListChecks,
  Cloud,
  Loader2,
} from 'lucide-react';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { useModalStore } from '@/shared/lib/modal';
import { GDriveSyncSection } from '@/entrypoints/overlay.content/shared/components/GDriveSyncSection';
import { FilterActions } from '../../../components/FilterActions';
import type { FilterState, ExplorerTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { BatchToolbar } from './batch/BatchToolbar';
import { SplitIconButton, type SplitDropdownItem } from '@/shared/components/ui/split-icon-button';
import { usePegasusStore } from '@/shared/lib/pegasus-store';

interface ExplorerHeaderProps {
  onNewFolder: () => void;
  onCollapseAll: () => void;
  onSelectAll: () => void;
  onNewChat: () => void;
  newChatDropdownItems?: SplitDropdownItem[];
  filter: FilterState<ExplorerTypeFilter>;
  filterTypes?: ExplorerTypeFilter[];
  extraHeaderButtons?: React.ReactNode;
  visibleFilters?: ('search' | 'tags' | 'type' | 'favorites')[];
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    handleScanLibrary?: () => void;
  };
}

export const ExplorerHeader = ({
  onNewFolder,
  onCollapseAll,
  onSelectAll,
  onNewChat,
  newChatDropdownItems,
  filter,
  filterTypes,
  extraHeaderButtons,
  visibleFilters,
  menuActions,
}: ExplorerHeaderProps) => {
  const { t } = useI18n();
  const {
    ui,
    setExplorerSortOrder,
    setExplorerViewMode,
    setExplorerBatchMode,
  } = useAppStore();

  const { sortOrder, viewMode } = ui.explorer;
  const { isBatchMode } = ui.explorer.batch;
  const { gdriveSyncing } = usePegasusStore();

  const handleSort = () => {
    const newOrder = sortOrder === 'alpha' ? 'date' : 'alpha';
    setExplorerSortOrder(newOrder);
  };

  const handleToggleViewMode = () => {
    const newMode = viewMode === 'tree' ? 'timeline' : 'tree';
    setExplorerViewMode(newMode);
  };

  return (
    <div className="flex flex-col border-b bg-background">
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          {t('explorerHeader.library')}
        </h1>

        <div className="flex items-center gap-0.5">
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

              <SimpleTooltip content={t('menu.collapseAll')}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onCollapseAll}
                >
                  <ListCollapse className="h-4 w-4" />
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

              <SimpleTooltip content={t('batch.batchSelection')}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 ${isBatchMode ? 'bg-primary/15 text-primary' : ''}`}
                  onClick={() => setExplorerBatchMode(!isBatchMode)}
                >
                  <ListChecks className="h-4 w-4" />
                </Button>
              </SimpleTooltip>

              <SidePanelMenu
                onToggleViewMode={handleToggleViewMode}
                viewMode={viewMode}
                menuActions={menuActions}
              />
        </div>
      </div>

      <div className="px-3 pb-2 pt-1 flex items-center justify-between">
        <div className="flex-1 mr-2">
          <FilterActions
            filter={filter}
            availableTypes={filterTypes}
            visibleFilters={visibleFilters}
          />
        </div>
        <div className="flex items-center gap-1">
          {viewMode !== 'timeline' && (
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
          )}
          <SplitIconButton
            icon={<MessageSquarePlus className="h-4 w-4" />}
            tooltip={t('tooltip.newChat')}
            onClick={onNewChat}
            dropdownItems={newChatDropdownItems}
          />
          {extraHeaderButtons}
        </div>
      </div>

      {isBatchMode && (
        <BatchToolbar onSelectAll={onSelectAll} />
      )}
    </div>
  );
};
