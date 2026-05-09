import { useRef, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { NotebooksHeader } from './components/NotebooksHeader';
import {
  NotebooksTreeView,
  NotebooksTreeHandle,
} from './components/NotebooksTreeView';
import { FilterBar } from '../../components/FilterBar';
import { useStoreFilter } from '../../hooks/useStoreFilter';
import { NotebookText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { toast } from '@/shared/lib/toast';

interface NotebooksTabProps {
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
  };
}

export const NotebooksTab = ({ menuActions }: NotebooksTabProps) => {
  const { t } = useI18n();
  const { notebooks, tags: allTags, fetchData } = useAppStore();
  const filter = useStoreFilter('notebooks');
  const treeRef = useRef<NotebooksTreeHandle>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleCollapseAll = () => {
    treeRef.current?.collapseAll();
  };

  const handleSelect = (_nodes: any[]) => {
    // Selection handled inside NotebookNode (navigation)
  };

  const handleViewNotebooks = () => {
    navigate('https://gemini.google.com/notebooks/view');
  };

  const handleScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'START_NOTEBOOK_SCAN',
      });
      if (response?.success) {
        await fetchData(true);
      } else {
        toast.error(response?.error || t('notebooks.scanNotebooks'));
      }
    } catch (err) {
      console.error('Notebook scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full relative">
      <NotebooksHeader
        onCollapseAll={handleCollapseAll}
        filter={filter}
        menuActions={menuActions}
        isScanning={isScanning}
        onViewNotebooks={handleViewNotebooks}
        onScan={handleScan}
      />

      <FilterBar filter={filter} allTags={allTags} />

      <div className="flex-1 overflow-hidden relative">
        {isScanning ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <p className="text-sm">{t('notebooks.scanningNotebooks')}</p>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground gap-3">
            <NotebookText className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm">{t('notebooks.empty')}</p>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate('https://gemini.google.com/notebooks/create')
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('notebooks.newNotebook')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleScan}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                {t('notebooks.scanNotebooks')}
              </Button>
            </div>
          </div>
        ) : (
          <NotebooksTreeView ref={treeRef} onSelect={handleSelect} />
        )}
      </div>
    </div>
  );
};
