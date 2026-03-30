import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { FolderPlus, ListCollapse, ArrowDownAZ, Clock, ListChecks, Plus } from 'lucide-react';
import { PromptsFilterActions } from './PromptsFilterActions';
import type { FilterState, PromptsTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { BatchToolbar } from './batch/BatchToolbar';

interface PromptsHeaderProps {
  onNewFolder: () => void;
  onCollapseAll: () => void;
  onNewChat: () => void;
  onSelectAll?: () => void;
  filter: FilterState<PromptsTypeFilter>;
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    handleScanLibrary?: () => void;
    onImportAiStudioSystem?: () => void;
  };
}

export const PromptsHeader = ({
  onNewFolder,
  onCollapseAll,
  onNewChat,
  onSelectAll,
  filter,
  menuActions,
}: PromptsHeaderProps) => {
  const { t } = useI18n();
  const { ui, setPromptsSortOrder, setPromptsBatchMode } = useAppStore();

  const { sortOrder } = ui.prompts;
  const { isBatchMode } = ui.prompts.batch;

  const handleSort = () => {
    const newOrder = sortOrder === 'alpha' ? 'date' : 'alpha';
    setPromptsSortOrder(newOrder);
  };

  return (
    <div className="flex flex-col border-b bg-background">
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          {t('tabs.prompts')}
        </h1>

        <div className="flex items-center gap-0.5">
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
                  onClick={() => setPromptsBatchMode(!isBatchMode)}
                >
                  <ListChecks className="h-4 w-4" />
                </Button>
              </SimpleTooltip>

              <SidePanelMenu menuActions={menuActions} />
        </div>
      </div>

      <div className="px-3 pb-2 pt-1 flex items-center justify-between">
        <div className="flex-1 mr-2">
          <PromptsFilterActions filter={filter} />
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
          <SimpleTooltip content={t('tooltip.newPrompt')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onNewChat}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>
      </div>

      {isBatchMode && (
        <BatchToolbar onSelectAll={onSelectAll} />
      )}
    </div>
  );
};
