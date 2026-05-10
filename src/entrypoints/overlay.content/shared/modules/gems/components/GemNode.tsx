import React, { useState, useRef, useCallback } from 'react';
import {
  Gem,
  ChevronRight,
  ChevronDown,
  Edit2,
  Copy,
  Trash2,
  ExternalLink,
  Star,
  MessageSquarePlus,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { navigateToConversation, navigateToGem, navigate } from '@/shared/lib/navigation';
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
import { FolderTreeNodeContent } from '../../../components/folder-tree';

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newName, setNewName] = useState(node.data.name);
  const nodeRowRef = useRef<HTMLDivElement>(null);

  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      (nodeRowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (dragHandle) dragHandle(el);
    },
    [dragHandle],
  );

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
      // Call Gemini API to delete the gem
      try {
        window.dispatchEvent(
          new CustomEvent('GEMINI_API_EXECUTE', {
            detail: {
              rpcid: 'UXcSJb',
              payload: [node.data.id],
              callbackEvent: `GEMINI_DELETE_GEM_RESULT_${node.data.id}`,
            },
          }),
        );
      } catch {
        // non-critical
      }

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

  const toggleIcon = isGem ? (
    node.isOpen ? (
      <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronRight className="w-3 h-3" />
    )
  ) : null;

  const hasHoverActions = isFile || isGem;

  // Menu items for gem nodes
  const gemMenuItems: MenuEntryDef[] = isGem ? [
    // — Primary action —
    {
      type: 'item' as const,
      key: 'new-gem-chat',
      icon: <MessageSquarePlus className="h-4 w-4" />,
      label: t('gems.newGemChat'),
      onClick: () => {
        navigateToGem(node.data.id);
      },
    },
    // — Navigation —
    {
      type: 'item' as const,
      key: 'open-gem',
      icon: <Gem className="h-4 w-4" />,
      label: t('gems.openGem'),
      onClick: () => {
        const gemUrl = node.data.data?.external_url;
        if (gemUrl) navigateToGem(gemUrl);
      },
    },
    {
      type: 'item' as const,
      key: 'open-new-tab',
      icon: <ExternalLink className="h-4 w-4" />,
      label: t('gems.openInNewTab'),
      onClick: () => {
        const gemUrl = node.data.data?.external_url;
        if (gemUrl) window.open(gemUrl, '_blank');
      },
    },
    { type: 'separator' as const, key: 'sep-nav' },
    // — Manage —
    {
      type: 'item' as const,
      key: 'edit-gem',
      icon: <Edit2 className="h-4 w-4" />,
      label: t('gems.editGem'),
      onClick: () => {
        navigate(`https://gemini.google.com/gems/edit/${node.data.id}`);
      },
    },
    {
      type: 'item' as const,
      key: 'copy-gem',
      icon: <Copy className="h-4 w-4" />,
      label: t('gems.copyGem'),
      onClick: () => {
        navigate(`https://gemini.google.com/gems/copy/${node.data.id}`);
      },
    },
    { type: 'separator' as const, key: 'sep-manage' },
    // — Destructive —
    {
      type: 'item' as const,
      key: 'delete-gem',
      icon: <Trash2 className="h-4 w-4" />,
      label: t('gems.deleteGem'),
      className: 'text-destructive focus:text-destructive',
      onClick: () => void handleDeleteGem(),
    },
  ] : [];

  // Menu items for conversation files (reuse explorer menu items)
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

  const activeMenuItems = isGem ? gemMenuItems : isFile ? fileMenuItems : [];
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
            ref={combinedRef}
            role="button"
            tabIndex={0}
            className={nodeClasses}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          >
            {/* Use shared FolderTreeNodeContent for both gem headers and file children */}
            <FolderTreeNodeContent
              node={node}
              folderIcon={isGem ? <Gem className="w-4 h-4" /> : null}
              fileIcon={null}
              toggleIcon={toggleIcon}
              handleToggle={handleToggle}
              newName={newName}
              setNewName={setNewName}
              hoverRef={nodeRowRef}
            />

            {/* Action bar with three-dot menu */}
            {hasHoverActions && (
              <NodeActionBar
                actions={isFile && isFavorite ? [{
                  icon: <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />,
                  tooltip: t('tooltip.removeFromFavorites'),
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                    toggleFavorite(node.data.id, 'conversation', isFavorite);
                  },
                  className: 'text-yellow-400 hover:text-yellow-500',
                }] : []}
                menuItems={activeMenuItems}
                forceVisible={isMenuActive}
                onDropdownOpenChange={setIsDropdownOpen}
              />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {/* Context menu - reuses same menu items as the three-dot dropdown */}
      {isGem && (
        <ContextMenuContent className="z-[9999] w-48">
          {renderMenuItems(gemMenuItems, 'context')}
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
