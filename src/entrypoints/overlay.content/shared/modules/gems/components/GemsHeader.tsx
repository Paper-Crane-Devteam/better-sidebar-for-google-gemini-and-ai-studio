import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { CopyMinus, Eye, ScanSearch } from 'lucide-react';
import { GemWithPlus } from '@/shared/components/icons/gem-composite-icons';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { FilterActions } from '../../../components/FilterActions';
import type { FilterState, ExplorerTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { CollectionHeaderButtons } from '../../collections/CollectionHeaderButtons';

interface GemsHeaderProps {
  onCollapseAll: () => void;
  onNewFolder: () => void;
  filter: FilterState<ExplorerTypeFilter>;
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    isScanningGems?: boolean;
  };
  isScanningGems?: boolean;
  onViewGems?: () => void;
  onScanGems?: () => void;
}

export const GemsHeader = ({
  onCollapseAll,
  onNewFolder,
  filter,
  menuActions,
  isScanningGems,
  onViewGems,
  onScanGems,
}: GemsHeaderProps) => {
  const { t } = useI18n();

  const handleCreateGem = () => {
    navigate('https://gemini.google.com/gems/create');
  };

  return (
    <div className="flex flex-col">
      <div className="tab-header px-3 pt-2 pb-1 flex items-center justify-between">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('gems.title')}
        </h1>
        <div className="flex items-center gap-0.5">
          <SimpleTooltip content={t('menu.collapseAll')}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCollapseAll}>
              <CopyMinus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <CollectionHeaderButtons scope="gems" onNewFolder={onNewFolder} />

          <SidePanelMenu menuActions={{ ...menuActions, isScanningGems }} />
        </div>
      </div>

      <div className="tab-header px-3 pb-2 pt-1 flex items-center justify-between">
        <div className="flex-1 mr-2">
          <FilterActions filter={filter} visibleFilters={['search', 'tags', 'favorites']} />
        </div>
        <div className="flex items-center gap-1">
          <SimpleTooltip content={t('gems.createGem')}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCreateGem}>
              <GemWithPlus />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={t('gems.viewGems')}>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onViewGems}>
              <Eye className="h-4 w-4" />
            </Button>
          </SimpleTooltip>

          <SimpleTooltip content={isScanningGems ? t('gems.scanningGems') : t('gems.scanGems')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onScanGems}
              disabled={isScanningGems}
            >
              <ScanSearch className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>
      </div>
    </div>
  );
};
