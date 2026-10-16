import React from 'react';
import { useAppStore } from '@/shared/lib/store';
import { SidePanelMenu } from '../../components/menu/SidePanelMenu';
import { FavoritesList } from './components/FavoritesList';
import { useStoreFilter } from '../../hooks/useStoreFilter';
import { FilterBar } from '../../components/FilterBar';
import { FilterActions } from '../../components/FilterActions';
import { useI18n } from '@/shared/hooks/useI18n';
import { useShallow } from 'zustand/react/shallow';

interface FavoritesTabProps {
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    handleScanLibrary?: () => void;
    onImportAiStudioSystem?: () => void;
  };
  visibleFilters?: ('search' | 'tags' | 'type' | 'favorites')[];
}

export const FavoritesTab = ({ menuActions, visibleFilters }: FavoritesTabProps) => {
  const { t } = useI18n();
  const {
    tags: allTags,
  } = useAppStore(
    useShallow((s) => ({
      tags: s.tags,
    })),
  );
  const filter = useStoreFilter('favorites');

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="tab-header p-3 flex items-center justify-between h-12 shrink-0">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('tabs.favorites')}
        </h1>
        <div className="flex gap-0.5 items-center">
          <FilterActions
            filter={filter}
            visibleFilters={visibleFilters || ['search', 'tags', 'type']}
          />
          <div className="h-4 w-[1px] bg-border mx-1" />
          <SidePanelMenu menuActions={menuActions} />
        </div>
      </div>

      <FilterBar filter={filter} allTags={allTags} />

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <FavoritesList
          searchQuery={filter.search.query}
          selectedTags={filter.tags.selected}
          typeFilter={filter.type.value}
        />
      </div>
    </div>
  );
};
