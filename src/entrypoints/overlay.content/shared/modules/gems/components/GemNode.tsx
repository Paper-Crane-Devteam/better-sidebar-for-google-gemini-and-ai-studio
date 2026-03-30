import React, { useState } from 'react';
import {
  Gem,
  ChevronRight,
  ChevronDown,
  Star,
  Plus,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { navigateToConversation, navigateToGem, navigate } from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useCurrentConversationId } from '../../../../shared/hooks/useCurrentConversationId';
import type { NodeRendererProps } from 'react-arborist';
import type { FolderTreeNodeData } from '../../../components/folder-tree/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { modal } from '@/shared/lib/modal';
import { NodeContextMenu } from '../../explorer/components/node/NodeContextMenu';

export const GemNode = ({
  node,
  style,
  dragHandle,
  tree,
  preview,
}: NodeRendererProps<FolderTreeNodeData>) => {
  const { t } = useI18n();
  const {
    favorites,
    toggleFavorite,
    fetchData,
    conversationTags,
    addTagToConversation,
    removeTagFromConversation,
  } = useAppStore();
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

  const handleTagToggle = async (tagId: string, checked: boolean) => {
    const hasTag = conversationTags.some(
      (ct) => ct.conversation_id === node.data.id && ct.tag_id === tagId,
    );
    if (checked && !hasTag) await addTagToConversation(node.data.id, tagId);
    if (!checked && hasTag) await removeTagFromConversation(node.data.id, tagId);
  };

  const handleDeleteConversation = async () => {
    const confirmed = await modal.confirm({
      title: t('node.delete'),
      content: t('node.deleteConfirm'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      await browser.runtime.sendMessage({
        type: 'DELETE_CONVERSATION',
        payload: { id: node.data.id },
      });
      fetchData(true);
    }
  };

  const toggleIcon = isGem ? (
    node.isOpen ? (
      <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronRight className="w-3 h-3" />
    )
  ) : null;

  const hasHoverActions = isFile;

  const nodeClasses = cn(
    'flex items-center gap-1.5 px-1 pr-2 h-full',
    'cursor-pointer group relative',
    'no-underline outline-none rounded-sm',
    'text-density text-foreground/80 font-medium',
    !isActive && !isCurrentConversation && 'hover:bg-accent/50',
    isActive && 'node-item-selected',
    !isActive && isCurrentConversation && 'node-item-current',
    hasHoverActions && 'group-hover:pr-8',
    node.willReceiveDrop && 'bg-accent/50 border border-primary/40 rounded-sm',
    isContextMenuOpen && 'bg-accent/50',
    isContextMenuOpen && hasHoverActions && 'pr-8',
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
            {isGem && (
              <span className="flex items-center justify-center shrink-0">
                <Gem className="w-4 h-4" />
              </span>
            )}

            {/* Name */}
            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden justify-between">
              <span className="truncate text-sm">
                {node.data.name}
              </span>
            </div>

            {/* Hover actions for files */}
            {isFile && (
              <div
                className={cn(
                  'hidden group-hover:flex items-center gap-1 absolute right-0 pr-2 top-0 bottom-0',
                  'node-action-bar',
                  isContextMenuOpen && 'flex',
                )}
              >
                <div className="absolute inset-y-0 -left-6 w-6 pointer-events-none [background:inherit] [mask-image:linear-gradient(to_right,transparent,black)]" />
                <SimpleTooltip content={isFavorite ? t('tooltip.removeFromFavorites') : t('tooltip.addToFavorites')}>
                  <div
                    role="button"
                    className={cn(
                      'h-5 w-5 flex items-center justify-center rounded-sm cursor-pointer transition-colors',
                      isFavorite
                        ? 'text-yellow-500'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      toggleFavorite(node.data.id, 'conversation', isFavorite);
                    }}
                  >
                    <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
                  </div>
                </SimpleTooltip>
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {/* Context menu */}
      {isGem && (
        <ContextMenuContent className="z-[9999]">
          <ContextMenuItem
            onClick={() => navigate('https://gemini.google.com/gems/create')}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('gems.createGem')}
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const gemUrl = node.data.data?.external_url;
              if (gemUrl) navigateToGem(gemUrl);
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
        </ContextMenuContent>
      )}
      {isFile && (
        <NodeContextMenu
          node={node}
          onToggleFavorite={(id: string, isFav: boolean) =>
            toggleFavorite(id, 'conversation', isFav)
          }
          onCreateFolder={async () => {}}
          onDelete={handleDeleteConversation}
          onTagToggle={handleTagToggle}
          onColorChange={async () => {}}
          isFavorite={isFavorite}
          folderColor={null}
          style={style}
          dragHandle={dragHandle}
          tree={tree}
          preview={preview}
        />
      )}
    </ContextMenu>
  );
};
