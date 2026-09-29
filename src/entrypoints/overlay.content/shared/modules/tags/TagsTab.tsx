import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { Button } from '@/shared/components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus } from 'lucide-react';
import { TagItem } from './TagItem';
import { TagDetailView } from './TagDetailView';
import { SidePanelMenu } from '../../components/menu/SidePanelMenu';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import { TagColorDialog } from './TagColorDialog';
import { useTagsViewStore } from './tags-view-store';

interface TagsTabProps {
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    handleScanLibrary?: () => void;
    onImportAiStudioSystem?: () => void;
  };
}

export const TagsTab = ({ menuActions }: TagsTabProps) => {
  const { t } = useI18n();
  const { tags, conversations, conversationTags, createTag } = useAppStore();
  const activeTagId = useTagsViewStore((s) => s.activeTagId);
  const openTag = useTagsViewStore((s) => s.openTag);
  const backToList = useTagsViewStore((s) => s.backToList);
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const listScrollTopRef = useRef(0);

  const activeTag = activeTagId ? tags.find((tag) => tag.id === activeTagId) : undefined;

  // The viewed tag can vanish underneath us (deleted here, or removed by a
  // sync from another device). Fall back to the list instead of a blank view.
  useEffect(() => {
    if (activeTagId && !activeTag) backToList();
  }, [activeTagId, activeTag, backToList]);

  /**
   * Chats per tag. Counted against the loaded conversations rather than the raw
   * link table, so links to deleted chats or chats from another account don't
   * inflate the number.
   */
  const counts = useMemo(() => {
    const visibleIds = new Set(
      conversations.filter((c) => !c.deleted_at && !c.is_temporary).map((c) => c.id),
    );
    const map = new Map<string, number>();
    for (const ct of conversationTags) {
      if (!visibleIds.has(ct.conversation_id)) continue;
      map.set(ct.tag_id, (map.get(ct.tag_id) ?? 0) + 1);
    }
    return map;
  }, [conversations, conversationTags]);

  // Restore the list's scroll position when coming back from a tag / another tab
  useLayoutEffect(() => {
    if (activeTag || !listRef.current) return;
    const saved = useTagsViewStore.getState().listScrollTop;
    listRef.current.scrollTop = saved;
    listScrollTopRef.current = saved;
    return () => {
      useTagsViewStore.setState({ listScrollTop: listScrollTopRef.current });
    };
  }, [activeTag]);

  const handleOpenTag = (tagId: string) => {
    openTag(tagId, listRef.current?.scrollTop ?? 0);
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;

    // Two tags with the same name are indistinguishable in every picker
    const existing = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      toast.warning(t('tags.duplicateName', { name: existing.name }));
      return;
    }

    // Open color picker modal
    let selectedColor: string | null = null;
    const confirmed = await modal.confirm({
      title: t('tags.selectColor'),
      content: (
        <TagColorDialog
          initialColor={null}
          onColorChange={(color: string | null) => {
            selectedColor = color;
          }}
        />
      ),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      setIsCreating(true);
      try {
        await createTag(name, selectedColor ?? undefined);
        setNewTagName('');
      } finally {
        setIsCreating(false);
      }
    }
  };

  if (activeTag) {
    return <TagDetailView tag={activeTag} counts={counts} />;
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="p-3 flex items-center justify-between h-12 shrink-0">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('tabs.tags')}
        </h1>
        <div className="flex gap-0.5 items-center">
          <SidePanelMenu menuActions={menuActions} />
        </div>
      </div>

      {/* Create Tag Input */}
      <div className="p-3 flex gap-2">
        <Input
          placeholder={t('tags.newTagName')}
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            // Skip Enter while an IME composition is being confirmed
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleCreateTag();
          }}
          maxLength={30}
          className="h-8 text-sm"
        />
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shrink-0"
          onClick={handleCreateTag}
          disabled={!newTagName.trim() || isCreating}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Tags List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto"
        onScroll={(e) => {
          listScrollTopRef.current = e.currentTarget.scrollTop;
        }}
      >
        <div className="flex flex-col py-[2px]">
          {tags.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              {t('tags.noTagsYet')}
            </div>
          ) : (
            tags.map((tag) => (
              <TagItem
                key={tag.id}
                tag={tag}
                count={counts.get(tag.id) ?? 0}
                onOpen={handleOpenTag}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
