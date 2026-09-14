import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, ScanSearch, Loader2 } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { navigate } from '@/shared/lib/navigation';
import { useModalStore } from '@/shared/lib/modal';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/lib/toast';
import type { Notebook } from '@/shared/types/db';

const ITEM_HEIGHT = 36;
const VISIBLE_COUNT = 10;
const OVERSCAN = 4;

interface NotebookPickerContentProps {
  lastSelectedNotebookId?: string | null;
  /**
   * Close the surrounding modal when a notebook is picked. Default true.
   * Set to false when the picker is opened *from inside* a modal that
   * should stay open after the selection (e.g. folder settings).
   */
  closeModalOnSelect?: boolean;
  /**
   * Remember the picked notebook as "last selected". Default true.
   * Set to false when the pick is not about starting a chat (e.g. binding
   * a notebook to a folder), so the New Chat shortcut isn't hijacked.
   */
  recordLastSelected?: boolean;
  /** Notebook IDs to hide from the list */
  excludeIds?: string[];
  /** Show each notebook's current default folder as a hint on the right */
  showDefaultFolderHint?: boolean;
}

export const NotebookPickerContent = ({
  lastSelectedNotebookId,
  closeModalOnSelect = true,
  recordLastSelected = true,
  excludeIds,
  showDefaultFolderHint,
}: NotebookPickerContentProps) => {
  const { t } = useI18n();
  const { notebooks, folders, fetchData } = useAppStore();
  const close = useModalStore((s) => s.close);
  const closePopover = usePopoverPickerStore((s) => s.close);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isScanning, setIsScanning] = useState(false);

  const candidates = useMemo(
    () => (excludeIds?.length ? notebooks.filter((n) => !excludeIds.includes(n.id)) : notebooks),
    [notebooks, excludeIds],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter((n) => n.name.toLowerCase().includes(q));
  }, [candidates, search]);

  const folderNameById = useMemo(() => {
    if (!showDefaultFolderHint) return null;
    return new Map(folders.map((f) => [f.id, f.name]));
  }, [folders, showDefaultFolderHint]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  const handleSelect = useCallback(
    (notebook: Notebook) => {
      if (recordLastSelected) useSettingsStore.getState().setLastSelectedNotebookId(notebook.id);
      if (closeModalOnSelect) close();
      usePopoverPickerStore.getState().resolve(notebook);
    },
    [close, closeModalOnSelect, recordLastSelected],
  );

  const handleCreateNotebook = useCallback(() => {
    close();
    closePopover();
    navigate('https://gemini.google.com/notebooks/create');
  }, [close, closePopover]);

  const handleScanNotebooks = useCallback(async () => {
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

  const totalHeight = filtered.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filtered.length,
    Math.ceil((scrollTop + VISIBLE_COUNT * ITEM_HEIGHT) / ITEM_HEIGHT) + OVERSCAN,
  );
  const visibleItems = filtered.slice(startIndex, endIndex);

  return (
    <div className="-mx-6 -my-4" onKeyDown={handleKeyDown}>
      <div className="px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('notebooks.searchNotebooks')}
            className="flex h-8 w-full rounded-md border border-border/60 bg-transparent px-3 pl-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div
        ref={listRef}
        className="overflow-y-auto px-2 pb-2"
        style={{ maxHeight: VISIBLE_COUNT * ITEM_HEIGHT }}
        onScroll={handleScroll}
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground text-sm py-6 gap-3">
            <span>{notebooks.length === 0 ? t('notebooks.noNotebooks') : t('notebooks.noNotebooks')}</span>
            {notebooks.length === 0 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCreateNotebook}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t('notebooks.newNotebook')}
                </Button>
                <Button variant="outline" size="sm" disabled={isScanning} onClick={handleScanNotebooks}>
                  {isScanning ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <ScanSearch className="h-3.5 w-3.5 mr-1" />
                  )}
                  {t('notebooks.scanNotebooks')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            {visibleItems.map((notebook, i) => {
              const index = startIndex + i;
              return (
                <button
                  key={notebook.id}
                  className={cn(
                    'flex items-center gap-2 px-2 rounded-md text-sm w-full text-left',
                    'hover:bg-accent/50 transition-colors absolute text-foreground font-medium',
                    index === activeIndex && 'bg-accent/50',
                  )}
                  style={{
                    height: ITEM_HEIGHT,
                    top: index * ITEM_HEIGHT,
                  }}
                  onClick={() => handleSelect(notebook)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <UIcon icon="tabler:notebook" className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{notebook.name}</span>
                  {folderNameById && notebook.default_folder_id && folderNameById.has(notebook.default_folder_id) && (
                    <span className="shrink-0 max-w-[45%] truncate text-xs font-normal text-muted-foreground">
                      {folderNameById.get(notebook.default_folder_id)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
