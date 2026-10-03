import React, { useState } from 'react';
import {
  Star,
  StarOff,
  Tag as TagIcon,
  ExternalLink,
  Trash2,
  X,
} from 'lucide-react';
import type { Conversation, Tag } from '@/shared/types/db';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import { navigateToConversation } from '@/shared/lib/navigation';
import {
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { ExclusiveContextMenu } from '@/entrypoints/overlay.content/shared/components/ui/exclusive-context-menu';
import {
  NodeActionBar,
  renderMenuItems,
} from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { MenuEntryDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { useDeleteHandler } from '../explorer/hooks/useDeleteHandler';

interface TagConversationItemProps {
  conversation: Conversation;
  /** The tag being viewed — "remove" acts on this one */
  tag: Tag;
  /** Ids of every tag on this chat, for the tags submenu checkboxes */
  tagIdsOnConversation: Set<string>;
  isFavorite: boolean;
  isCurrent: boolean;
}

const ROW_HEIGHT = 32;

export const TagConversationItem = ({
  conversation,
  tag,
  tagIdsOnConversation,
  isFavorite,
  isCurrent,
}: TagConversationItemProps) => {
  const { t } = useI18n();
  const { tags, addTagToConversation, removeTagFromConversation, toggleFavorite } =
    useAppStore();
  const { handleDelete } = useDeleteHandler();
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  const title = conversation.title || t('common.untitled');

  const open = () => navigateToConversation(conversation.id);
  const removeFromTag = () => removeTagFromConversation(conversation.id, tag.id);

  const menuItems: MenuEntryDef[] = [
    {
      type: 'item',
      key: 'toggle-favorite',
      icon: isFavorite ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />,
      label: isFavorite ? t('node.removeFromFavorites') : t('node.addToFavorites'),
      onClick: () => toggleFavorite(conversation.id, 'conversation', isFavorite),
    },
    {
      type: 'sub',
      key: 'tags',
      icon: <TagIcon className="h-4 w-4" />,
      label: t('node.tags'),
      contentClassName: 'w-48 max-h-64 overflow-y-auto',
      children: tags.map((item) => ({
        type: 'checkbox' as const,
        key: `tag-${item.id}`,
        checked: tagIdsOnConversation.has(item.id),
        preventClose: true,
        onCheckedChange: (checked: boolean) => {
          if (checked) void addTagToConversation(conversation.id, item.id);
          else void removeTagFromConversation(conversation.id, item.id);
        },
        label: (
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={item.color ? { backgroundColor: item.color } : undefined}
            />
            {item.name}
          </div>
        ),
      })),
    },
    {
      type: 'item',
      key: 'remove-from-tag',
      icon: <X className="h-4 w-4" />,
      label: t('tags.removeFromTag'),
      onClick: () => void removeFromTag(),
    },
    { type: 'separator', key: 'sep-organize' },
    {
      type: 'item',
      key: 'open-new-tab',
      icon: <ExternalLink className="h-4 w-4" />,
      label: t('node.openInNewTab'),
      onClick: () => {
        if (conversation.external_url) window.open(conversation.external_url, '_blank');
      },
    },
    { type: 'separator', key: 'sep-before-delete' },
    {
      type: 'item',
      key: 'delete',
      icon: <Trash2 className="h-4 w-4" />,
      label: t('node.delete'),
      className: 'text-destructive focus:text-destructive',
      onClick: () => void handleDelete([conversation.id]),
    },
  ];

  return (
    <ExclusiveContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div style={{ height: ROW_HEIGHT }} className="w-full px-1">
          <div
            role="button"
            tabIndex={0}
            title={title}
            onClick={open}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            }}
            className={cn(
              'group relative flex items-center gap-1.5 px-2 pr-2 h-[calc(100%-2px)] mt-[1px]',
              'rounded-md cursor-pointer outline-none focus-visible:bg-accent/50',
              'text-density text-foreground/80 font-medium',
              isCurrent ? 'node-item-current' : !isMenuActive && 'hover:bg-accent/50',
              isMenuActive && 'bg-accent/50 node-menu-active',
            )}
          >
            <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden node-text-content">
              <span className="truncate">{title}</span>
            </div>
            <NodeActionBar
              actions={[
                // Unfavorite button for favorited conversations — always shown, leftmost
                ...(isFavorite ? [{
                  icon: <Star className="h-3.5 w-3.5 fill-highlight text-highlight" />,
                  tooltip: t('tooltip.removeFromFavorites'),
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    void toggleFavorite(conversation.id, 'conversation', true);
                  },
                  className: 'text-highlight hover:text-highlight/80',
                  persistent: true,
                }] : []),
                {
                  icon: <X className="h-3.5 w-3.5" />,
                  tooltip: t('tags.removeFromTag'),
                  onClick: (e) => {
                    e.stopPropagation();
                    void removeFromTag();
                  },
                },
              ]}
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
