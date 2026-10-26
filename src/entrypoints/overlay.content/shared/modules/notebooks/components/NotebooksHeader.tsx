import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { CopyMinus, Eye, RefreshCw, Plus } from 'lucide-react';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { FilterActions } from '../../../components/FilterActions';
import type { FilterState, ExplorerTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { CollectionHeaderButtons } from '../../collections/CollectionHeaderButtons';

interface NotebooksHeaderProps {
  onCollapseAll: () => void;
  onNewFolder: () => void;
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
  onNewFolder,
  filter,
  menuActions,
  isScanning,
  onViewNotebooks,
  onScan,
}: NotebooksHeaderProps) => {
  const { t } = useI18n();

  const handleCreateNotebook = () => {
    navigate('https://gemini.google.com/notebooks/create');
  };

  return (
    <div className="flex flex-col">
      <div className="tab-header px-3 pt-2 pb-1 flex items-center justify-between">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('notebooks.title')}
        </h1>
        <div className="flex items-center gap-0.5">
          <SimpleTooltip content={t('menu.collapseAll')}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCollapseAll}>
              <CopyMinus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <CollectionHeaderButtons scope="notebooks" onNewFolder={onNewFolder} />

          <SidePanelMenu menuActions={menuActions} />
        </div>
      </div>

      <div className="tab-header px-3 pb-2 pt-1 flex items-center justify-between">
        <div className="flex-1 mr-2">
          <FilterActions filter={filter} visibleFilters={['search', 'tags', 'favorites']} />
        </div>
        <div className="flex items-center gap-1">
          <SimpleTooltip content={t('notebooks.newNotebook')}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreateNotebook}>
              <Plus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('notebooks.viewNotebooks')}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onViewNotebooks}>
              <Eye className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip
            content={isScanning ? t('notebooks.scanningNotebooks') : t('notebooks.scanNotebooks')}
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
