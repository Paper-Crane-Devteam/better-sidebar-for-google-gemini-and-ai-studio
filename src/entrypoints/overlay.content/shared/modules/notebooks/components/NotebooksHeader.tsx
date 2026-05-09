import { useAppStore } from '@/shared/lib/store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  ListCollapse,
  ArrowDownAZ,
  Clock,
  Eye,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { FilterActions } from '../../../components/FilterActions';
import type {
  FilterState,
  ExplorerTypeFilter,
} from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';

interface NotebooksHeaderProps {
  onCollapseAll: () => void;
  filter: FilterState<ExplorerTypeFilter>;
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
  };
  isScanning?: boolean;
  onViewNotebooks?: () => void;
  onScan?: () => void;
}

export const NotebooksHeader = ({
  onCollapseAll,
  filter,
  menuActions,
  isScanning,
  onViewNotebooks,
  onScan,
}: NotebooksHeaderProps) => {
  const { t } = useI18n();
  const { ui, setNotebooksSortOrder } = useAppStore();
  const { sortOrder } = ui.notebooks;

  const handleSort = () => {
    setNotebooksSortOrder(sortOrder === 'alpha' ? 'date' : 'alpha');
  };

  const handleCreateNotebook = () => {
    navigate('https://gemini.google.com/notebooks/create');
  };

  return (
    <div className="flex flex-col border-b bg-background">
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          {t('notebooks.title')}
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
        <div className="flex items-center gap-1">
          <SimpleTooltip content={t('notebooks.newNotebook')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCreateNotebook}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('notebooks.viewNotebooks')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onViewNotebooks}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip
            content={
              isScanning
                ? t('notebooks.scanningNotebooks')
                : t('notebooks.scanNotebooks')
            }
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onScan}
              disabled={isScanning}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>
      </div>
    </div>
  );
};
