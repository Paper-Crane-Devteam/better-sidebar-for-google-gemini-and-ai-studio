import React, { useMemo } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { Star, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { navigate } from '@/shared/lib/navigation';
import { cn } from '@/shared/lib/utils/utils';
import { useCurrentConversationId } from '../../../hooks/useCurrentConversationId';
import type { ExplorerTypeFilter } from '../../../types/filter';
import { useI18n } from '@/shared/hooks/useI18n';
import { useShallow } from 'zustand/react/shallow';

interface FavoritesListProps {
  searchQuery?: string;
  selectedTags?: string[];
  typeFilter?: ExplorerTypeFilter;
}

export const FavoritesList = ({
  searchQuery = '',
  selectedTags = [],
  typeFilter = 'all',
}: FavoritesListProps) => {
  const { t } = useI18n();
  const {
    favorites,
    conversations,
    conversationTags,
    toggleFavorite,
  } = useAppStore(
    useShallow((s) => ({
      favorites: s.favorites,
      conversations: s.conversations,
      conversationTags: s.conversationTags,
      toggleFavorite: s.toggleFavorite,
    })),
  );
  const currentConversationId = useCurrentConversationId();
  const rowHeight = 32;

  const favoriteItems = useMemo(() => {
    const items: any[] = [];
    favorites.forEach((fav) => {
      if (fav.target_type === 'conversation') {
        const convo = conversations.find((c) => c.id === fav.target_id);
        if (convo) {
          items.push({
            ...fav,
            data: convo,
            title: convo.title,
            external_url: convo.external_url,
            // Assuming conversation object has a 'type' field which is 'conversation' or 'text-to-image'
            // If it doesn't, we might default to 'conversation'
            type: convo.type || 'conversation',
          });
        }
      }
    });

    let filteredItems = items;

    // Filter by type
    if (typeFilter !== 'all') {
      filteredItems = filteredItems.filter((item) => item.type === typeFilter);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      filteredItems = filteredItems.filter((item) =>
        item.title.toLowerCase().includes(lowerQuery),
      );
    }

    // Filter by tags
    if (selectedTags.length > 0) {
      filteredItems = filteredItems.filter((item) => {
        // Find tags for this conversation
        const itemTags = new Set(
          conversationTags
            .filter((ct) => ct.conversation_id === item.target_id)
            .map((ct) => ct.tag_id),
        );

        // Check if item has any of the selected tags (OR logic)
        return selectedTags.some((tagId) => itemTags.has(tagId));
      });
    }

    return filteredItems;
  }, [
    favorites,
    conversations,
    conversationTags,
    searchQuery,
    selectedTags,
    typeFilter,
  ]);

  const handleOpen = (url?: string | null) => {
    if (url) {
      navigate(url.replace('https://aistudio.google.com', ''));
    }
  };

  if (favoriteItems.length === 0) {
    if (searchQuery || selectedTags.length > 0 || typeFilter !== 'all') {
      return (
        <div className="p-4 text-center text-muted-foreground text-sm">
          {t('favorites.noFavoritesFound')}
        </div>
      );
    }
    return (
      <div className="p-4 pt-8 text-center text-muted-foreground text-sm">
        {t('favorites.noFavoritesYet')}
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      <div className="p-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {t('favorites.favorites')} ({favoriteItems.length})
      </div>
      <div className="flex flex-col py-[2px]">
        {favoriteItems.map((item) => {
          const isSelected = item.target_id === currentConversationId;
          const isImage = item.type === 'text-to-image';

          return (
            <div
              key={item.id}
              style={{ height: rowHeight }}
              className="w-full px-1"
            >
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleOpen(item.external_url);
                  }
                }}
                className={cn(
                  'group flex items-center gap-2 px-3 cursor-pointer text-sm text-foreground transition-colors h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]',
                  isSelected
                    ? 'bg-accent text-accent-foreground node-item-selected'
                    : 'hover:bg-accent/50',
                )}
                onClick={() => handleOpen(item.external_url)}
              >
                {/* {isImage ? (
                  <ImageIcon
                    className={cn(
                      'w-4 h-4 shrink-0',
                      isSelected
                        ? 'text-accent-foreground'
                        : 'text-muted-foreground',
                    )}
                  />
                ) : (
                  <MessageSquare
                    className={cn(
                      'w-4 h-4 shrink-0',
                      isSelected
                        ? 'text-accent-foreground'
                        : 'text-muted-foreground',
                    )}
                  />
                )} */}
                <span className="truncate flex-1">{item.title}</span>

                <SimpleTooltip content={t('tooltip.removeFromFavorites')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity',
                      isSelected &&
                        'text-accent-foreground hover:text-accent-foreground hover:bg-accent-foreground/10',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.target_id, item.target_type, true);
                    }}
                  >
                    <Star
                      className={cn(
                        'h-3.5 w-3.5 fill-current text-highlight fill-highlight',
                      )}
                    />
                  </Button>
                </SimpleTooltip>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
