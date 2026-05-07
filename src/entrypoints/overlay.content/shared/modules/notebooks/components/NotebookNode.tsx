import React, { useState } from 'react';
import {
  NotebookText,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Star,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import {
  navigateToConversation,
  navigateToNotebook,
} from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useCurrentConversationId } from '../../../../shared/hooks/useCurrentConversationId';
import type { NodeRendererProps } from 'react-arborist';
import type { FolderTreeNodeData } from '../../../components/folder-tree/types';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { modal } from '@/shared/lib/modal';
import { NodeContextMenu } from '../../explorer/components/node/NodeContextMenu';
import { NodeActionBar } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { useExplorerMenuItems } from '../../explorer/components/node/useExplorerMenuItems';
import { renderMenuItems } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { MenuEntryDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';

export const NotebookNode = ({
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isNotebook = node.data.data?.isNotebook;
  const isFile = node.data.type === 'file';
  const isFavorite =
    isFile &&
    favorites.some(
      (f) => f.target_id === node.data.id && f.target_type === 'conversation',
    );
  const url = isFile ? node.data.data?.external_url : undefined;
  const isCurrentConversation =
    isFile && node.data.id === currentConversationId;
  const isActive = node.isSelected;

  const handleClick = (e: React.MouseEvent) => {
    if (isFile && url) {
      e.preventDefault();
      node.select();
      navigateToConversation(node.data.id);
    } else if (isNotebook) {
      node.select();
      node.toggle();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (isFile && url) {
      navigateToConversation(node.data.id);
    } else if (isNotebook) {
      node.toggle();
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.toggle();
  };

  const handleOpenNotebook = () => {
    navigateToNotebook(node.data.id);
  };

  const handleHideNotebook = async () => {
    const confirmed = await modal.confirm({
      title: t('notebooks.hideNotebook'),
      content: t('notebooks.hideNotebookConfirm', { name: node.data.name }),
      confirmText: t('common.hide'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      await browser.runtime.sendMessage({
        type: 'HIDE_NOTEBOOK',
        payload: { id: node.data.id },
      });
      fetchData(true);
    }
  };

  const handleDeleteNotebook = async () => {
    const confirmed = await modal.confirm({
      title: t('notebooks.deleteNotebook'),
      content: t('notebooks.deleteNotebookConfirm', { name: node.data.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      // Call Gemini API to delete the notebook (rpcid: Nwkn9)
      try {
        window.dispatchEvent(
          new CustomEvent('GEMINI_API_EXECUTE', {
            detail: {
              rpcid: 'Nwkn9',
              payload: [`notebooks/${node.data.id}`],
              callbackEvent: `GEMINI_DELETE_NOTEBOOK_RESULT_${node.data.id}`,
            },
          }),
        );
      } catch {
        // non-critical
      }

      await browser.runtime.sendMessage({
        type: 'DELETE_NOTEBOOK',
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
    if (!checked && hasTag)
      await removeTagFromConversation(node.data.id, tagId);
  };

  const handleDeleteConversation = async () => {
    const { deleteItem } = useAppStore.getState();
    const confirmed = await modal.confirm({
      title: t('node.deleteItem'),
      content: t('node.deleteConfirm', { name: node.data.name }),
      confirmText: t('node.delete'),
      cancelText: t('common.cancel'),
    });
    if (confirmed) {
      await deleteItem(node.data.id, 'file');
    }
  };

  const toggleIcon = isNotebook ? (
    node.isOpen ? (
      <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronRight className="w-3 h-3" />
    )
  ) : null;

  const hasHoverActions = isFile || isNotebook;

  const notebookMenuItems: MenuEntryDef[] = isNotebook
    ? [
        {
          type: 'item' as const,
          key: 'open-notebook',
          icon: <NotebookText className="h-4 w-4" />,
          label: t('notebooks.openNotebook'),
          onClick: handleOpenNotebook,
        },
        {
          type: 'item' as const,
          key: 'open-new-tab',
          icon: <ExternalLink className="h-4 w-4" />,
          label: t('notebooks.openInNewTab'),
          onClick: () => {
            const nbUrl =
              node.data.data?.external_url ||
              `https://gemini.google.com/notebook/notebooks%2F${node.data.id}`;
            window.open(nbUrl, '_blank');
          },
        },
        { type: 'separator' as const, key: 'sep-manage' },
        {
          type: 'item' as const,
          key: 'hide-notebook',
          icon: <EyeOff className="h-4 w-4" />,
          label: t('notebooks.hideNotebook'),
          onClick: () => void handleHideNotebook(),
        },
        {
          type: 'item' as const,
          key: 'delete-notebook',
          icon: <Trash2 className="h-4 w-4" />,
          label: t('notebooks.deleteNotebook'),
          className: 'text-destructive focus:text-destructive',
          onClick: () => void handleDeleteNotebook(),
        },
      ]
    : [];

  const fileMenuItems = useExplorerMenuItems({
    node,
    isFavorite,
    folderColor: null,
    onDelete: handleDeleteConversation,
    onTagToggle: handleTagToggle,
    onColorChange: async () => {},
    onCreateFolder: async () => {},
    onToggleFavorite: (id: string, isFav: boolean) =>
      toggleFavorite(id, 'conversation', isFav),
  });

  const activeMenuItems = isNotebook
    ? notebookMenuItems
    : isFile
      ? fileMenuItems
      : [];
  const isMenuActive = isContextMenuOpen || isDropdownOpen;

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
    isMenuActive && 'bg-accent/50',
    isMenuActive && hasHoverActions && 'pr-8',
    isMenuActive && 'node-menu-active',
  );

  return (
    <ContextMenu onOpenChange={setIsContextMenuOpen} modal={false}>
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
            {isNotebook && (
              <span
                className="flex items-center justify-center w-4 h-4 shrink-0 cursor-pointer"
                onClick={handleToggle}
              >
                {toggleIcon}
              </span>
            )}

            {isNotebook && (
              <span className="flex items-center justify-center shrink-0">
                <NotebookText className="w-4 h-4" />
              </span>
            )}

            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-hidden">
              {isFavorite && (
                <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />
              )}
              <span className="truncate text-sm">{node.data.name}</span>
            </div>

            {hasHoverActions && (
              <NodeActionBar
                menuItems={activeMenuItems}
                forceVisible={isMenuActive}
                onDropdownOpenChange={setIsDropdownOpen}
              />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {isNotebook && (
        <ContextMenuContent className="z-[9999] w-48">
          {renderMenuItems(notebookMenuItems, 'context')}
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
