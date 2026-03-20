import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Search, Tags, MessageSquare, Image as ImageIcon, LayoutGrid, Star } from 'lucide-react';
import type { FilterState, ExplorerTypeFilter } from '../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';

interface FilterActionsProps {
  filter: FilterState<ExplorerTypeFilter>;
  availableTypes?: ExplorerTypeFilter[];
  visibleFilters?: ('search' | 'tags' | 'type' | 'favorites')[];
}

export const FilterActions = ({ 
  filter, 
  availableTypes = ['all', 'conversation', 'text-to-image'],
  visibleFilters = ['search', 'tags', 'type', 'favorites']
}: FilterActionsProps) => {
  const { t } = useI18n();
  const { search, tags, type, onlyFavorites } = filter;

  const handleTypeToggle = () => {
    const currentIndex = availableTypes.indexOf(type.value as ExplorerTypeFilter);
    const nextIndex = (currentIndex + 1) % availableTypes.length;
    type.setValue(availableTypes[nextIndex]);
  };

  const getTypeTitle = () => {
    switch (type.value) {
      case 'conversation': return t('tooltip.filterConversations');
      case 'text-to-image': return t('tooltip.filterImages');
      default: return t('tooltip.filterAll');
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      {visibleFilters.includes('search') && (
        <SimpleTooltip content={t('tooltip.search')}>
          <Button
            variant={(search.isOpen || search.query) ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              search.setIsOpen(!search.isOpen);
            }}
          >
            <Search className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
      )}

      {visibleFilters.includes('tags') && (
        <SimpleTooltip content={t('tooltip.filterByTags')}>
          <Button
            variant={(tags.isOpen || tags.selected.length > 0) ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              tags.setIsOpen(!tags.isOpen);
            }}
          >
            <Tags className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
      )}

      {visibleFilters.includes('type') && (
        <SimpleTooltip content={getTypeTitle()}>
          <Button 
              variant={type.value === 'all' ? "ghost" : "secondary"} 
              size="icon" 
              className="h-7 w-7" 
              onClick={handleTypeToggle}
          >
              {type.value === 'all' && <LayoutGrid className="h-4 w-4" />}
              {type.value === 'conversation' && <MessageSquare className="h-4 w-4" />}
              {type.value === 'text-to-image' && <ImageIcon className="h-4 w-4" />}
          </Button>
        </SimpleTooltip>
      )}

      {visibleFilters.includes('favorites') && (
        <SimpleTooltip content={t('tooltip.filterFavorites')}>
          <Button
            variant={onlyFavorites.value ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => onlyFavorites.setValue(!onlyFavorites.value)}
          >
            <Star className={`h-4 w-4 ${onlyFavorites.value ? "fill-current" : ""}`} />
          </Button>
        </SimpleTooltip>
      )}
    </div>
  );
};
