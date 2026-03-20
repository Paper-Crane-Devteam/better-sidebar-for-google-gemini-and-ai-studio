import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Search, LayoutGrid, Bot, User, Star } from 'lucide-react';
import type { FilterState, PromptsTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';

interface PromptsFilterActionsProps {
  filter: FilterState<PromptsTypeFilter>;
  showFavoritesFilter?: boolean;
}

export const PromptsFilterActions = ({ filter, showFavoritesFilter = true }: PromptsFilterActionsProps) => {
  const { t } = useI18n();
  const { search, type, onlyFavorites } = filter;

  const handleTypeToggle = () => {
    const next: Record<PromptsTypeFilter, PromptsTypeFilter> = {
      all: 'normal',
      normal: 'system',
      system: 'all',
    };
    type.setValue(next[type.value]);
  };

  const getTypeTitle = () => {
    switch (type.value) {
      case 'normal': return t('tooltip.filterNormalPrompts');
      case 'system': return t('tooltip.filterSystemPrompts');
      default: return t('tooltip.filterAll');
    }
  };

  return (
    <div className="flex items-center gap-0.5">
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

      {/* No Tags Filter for Prompts */}

      <SimpleTooltip content={getTypeTitle()}>
        <Button 
            variant={type.value === 'all' ? "ghost" : "secondary"} 
            size="icon" 
            className="h-7 w-7" 
            onClick={handleTypeToggle}
        >
            {type.value === 'all' && <LayoutGrid className="h-4 w-4" />}
            {type.value === 'normal' && <User className="h-4 w-4" />}
            {type.value === 'system' && <Bot className="h-4 w-4" />}
        </Button>
      </SimpleTooltip>

      {showFavoritesFilter && (
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
