import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, FolderTree, Search, Tag as TagIcon, X } from 'lucide-react';
import type { Tag } from '@/shared/types/db';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Input } from '../../components/ui/input';
import { useCurrentConversationId } from '../../hooks/useCurrentConversationId';
import { TagConversationItem } from './TagConversationItem';
import { useTagsViewStore } from './tags-view-store';

interface TagDetailViewProps {
  tag: Tag;
  /** Chat count per tag id, shared with the list view */
  counts: Map<string, number>;
}

/** Normalize seconds → ms so mixed-unit timestamps sort correctly */
const toMs = (ts: number | null | undefined) =>
  ts && ts > 0 && ts < 100000000000 ? ts * 1000 : ts || 0;

export const TagDetailView = ({ tag, counts }: TagDetailViewProps) => {
  const { t } = useI18n();
  const { tags, conversations, conversationTags, favorites, setActiveTab, setExplorerTags } =
    useAppStore();
  const { backToList, switchTag } = useTagsViewStore();
  const currentConversationId = useCurrentConversationId();
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // conversation id → set of its tag ids (one pass, reused by every row)
  const tagsByConversation = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const ct of conversationTags) {
      let set = map.get(ct.conversation_id);
      if (!set) map.set(ct.conversation_id, (set = new Set()));
      set.add(ct.tag_id);
    }
    return map;
  }, [conversationTags]);

  const favoriteIds = useMemo(
    () =>
      new Set(
        favorites.filter((f) => f.target_type === 'conversation').map((f) => f.target_id),
      ),
    [favorites],
  );

  const taggedConversations = useMemo(
    () =>
      conversations
        .filter(
          (c) => !c.deleted_at && !c.is_temporary && tagsByConversation.get(c.id)?.has(tag.id),
        )
        .sort(
          (a, b) =>
            toMs(b.last_active_at || b.updated_at || b.created_at) -
            toMs(a.last_active_at || a.updated_at || a.created_at),
        ),
    [conversations, tagsByConversation, tag.id],
  );

  const visibleConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return taggedConversations;
    return taggedConversations.filter(
      (c) =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q),
    );
  }, [taggedConversations, query]);

  const handleSwitchTag = (tagId: string) => {
    if (tagId === tag.id) return;
    setQuery('');
    switchTag(tagId);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const handleShowInExplorer = () => {
    setExplorerTags(true, [tag.id]);
    setActiveTab('files');
  };

  // Esc: clear the search first, then go back to the tag list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // Menus render in portals but their React events still bubble here.
    // Only react to keys pressed inside this view's own DOM, so Esc on an
    // open dropdown/context menu just closes that menu.
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.stopPropagation();
    if (query) setQuery('');
    else backToList();
  };

  return (
    <div className="flex flex-col h-full w-full" onKeyDown={handleKeyDown}>
      {/* Header: back · tag switcher · show in explorer */}
      <div className="px-2 flex items-center gap-1 h-12 shrink-0">
        <SimpleTooltip content={t('tags.backToTags')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={backToList}
            aria-label={t('tags.backToTags')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </SimpleTooltip>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex-1 min-w-0 flex items-center gap-1.5 h-7 px-1.5 rounded-md text-sm font-semibold hover:bg-accent/50 outline-none focus-visible:bg-accent/50"
              aria-label={t('tags.switchTag')}
            >
              <TagIcon
                className="h-4 w-4 shrink-0"
                style={tag.color ? { color: tag.color } : undefined}
              />
              <span className="truncate" style={tag.color ? { color: tag.color } : undefined}>
                {tag.name}
              </span>
              <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {taggedConversations.length}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
            {tags.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => handleSwitchTag(item.id)}
                className="flex items-center gap-2"
              >
                <div
                  className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground/40"
                  style={item.color ? { backgroundColor: item.color } : undefined}
                />
                <span className="truncate flex-1">{item.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {counts.get(item.id) ?? 0}
                </span>
                <Check
                  className={`h-3.5 w-3.5 shrink-0 ${item.id === tag.id ? 'opacity-100' : 'opacity-0'}`}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <SimpleTooltip content={t('tags.showInExplorer')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleShowInExplorer}
            aria-label={t('tags.showInExplorer')}
          >
            <FolderTree className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
      </div>

      {/* Search within this tag — only worth showing once there is something to search */}
      {taggedConversations.length > 0 && (
        <div className="px-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={t('tags.searchInTag')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-sm pl-7 pr-7"
            />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery('')}
                aria-label={t('common.clear')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conversations */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {taggedConversations.length === 0 ? (
          <div className="px-6 pt-8 text-center text-muted-foreground text-sm">
            {t('tags.noConversationsInTag')}
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="px-6 pt-8 text-center text-muted-foreground text-sm">
            {t('tags.noMatchingConversations')}
          </div>
        ) : (
          <div className="flex flex-col py-[2px]">
            {visibleConversations.map((c) => (
              <TagConversationItem
                key={c.id}
                conversation={c}
                tag={tag}
                tagIdsOnConversation={tagsByConversation.get(c.id) ?? new Set()}
                isFavorite={favoriteIds.has(c.id)}
                isCurrent={c.id === currentConversationId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
