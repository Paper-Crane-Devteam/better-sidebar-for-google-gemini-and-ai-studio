import { useState, useRef, useImperativeHandle, forwardRef, useCallback, useEffect } from 'react';
import { List, Search, X, Filter } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useOutline } from './useOutline';
import { FilterChips } from './components/FilterChips';
import { OutlineSectionItem } from './components/OutlineSectionItem';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/entrypoints/overlay.content/shared/components/ui/input';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { debounce } from 'lodash';

export interface OutlineContentHandle {
  collapseAll: () => void;
  scrollToActive: () => void;
}

/**
 * Outline content rendered inside the collapsible Explorer section.
 * VSCode-style tree with headings, code blocks, and click-to-navigate.
 */
export const OutlineContent = forwardRef<OutlineContentHandle>((_, ref) => {
  const { t } = useI18n();
  const {
    sections,
    activeMessageId,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    scrollToMessage,
    isLoading,
    stats,
    isOnConversation,
  } = useOutline();

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLDivElement>(null!);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setSearchQuery(value);
    }, 350),
    [setSearchQuery],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuery(value);
    debouncedSearch(value);
  };

  const handleClearSearch = () => {
    setLocalQuery('');
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    collapseAll: () => {
      const allIds = new Set(sections.map((s) => s.id));
      setCollapsedSections(allIds);
    },
    scrollToActive: () => {
      if (activeRef.current) {
        activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
  }), [sections]);

  const hasActiveFilter = filter !== 'all';

  // ── Toolbar ──────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex flex-col">
      {/* Search row with filter icon on left */}
      <div className="pl-2 pr-3 py-2 flex items-center gap-1">
        <SimpleTooltip content={t('explorerHeader.moreFilters')}>
          <Button
            variant={hasActiveFilter || filtersOpen ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            value={localQuery}
            onChange={handleSearchChange}
            placeholder={t('outline.searchPlaceholder')}
            className="h-7 rounded-sm pl-7 pr-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleClearSearch();
              }
            }}
          />
          {localQuery && (
            <button
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-sm cursor-pointer border-none bg-transparent"
              onClick={handleClearSearch}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable filter chips (category filters without counts) */}
      {filtersOpen && (
        <div className="px-2 py-1 animate-in fade-in slide-in-from-top-1 duration-100">
          <FilterChips filter={filter} onFilterChange={setFilter} stats={stats} />
        </div>
      )}
    </div>
  );

  // ── Empty / loading states ───────────────────────────────────────
  if (!isOnConversation) {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center text-muted-foreground min-h-[80px]">
          <List className="h-5 w-5 mb-2 opacity-40" />
          <p className="text-xs">{t('outline.placeholder')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <div className="flex items-center justify-center py-6 min-h-[80px]">
          <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {toolbar}
        <div className="flex flex-col items-center justify-center py-6 px-4 text-center text-muted-foreground min-h-[80px]">
          <List className="h-5 w-5 mb-2 opacity-40" />
          <p className="text-xs">
            {searchQuery ? t('outline.noResults') : t('outline.empty')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0">
      {toolbar}

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="py-1">
          {sections.map((section) => (
            <OutlineSectionItem
              key={section.id}
              section={section}
              isActive={section.userMessageId === activeMessageId}
              isCollapsed={collapsedSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              onNavigate={scrollToMessage}
              activeRef={
                section.userMessageId === activeMessageId ? activeRef : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
});

OutlineContent.displayName = 'OutlineContent';
