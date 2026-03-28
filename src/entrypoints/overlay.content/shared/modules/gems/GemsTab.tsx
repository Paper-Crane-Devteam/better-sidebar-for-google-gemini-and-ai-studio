import { useRef, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { GemsHeader } from './components/GemsHeader';
import { GemsTreeView, GemsTreeHandle } from './components/GemsTreeView';
import { FilterBar } from '../../components/FilterBar';
import { useStoreFilter } from '../../hooks/useStoreFilter';
import { Gem as GemIcon, Loader2, Plus, ScanSearch } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { toast } from '@/shared/lib/toast';

interface GemsTabProps {
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
  };
}

export const GemsTab = ({ menuActions }: GemsTabProps) => {
  const { t } = useI18n();
  const { gems, tags: allTags, fetchData } = useAppStore();
  const filter = useStoreFilter('gems');
  const treeRef = useRef<GemsTreeHandle>(null);
  const [isScanningGems, setIsScanningGems] = useState(false);

  const handleCollapseAll = () => {
    treeRef.current?.collapseAll();
  };

  const handleSelect = (_nodes: any[]) => {
    // Selection handled inside GemNode (navigation)
  };

  const handleViewGems = () => {
    navigate('https://gemini.google.com/gems/view');
  };

  const handleScanGems = async () => {
    if (isScanningGems) return;
    setIsScanningGems(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'START_GEM_SCAN',
      });
      if (response?.success) {
        const count = response.data?.count ?? 0;
        console.log(`Gem scan completed: ${count} gems found`);
        // Refresh store data
        await fetchData(true);
      } else {
        console.error('Gem scan failed:', response?.error);
        toast.error(response?.error || 'Scan failed');
      }
    } catch (err) {
      console.error('Gem scan error:', err);
    } finally {
      setIsScanningGems(false);
    }
  };

  const allMenuActions = {
    ...menuActions,
    onViewGems: handleViewGems,
    onScanGems: handleScanGems,
    isScanningGems,
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      <GemsHeader
        onCollapseAll={handleCollapseAll}
        filter={filter}
        menuActions={allMenuActions}
        isScanningGems={isScanningGems}
      />

      <FilterBar filter={filter} allTags={allTags} />

      <div className="flex-1 overflow-hidden relative">
        {isScanningGems ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <p className="text-sm">{t('gems.scanningGems')}</p>
          </div>
        ) : gems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-3">
            <GemIcon className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm">{t('gems.empty')}</p>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('https://gemini.google.com/gems/create')}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('gems.createGem')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleScanGems}
              >
                <ScanSearch className="h-3.5 w-3.5 mr-1" />
                {t('gems.scanGems')}
              </Button>
            </div>
          </div>
        ) : (
          <GemsTreeView ref={treeRef} onSelect={handleSelect} />
        )}
      </div>
    </div>
  );
};
