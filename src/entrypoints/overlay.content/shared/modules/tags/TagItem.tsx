import React, { useState, useRef, useEffect } from 'react';
import { Tag } from '@/shared/types/db';
import { useAppStore } from '@/shared/lib/store';
import { Tag as TagIcon } from 'lucide-react';
import { Input } from '@/entrypoints/overlay.content/shared/components/ui/input';
import { cn } from '@/shared/lib/utils/utils';
import {
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { ExclusiveContextMenu } from '@/entrypoints/overlay.content/shared/components/ui/exclusive-context-menu';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import { useI18n } from '@/shared/hooks/useI18n';
import { NodeActionBar, renderMenuItems } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { useTagMenuItems } from './useTagMenuItems';

interface TagItemProps {
  tag: Tag;
  /** Number of chats carrying this tag (in the current account's scope) */
  count: number;
  /** Drill into the tag to see its chats */
  onOpen: (tagId: string) => void;
}

export const TagItem = ({ tag, count, onOpen }: TagItemProps) => {
  const { t } = useI18n();
  const { deleteTag, updateTag } = useAppStore();
  const rowHeight = 32;

  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(tag.name);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleRename = async () => {
    if (!newName.trim() || newName === tag.name) {
      setIsEditing(false);
      setNewName(tag.name);
      return;
    }
    const name = newName.trim();
    const duplicate = useAppStore
      .getState()
      .tags.find((other) => other.id !== tag.id && other.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      toast.warning(t('tags.duplicateName', { name: duplicate.name }));
      setIsEditing(false);
      setNewName(tag.name);
      return;
    }
    await updateTag(tag.id, { name });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    const confirmed = await modal.confirmDelete({
      title: t('tags.deleteTag'),
      content: t('tags.deleteTagConfirm'),
    });
    if (confirmed) {
      await deleteTag(tag.id);
    }
  };

  const handleColorChange = async (color: string | null) => {
    await updateTag(tag.id, { color });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Skip Enter while an IME composition is being confirmed
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setNewName(tag.name);
    }
  };

  const menuItems = useTagMenuItems({
    tag,
    onRename: () => setIsEditing(true),
    onDelete: handleDelete,
    onColorChange: handleColorChange,
  });

  if (isEditing) {
    return (
      <div className="p-2">
        <Input
          ref={inputRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={onKeyDown}
          maxLength={30}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  return (
    <ExclusiveContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div style={{ height: rowHeight }} className="w-full px-1">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpen(tag.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(tag.id);
              }
            }}
            className={cn(
              'group flex items-center justify-between px-2 pr-2 text-sm border border-transparent transition-colors cursor-pointer outline-none focus-visible:bg-accent/50 h-[calc(100%-2px)] mt-[1px] relative',
              tag.color
                ? 'tag-item-colored'
                : isMenuActive
                  ? 'bg-accent/50'
                  : 'hover:bg-accent/50',
              tag.color && isMenuActive && 'tag-item-colored-active',
              isMenuActive && 'node-menu-active',
            )}
            style={tag.color ? { '--tag-color': tag.color } as React.CSSProperties : undefined}
          >
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden node-text-content" style={tag.color ? { color: tag.color } : undefined}>
              <TagIcon className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{tag.name}</span>
              {/* Sits inside the masked text area so the hover action bar fades it out */}
              <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums text-muted-foreground">
                {count}
              </span>
            </div>
            <NodeActionBar
              menuItems={menuItems}
              forceVisible={isMenuActive}
              onDropdownOpenChange={setIsDropdownOpen}
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {renderMenuItems(menuItems, 'context')}
      </ContextMenuContent>
    </ExclusiveContextMenu>
  );
};
