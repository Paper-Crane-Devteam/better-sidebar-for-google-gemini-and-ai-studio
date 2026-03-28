import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Gem as GemIcon, Search, Plus, ScanSearch, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { navigateToGem, navigate } from '@/shared/lib/navigation';
import { useModalStore } from '@/shared/lib/modal';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/lib/toast';
import type { Gem } from '@/shared/types/db';

const ITEM_HEIGHT = 36;
const VISIBLE_COUNT = 10;
const OVERSCAN = 4;

interface GemPickerContentProps {
  lastSelectedGemId?: string | null;
}

export const GemPickerContent = ({ lastSelectedGemId }: GemPickerContentProps) => {
  const { t } = useI18n();
  const { gems, fetchData } = useAppStore();
  const close = useModalStore((s) => s.close);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isScanning, setIsScanning] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return gems;
    const q = search.toLowerCase();
    return gems.filter((g) => g.name.toLowerCase().includes(q));
  }, [gems, search]);



  // Reset active index when search changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  const handleSelect = useCallback(
    (gem: Gem) => {
      useSettingsStore.getState().setLastSelectedGemId(gem.id);
      close();
      navigateToGem(gem.id);
    },
    [close],
  );

  const handleCreateGem = useCallback(() => {
    close();
    navigate('https://gemini.google.com/gems/create');
  }, [close]);

  const handleScanGems = useCallback(async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'START_GEM_SCAN',
      });
      if (response?.success) {
        await fetchData(true);
      } else {
        toast.error(response?.error || 'Scan failed');
      }
    } catch (err) {
      console.error('Gem scan error:', err);
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, fetchData]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault();
        handleSelect(filtered[activeIndex]);
      }
    },
    [filtered, activeIndex, handleSelect],
  );

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const top = activeIndex * ITEM_HEIGHT;
    const bottom = top + ITEM_HEIGHT;
    const el = listRef.current;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [activeIndex]);

  const handleScroll = useCallback(() => {
    if (listRef.current) setScrollTop(listRef.current.scrollTop);
  }, []);

  // Virtual scrolling calculations
  const totalHeight = filtered.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filtered.length,
    Math.ceil((scrollTop + VISIBLE_COUNT * ITEM_HEIGHT) / ITEM_HEIGHT) + OVERSCAN,
  );
  const visibleItems = filtered.slice(startIndex, endIndex);

  const renderGemIcon = (gem: Gem) => {
    if (gem.icon_url) {
      return (
        <img
          src={gem.icon_url}
          alt=""
          className="h-4 w-4 shrink-0 rounded-sm object-cover"
        />
      );
    }
    return <GemIcon className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="-mx-6 -my-4" onKeyDown={handleKeyDown}>
      {/* Search */}
      <div className="px-3 pb-2 pt-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('gems.searchGems')}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 pl-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* List with virtual scrolling */}
      <div
        ref={listRef}
        className="overflow-y-auto px-2 pb-2"
        style={{ maxHeight: VISIBLE_COUNT * ITEM_HEIGHT }}
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground text-sm py-6 gap-3">
            <span>{gems.length === 0 ? t('gems.noGems') : t('gems.noGems')}</span>
            {gems.length === 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateGem}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t('gems.createGem')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isScanning}
                  onClick={handleScanGems}
                >
                  {isScanning ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <ScanSearch className="h-3.5 w-3.5 mr-1" />
                  )}
                  {t('gems.scanGems')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleItems.map((gem, i) => {
              const index = startIndex + i;
              return (
                <button
                  key={gem.id}
                  className={cn(
                    'flex items-center gap-2 px-2 rounded-md text-sm w-full text-left',
                    'hover:bg-accent/50 transition-colors absolute text-foreground font-medium',
                    index === activeIndex && 'bg-accent/50',
                  )}
                  style={{
                    height: ITEM_HEIGHT,
                    top: index * ITEM_HEIGHT,
                  }}
                  onClick={() => handleSelect(gem)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {renderGemIcon(gem)}
                  <span className="truncate">{gem.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
