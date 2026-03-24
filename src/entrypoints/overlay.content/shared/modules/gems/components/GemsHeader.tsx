import React, { useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  ListCollapse,
  ArrowDownAZ,
  Clock,
  Plus,
  MessageSquarePlus,
} from 'lucide-react';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { FilterActions } from '../../../components/FilterActions';
import type { FilterState, ExplorerTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { GemPickerDialog } from './GemPickerDialog';
import { useSettingsStore } from '@/shared/lib/settings-store';

interface GemsHeaderProps {
  onCollapseAll: () => void;
  filter: FilterState<ExplorerTypeFilter>;
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
  };
}

export const GemsHeader = ({
  onCollapseAll,
  filter,
  menuActions,
}: GemsHeaderProps) => {
  const { t } = useI18n();
  const { ui, setGemsSortOrder } = useAppStore();
  const { sortOrder } = ui.gems;
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastCreatedGemId = useSettingsStore((s) => s.lastCreatedGemId);

  const handleSort = () => {
    const newOrder = sortOrder === 'alpha' ? 'date' : 'alpha';
    setGemsSortOrder(newOrder);
  };

  const handleCreateGem = () => {
    navigate('https://gemini.google.com/gems/create');
  };

  return (
    <>
      <div className="flex flex-col border-b bg-background">
        <div className="px-3 pt-2 pb-1 flex items-center justify-between">
          <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            {t('gems.title')}
          </h1>
          <div className="flex items-center gap-0.5">
            <SimpleTooltip content={t('gems.createGem')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleCreateGem}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </SimpleTooltip>

            <SimpleTooltip content={t('gems.newGemChat')}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPickerOpen(true)}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            </SimpleTooltip>

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

            <SidePanelMenu menuActions={menuActions} />
          </div>
        </div>

        <div className="px-3 pb-2 pt-1 flex items-center justify-between">
          <div className="flex-1 mr-2">
            <FilterActions
              filter={filter}
              visibleFilters={['search', 'tags', 'favorites']}
            />
          </div>
        </div>
      </div>

      <GemPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        lastCreatedGemId={lastCreatedGemId}
      />
    </>
  );
};
