import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  FolderPlus,
  ArrowDownAZ,
  Clock,
  ListChecks,
  CopyMinus,
  Cloud,
  Loader2,
  Crosshair,
  Search,
  X,
  Filter,
  Tags,
  MessageSquare,
  Image as ImageIcon,
  LayoutGrid,
  Star,
} from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { debounce } from 'lodash';
import { SidePanelMenu } from '@/entrypoints/overlay.content/shared/components/menu/SidePanelMenu';
import { useModalStore } from '@/shared/lib/modal';
import { GDriveSyncSection } from '@/entrypoints/overlay.content/shared/components/GDriveSyncSection';
import type { FilterState, ExplorerTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { BatchToolbar } from './batch/BatchToolbar';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { Input } from '@/entrypoints/overlay.content/shared/components/ui/input';
import { CollapsibleSection } from '../../../components/CollapsibleSection';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { toggleCompactMode } from '@/shared/lib/compact-mode';

// ── Type Filter Dropdown ────────────────────────────────────────────
interface TypeFilterDropdownProps {
  value: ExplorerTypeFilter;
  filterTypes: ExplorerTypeFilter[];
  onChange: (value: ExplorerTypeFilter) => void;
  getTypeTitle: () => string;
}

const TypeFilterDropdown = ({ value, filterTypes, onChange, getTypeTitle }: TypeFilterDropdownProps) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const getTypeIcon = (type: ExplorerTypeFilter) => {
    switch (type) {
      case 'conversation': return <MessageSquare className="h-4 w-4" />;
      case 'text-to-image': return <ImageIcon className="h-4 w-4" />;
      case 'gem': return <UIcon icon="tabler:diamond" className="h-4 w-4" />;
      case 'notebook': return <UIcon icon="tabler:notebook" className="h-4 w-4" />;
      default: return <LayoutGrid className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: ExplorerTypeFilter) => {
    switch (type) {
      case 'conversation': return t('tooltip.filterConversations');
      case 'text-to-image': return t('tooltip.filterImages');
      case 'gem': return t('tooltip.filterGems');
      case 'notebook': return t('tooltip.filterNotebooks');
      default: return t('tooltip.filterAll');
    }
  };

  // Selected item first, then the rest in original order
  const sortedTypes = [value, ...filterTypes.filter((type) => type !== value)];

  return (
    <div ref={containerRef} className="relative">
      <SimpleTooltip content={getTypeTitle()}>
        <Button
          variant={value === 'all' ? 'ghost' : 'secondary'}
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen(!open)}
        >
          {getTypeIcon(value)}
        </Button>
      </SimpleTooltip>

      {open && (
        <div className="absolute top-0 left-0 z-50 flex flex-col rounded-md bg-popover shadow-[shadow:var(--shadow-popover)] animate-in fade-in slide-in-from-top-1 duration-100">
          {sortedTypes.map((type) => (
            <SimpleTooltip key={type} content={getTypeLabel(type)} side="right">
              <button
                className={`flex items-center justify-center h-7 w-7 transition-colors rounded-md ${
                  value === type
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                }`}
                onClick={() => {
                  onChange(type);
                  setOpen(false);
                }}
              >
                {getTypeIcon(type)}
              </button>
            </SimpleTooltip>
          ))}
        </div>
      )}
    </div>
  );
};

interface ExplorerHeaderProps {
  onNewFolder: () => void;
  onCollapseAll: () => void;
  onLocateCurrent: () => void;
  onSelectAll: () => void;
  onNewChat: () => void;
  newChatButton?: React.ReactNode;
  filter: FilterState<ExplorerTypeFilter>;
  filterTypes?: ExplorerTypeFilter[];
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    handleScanLibrary?: () => void;
  };
  isChatsSectionExpanded: boolean;
  onToggleChatsSection: () => void;
}

export const ExplorerHeader = ({
  onNewFolder,
  onCollapseAll,
  onLocateCurrent,
  onSelectAll,
  onNewChat,
  newChatButton,
  filter,
  filterTypes = ['all', 'conversation', 'text-to-image'],
  menuActions,
  isChatsSectionExpanded,
  onToggleChatsSection,
}: ExplorerHeaderProps) => {
  const { t } = useI18n();
  const compactMode = useSettingsStore((state) => state.compactMode);
  const {
    ui,
    setExplorerSortOrder,
    setExplorerViewMode,
    setExplorerBatchMode,
  } = useAppStore();

  const { sortOrder, viewMode } = ui.explorer;
  const { isBatchMode } = ui.explorer.batch;
  const { gdriveSyncing } = usePegasusStore();

  // No hint here: this button *is* the shortcut the hint talks about.
  const handleToggleCompactMode = () => toggleCompactMode();

  // Local search state with debounce
  const [localQuery, setLocalQuery] = useState(filter.search.query);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  useEffect(() => {
    setLocalQuery(filter.search.query);
  }, [filter.search.query]);

  const debouncedSearch = useCallback(
    debounce((value: string) => {
      filter.search.setQuery(value);
      if (value) {
        filter.search.setIsOpen(true);
      }
    }, 350),
    [filter.search.setQuery, filter.search.setIsOpen],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuery(value);
    debouncedSearch(value);
  };

  const handleClearSearch = () => {
    setLocalQuery('');
    filter.search.setQuery('');
    filter.search.setIsOpen(false);
    searchInputRef.current?.focus();
  };

  const handleSort = () => {
    const newOrder = sortOrder === 'alpha' ? 'date' : 'alpha';
    setExplorerSortOrder(newOrder);
  };

  const handleToggleViewMode = () => {
    const newMode = viewMode === 'tree' ? 'timeline' : 'tree';
    setExplorerViewMode(newMode);
  };

  const getTypeTitle = () => {
    switch (filter.type.value) {
      case 'conversation': return t('tooltip.filterConversations');
      case 'text-to-image': return t('tooltip.filterImages');
      case 'gem': return t('tooltip.filterGems');
      case 'notebook': return t('tooltip.filterNotebooks');
      default: return t('tooltip.filterAll');
    }
  };

  // Check if any extra filter is active
  const hasActiveExtraFilters =
    filter.tags.selected.length > 0 ||
    filter.type.value !== 'all' ||
    filter.onlyFavorites.value;

  // CHATS section header actions: batch, locate, collapse
  const chatsSectionActions = (
    <>
      <SimpleTooltip content={t('batch.batchSelection')}>
        <Button
          variant="ghost"
          size="icon"
          className={`h-5 w-5 ${isBatchMode ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setExplorerBatchMode(!isBatchMode)}
        >
          <ListChecks className="h-3.5 w-3.5" />
        </Button>
      </SimpleTooltip>

      <SimpleTooltip content={t('menu.locateCurrent')}>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={() => onLocateCurrent()}
        >
          <Crosshair className="h-3.5 w-3.5" />
        </Button>
      </SimpleTooltip>

      <SimpleTooltip content={t('menu.collapseAll')}>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={() => onCollapseAll()}
        >
          <CopyMinus className="h-3.5 w-3.5" />
        </Button>
      </SimpleTooltip>
    </>
  );

  return (
    <div className="flex flex-col">
      {/* Row 1: Library title | cloud, (divider), sort, new folder, menu */}
      <div className="px-3 py-2 flex items-center justify-between h-12 shrink-0">
        <SimpleTooltip
          content={compactMode ? t('tooltip.exitCompactMode') : t('tooltip.enterCompactMode')}
        >
          <button
            type="button"
            onClick={handleToggleCompactMode}
            className="rounded-sm font-semibold text-sm uppercase tracking-wide text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
          >
            {t('explorerHeader.library')}
          </button>
        </SimpleTooltip>

        <div className="flex items-center gap-1">
          {!compactMode && (
            <>
              <SimpleTooltip
                content={gdriveSyncing ? t('data.gdriveAutoSyncing') : t('data.gdriveSync')}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    useModalStore.getState().open({
                      type: 'info',
                      title: t('data.gdriveSync'),
                      content: (
                        <div className="py-2">
                          <GDriveSyncSection hideTitle={true} />
                        </div>
                      ),
                      modalClassName: 'max-w-md',
                    });
                  }}
                >
                  {gdriveSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Cloud className="h-4 w-4" />
                  )}
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
                  className="h-7 w-7 text-muted-foreground hover:text-foreground ml-2"
                  onClick={handleSort}
                >
                  {sortOrder === 'alpha' ? (
                    <ArrowDownAZ className="h-4 w-4" />
                  ) : (
                    <Clock className="h-4 w-4" />
                  )}
                </Button>
              </SimpleTooltip>

              {viewMode !== 'timeline' && (
                <SimpleTooltip content={t('menu.newFolder')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={onNewFolder}
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </SimpleTooltip>
              )}
            </>
          )}

          <SidePanelMenu
            onToggleViewMode={handleToggleViewMode}
            viewMode={viewMode}
            menuActions={menuActions}
          />
        </div>
      </div>

      {/* New Chat CTA row */}
      {newChatButton}

      {/* CHATS collapsible section */}
      <CollapsibleSection
        title={t('explorerHeader.chats')}
        isExpanded={isChatsSectionExpanded}
        onToggle={onToggleChatsSection}
        actions={chatsSectionActions}
        contentClassName="flex-1 min-h-0"
        actionsVisibilityClass="opacity-0 group-hover/chats:opacity-100"
      >
        <div className="animate-in fade-in slide-in-from-top-1 duration-150">
            {/* Search row with filter funnel on left */}
            <div className="pl-2 pr-3 py-2 flex items-center gap-1">
              {/* Filter funnel toggle */}
              <SimpleTooltip content={t('explorerHeader.moreFilters')}>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 shrink-0 ${hasActiveExtraFilters || moreFiltersOpen ? 'text-primary' : ''}`}
                  onClick={() => setMoreFiltersOpen(!moreFiltersOpen)}
                >
                  <Filter className="h-4 w-4" />
                </Button>
              </SimpleTooltip>

              <div className="flex-1 relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  value={localQuery}
                  onChange={handleSearchChange}
                  placeholder={t('tooltip.search')}
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

            {/* Expandable filter options (tags, type dropdown, favorites) */}
            {moreFiltersOpen && (
              <div className="px-2 py-1 flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-100">
                <SimpleTooltip content={t('tooltip.filterByTags')}>
                  <Button
                    variant={filter.tags.isOpen || filter.tags.selected.length > 0 ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => filter.tags.setIsOpen(!filter.tags.isOpen)}
                  >
                    <Tags className="h-4 w-4" />
                  </Button>
                </SimpleTooltip>

                {/* Type filter with dropdown */}
                <TypeFilterDropdown
                  value={filter.type.value}
                  filterTypes={filterTypes}
                  onChange={filter.type.setValue}
                  getTypeTitle={getTypeTitle}
                />

                <SimpleTooltip content={t('tooltip.filterFavorites')}>
                  <Button
                    variant={filter.onlyFavorites.value ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => filter.onlyFavorites.setValue(!filter.onlyFavorites.value)}
                  >
                    <Star className={`h-4 w-4 ${filter.onlyFavorites.value ? 'fill-current' : ''}`} />
                  </Button>
                </SimpleTooltip>
              </div>
            )}

            {/* Batch toolbar */}
            {isBatchMode && (
              <BatchToolbar onSelectAll={onSelectAll} />
            )}
          </div>
      </CollapsibleSection>
    </div>
  );
};
