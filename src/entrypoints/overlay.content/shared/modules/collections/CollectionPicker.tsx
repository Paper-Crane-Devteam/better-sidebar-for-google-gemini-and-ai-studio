import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Folder as FolderIcon, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useAppStore } from '@/shared/lib/store';
import type { CollectionScope } from '@/shared/types/db';
import { buildPickerRows, type CollectionItem, type CollectionPickerRow } from './collection-tree';
import { useCollectionSortOrder } from './useCollectionSortOrder';

const ITEM_HEIGHT = 36;
const VISIBLE_COUNT = 10;
const OVERSCAN = 4;
const INDENT = 16;

interface CollectionPickerProps<T extends CollectionItem> {
  scope: CollectionScope;
  /** Pickable gems/notebooks (already narrowed by the caller, e.g. excludeIds) */
  items: T[];
  onPick: (item: T) => void;
  searchPlaceholder: string;
  renderIcon: (item: T) => React.ReactNode;
  /** Small hint on the right of an item row */
  renderHint?: (item: T) => React.ReactNode;
  /** Shown instead of the list when nothing matches (or nothing exists) */
  renderEmpty: (info: { isSearching: boolean }) => React.ReactNode;
}

/**
 * Search + list picker for gems/notebooks, laid out in the panel's folders.
 * Folders start expanded and can be collapsed; a search shows only matching
 * items, with every folder on their path opened.
 */
export function CollectionPicker<T extends CollectionItem>({
  scope,
  items,
  onPick,
  searchPlaceholder,
  renderIcon,
  renderHint,
  renderEmpty,
}: CollectionPickerProps<T>) {
  const allFolders = useAppStore((s) => s.collectionFolders);
  const [sortOrder] = useCollectionSortOrder(scope);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const folders = useMemo(() => allFolders.filter((f) => f.scope === scope), [allFolders, scope]);
  const rows = useMemo(
    () => buildPickerRows<T>({ items, folders, sortOrder, query: search, collapsed }),
    [items, folders, sortOrder, search, collapsed],
  );

  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  const toggleFolder = useCallback((id: string, open?: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const isOpen = !prev.has(id);
      if (open ?? !isOpen) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const activate = useCallback(
    (row: CollectionPickerRow<T>) => {
      if (row.kind === 'item') onPick(row.item);
      else if (!search.trim()) toggleFolder(row.id);
    },
    [onPick, search, toggleFolder],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const row = activeIndex >= 0 ? rows[activeIndex] : undefined;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && row) {
      e.preventDefault();
      activate(row);
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && row?.kind === 'folder') {
      // Leave the arrows to the search input's caret unless a folder row is active.
      if (search.trim()) return;
      e.preventDefault();
      toggleFolder(row.id, e.key === 'ArrowRight');
    }
  };

  // Keep the active row in view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const top = activeIndex * ITEM_HEIGHT;
    const bottom = top + ITEM_HEIGHT;
    const el = listRef.current;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [activeIndex]);

  const totalHeight = rows.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    rows.length,
    Math.ceil((scrollTop + VISIBLE_COUNT * ITEM_HEIGHT) / ITEM_HEIGHT) + OVERSCAN,
  );

  return (
    <div className="-mx-6 -my-4" onKeyDown={handleKeyDown}>
      <div className="px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex h-8 w-full rounded-md border border-border/60 bg-transparent px-3 pl-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div
        ref={listRef}
        className="overflow-y-auto px-2 pb-2"
        style={{ maxHeight: VISIBLE_COUNT * ITEM_HEIGHT }}
        onScroll={() => listRef.current && setScrollTop(listRef.current.scrollTop)}
      >
        {rows.length === 0 ? (
          renderEmpty({ isSearching: !!search.trim() })
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }} role="tree">
            {rows.slice(startIndex, endIndex).map((row, i) => {
              const index = startIndex + i;
              const isFolder = row.kind === 'folder';
              return (
                <button
                  key={`${row.kind}:${row.id}`}
                  type="button"
                  role="treeitem"
                  aria-expanded={isFolder ? row.isOpen : undefined}
                  className={cn(
                    'flex items-center gap-2 pr-2 rounded-md text-sm w-full text-left',
                    'hover:bg-accent/50 transition-colors absolute font-medium',
                    isFolder ? 'text-foreground/80' : 'text-foreground',
                    index === activeIndex && 'bg-accent/50',
                  )}
                  style={{
                    height: ITEM_HEIGHT,
                    top: index * ITEM_HEIGHT,
                    paddingLeft: 8 + row.depth * INDENT,
                  }}
                  onClick={() => activate(row)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {isFolder ? (
                    <>
                      <span className="w-3.5 h-3.5 shrink-0 text-muted-foreground flex items-center justify-center">
                        {row.isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                        )}
                      </span>
                      <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">{row.name}</span>
                    </>
                  ) : (
                    <>
                      {renderIcon(row.item)}
                      <span className="truncate flex-1">{row.item.name}</span>
                      {renderHint?.(row.item)}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
