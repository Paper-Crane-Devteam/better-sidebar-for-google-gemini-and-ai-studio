import React, { useState } from 'react';
import {
  Gem,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  Star,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { navigateToConversation } from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useCurrentConversationId } from '../../../../shared/hooks/useCurrentConversationId';
import { navigate } from '@/shared/lib/navigation';
import type { NodeRendererProps } from 'react-arborist';
import type { FolderTreeNodeData } from '../../../components/folder-tree/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { modal } from '@/shared/lib/modal';

export const GemNode = ({
  node,
  style,
  dragHandle,
}: NodeRendererProps<FolderTreeNodeData>) => {
  const { t } = useI18n();
  const { favorites, toggleFavorite, fetchData } = useAppStore();
  const currentConversationId = useCurrentConversationId();
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

  const isGem = node.data.data?.isGem;
  const isFile = node.data.type === 'file';
  const isFavorite = isFile && favorites.some(
    (f) => f.target_id === node.data.id && f.target_type === 'conversation',
  );
  const url = isFile ? node.data.data?.external_url : undefined;
  const isCurrentConversation = isFile && node.data.id === currentConversationId;
  const isActive = node.isSelected;

  const handleClick = (e: React.MouseEvent) => {
    if (isFile && url) {
      e.preventDefault();
      node.select();
      navigateToConversation(node.data.id);
    } else if (isGem) {
      node.select();
      node.toggle();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (isFile && url) {
      navigateToConversation(node.data.id);
    } else if (isGem) {
      node.toggle();
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.toggle();
  };

  const handleDeleteGem = async () => {
    const confirmed = await modal.confirm({
      title: t('gems.deleteGem'),
      content: t('gems.deleteGemConfirm', { name: node.data.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      await browser.runtime.sendMessage({
        type: 'DELETE_GEM',
        payload: { id: node.data.id },
      });
      fetchData(true);
    }
  };

  // Gem node (folder-like)
  const gemIcon = <Gem className="w-4 h-4 text-purple-500" />;
  const fileIcon = <MessageSquare className="w-4 h-4" />;

  const toggleIcon = isGem ? (
    node.isOpen ? (
      <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronRight className="w-3 h-3" />
    )
  ) : null;

  const childCount = isGem ? (node.data.children?.length || 0) : 0;

  const nodeClasses = cn(
    'flex items-center gap-1.5 px-1 pr-2 h-full',
    'cursor-pointer group relative',
    'no-underline outline-none rounded-sm',
    'text-density text-foreground/80 font-medium',
    !isActive && !isCurrentConversation && 'hover:bg-accent/50',
    isActive && 'node-item-selected',
    !isActive && isCurrentConversation && 'node-item-current',
    isFile && !isFavorite && 'group-hover:pr-8',
    node.willReceiveDrop && 'bg-accent/50 border border-primary/40 rounded-sm',
    isContextMenuOpen && 'bg-accent/50',
  );

  return (
    <ContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          style={style}
          className="outline-none h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]"
        >
          <div
            ref={dragHandle}
            role="button"
            tabIndex={0}
            className={nodeClasses}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          >
            {/* Toggle arrow for gems */}
            {isGem && (
              <span
                className="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer"
                onClick={handleToggle}
              >
                {toggleIcon}
              </span>
            )}

            {/* Icon */}
            <span className="flex items-center justify-center shrink-0">
              {isGem ? gemIcon : fileIcon}
            </span>

            {/* Favorite star */}
            {isFile && isFavorite && (
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />
            )}

            {/* Name */}
            <span className="truncate flex-1 text-sm">
              {node.data.name}
            </span>

            {/* Conversation count badge for gems */}
            {isGem && childCount > 0 && (
              <span className="text-xs text-muted-foreground shrink-0 ml-1">
                {childCount}
              </span>
            )}

            {/* Hover actions for files */}
            {isFile && !isFavorite && (
              <div
                className={cn(
                  'hidden group-hover:flex items-center gap-1 absolute right-2',
                  isContextMenuOpen && 'flex',
                )}
              >
                <SimpleTooltip content={t('tooltip.addToFavorites')}>
                  <div
                    role="button"
                    className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted/50 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      toggleFavorite(node.data.id, 'conversation', false);
                    }}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </div>
                </SimpleTooltip>
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[9999]">
        {isGem && (
          <>
            <ContextMenuItem
              onClick={() => {
                const gemUrl = node.data.data?.external_url;
                if (gemUrl) navigate(gemUrl);
              }}
            >
              <Gem className="mr-2 h-4 w-4" />
              {t('gems.openGem')}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                const gemUrl = node.data.data?.external_url;
                if (gemUrl) window.open(gemUrl, '_blank');
              }}
            >
              {t('gems.openInNewTab')}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={handleDeleteGem}
              className="text-destructive"
            >
              {t('gems.deleteGem')}
            </ContextMenuItem>
          </>
        )}
        {isFile && (
          <>
            <ContextMenuItem
              onClick={() => {
                if (url) window.open(url, '_blank');
              }}
            >
              {t('node.openInNewTab')}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => toggleFavorite(node.data.id, 'conversation', isFavorite)}
            >
              {isFavorite
                ? t('node.removeFromFavorites')
                : t('node.addToFavorites')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
