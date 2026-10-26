import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FolderCog, FolderInput, Pin, PinOff, Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { navigateToConversation } from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { modal } from '@/shared/lib/modal';
import type { CollectionScope } from '@/shared/types/db';
import { useCurrentConversationId } from '../../../shared/hooks/useCurrentConversationId';
import {
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { ExclusiveContextMenu } from '@/entrypoints/overlay.content/shared/components/ui/exclusive-context-menu';
import {
  NodeActionBar,
  renderMenuItems,
} from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type {
  ActionButtonDef,
  MenuEntryDef,
} from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { FolderTreeNodeContent } from '../../components/folder-tree';
import type { FolderTreeNodeData, NodeRendererProps } from '../../components/folder-tree';
import { NodeContextMenu } from '../explorer/components/node/NodeContextMenu';
import { useExplorerMenuItems } from '../explorer/components/node/useExplorerMenuItems';
import { useNodeTooltip } from '../../hooks/useNodeTooltip';
import { useShallow } from 'zustand/react/shallow';
import { moveToCollectionFolder, setDefaultLibraryFolder } from './collection-actions';
import { isCollectionItemNode } from './collection-tree';

/** Menu entries every gem/notebook row has; the panel decides where they go. */
export interface SharedItemMenu {
  pin: MenuEntryDef;
  moveToFolder: MenuEntryDef;
  setDefaultFolder: MenuEntryDef;
}

export interface CollectionItemNodeProps extends NodeRendererProps<FolderTreeNodeData> {
  scope: CollectionScope;
  /** Full menu of a gem/notebook row, built around the shared entries */
  buildItemMenu: (shared: SharedItemMenu) => MenuEntryDef[];
  /** Hover buttons of a gem/notebook row (the unpin button is added in front) */
  itemActions: ActionButtonDef[];
  searchQuery?: string;
}

/**
 * A gem/notebook row, or one of its conversations. Everything the two panels
 * have in common lives here; GemNode / NotebookNode only add their own menu
 * entries and hover buttons.
 */
export const CollectionItemNode = ({
  node,
  style,
  dragHandle,
  tree,
  preview,
  scope,
  buildItemMenu,
  itemActions,
  searchQuery,
}: CollectionItemNodeProps) => {
  const { t } = useI18n();
  const {
    favorites,
    toggleFavorite,
    conversationTags,
    addTagToConversation,
    removeTagFromConversation,
  } = useAppStore(
    useShallow((s) => ({
      favorites: s.favorites,
      toggleFavorite: s.toggleFavorite,
      conversationTags: s.conversationTags,
      addTagToConversation: s.addTagToConversation,
      removeTagFromConversation: s.removeTagFromConversation,
    })),
  );
  const currentConversationId = useCurrentConversationId();
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newName, setNewName] = useState(node.data.name);
  const rowRef = useRef<HTMLDivElement>(null);
  const { tooltipContent, forceShowTooltip } = useNodeTooltip(node);

  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      dragHandle?.(el);
    },
    [dragHandle],
  );

  const isItem = isCollectionItemNode(node.data);
  const isFile = node.data.type === 'file';
  const isPinned = isItem && !!node.data.data?.is_pinned;
  const isFavorite =
    isFile &&
    favorites.some((f) => f.target_id === node.data.id && f.target_type === 'conversation');
  const url = isFile ? node.data.data?.external_url : undefined;
  const isCurrentConversation = isFile && node.data.id === currentConversationId;
  const isActive = node.isSelected;

  const open = () => {
    if (isFile && url) navigateToConversation(node.data.id);
    else if (isItem) node.toggle();
  };

  const togglePin = () => useAppStore.getState().togglePin(node.data.id, scope, isPinned);

  const handleTagToggle = async (tagId: string, checked: boolean) => {
    const hasTag = conversationTags.some(
      (ct) => ct.conversation_id === node.data.id && ct.tag_id === tagId,
    );
    if (checked && !hasTag) await addTagToConversation(node.data.id, tagId);
    if (!checked && hasTag) await removeTagFromConversation(node.data.id, tagId);
  };

  const handleDeleteConversation = async () => {
    const { deleteItem } = useAppStore.getState();
    if (!(useSettingsStore.getState().skipDeleteConfirm ?? false)) {
      const confirmed = await modal.confirmDelete({
        title: t('node.deleteItem'),
        content: t('node.deleteConfirm', { name: node.data.name }),
      });
      if (!confirmed) return;
    }
    await deleteItem(node.data.id, 'file');
  };

  const currentFolderId: string | null = isItem ? (node.data.data?.folder_id ?? null) : null;
  const itemMenuItems: MenuEntryDef[] = isItem
    ? buildItemMenu({
        pin: {
          type: 'item',
          key: 'toggle-pin',
          icon: isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4 rotate-45" />,
          label: isPinned ? t('node.unpinFromTop') : t('node.pinToTop'),
          onClick: () => void togglePin(),
        },
        moveToFolder: {
          type: 'item',
          key: 'move-to-folder',
          icon: <FolderInput className="h-4 w-4" />,
          label: t('collections.moveToFolder'),
          onClick: () =>
            void moveToCollectionFolder(scope, {
              kind: 'item',
              id: node.data.id,
              currentFolderId,
            }),
        },
        setDefaultFolder: {
          type: 'item',
          key: 'set-default-folder',
          // Move-to-folder took FolderInput (as in the Library), so the Library
          // default-folder setting gets its own icon.
          icon: <FolderCog className="h-4 w-4" />,
          label: t(scope === 'gems' ? 'gems.setDefaultFolder' : 'notebooks.setDefaultFolder'),
          onClick: () =>
            void setDefaultLibraryFolder(
              scope,
              node.data.id,
              node.data.data?.default_folder_id ?? null,
            ),
        },
      })
    : [];

  const fileMenuItems = useExplorerMenuItems({
    node,
    isFavorite,
    folderColor: null,
    isPinned: false,
    onDelete: handleDeleteConversation,
    onTagToggle: handleTagToggle,
    onColorChange: async () => {},
    onCreateFolder: async () => {},
    onToggleFavorite: (id: string, isFav: boolean) => toggleFavorite(id, 'conversation', isFav),
    onTogglePin: () => {},
  });

  const actions: ActionButtonDef[] = isItem
    ? [
        // Unpin for pinned rows — always shown, leftmost
        ...(isPinned
          ? [
              {
                icon: <Pin className="h-3.5 w-3.5 rotate-45 fill-current" />,
                tooltip: t('node.unpinFromTop'),
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  void togglePin();
                },
                persistent: true,
              },
            ]
          : []),
        ...itemActions,
      ]
    : isFavorite
      ? [
          {
            icon: <Star className="h-3.5 w-3.5 fill-highlight text-highlight" />,
            tooltip: t('tooltip.removeFromFavorites'),
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              e.preventDefault();
              toggleFavorite(node.data.id, 'conversation', isFavorite);
            },
            className: 'text-highlight hover:text-highlight/80',
            persistent: true,
          },
        ]
      : [];

  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  const toggleIcon = isItem ? (
    node.isOpen ? (
      <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
    ) : (
      <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
    )
  ) : null;

  return (
    <ExclusiveContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          style={style}
          className={cn(
            'outline-none h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]',
            'rounded-md cursor-pointer',
            !isActive && !isCurrentConversation && 'hover:bg-accent/50',
            isActive && 'node-item-selected',
            !isActive && isCurrentConversation && 'node-item-current',
            node.willReceiveDrop && 'bg-accent/50 border border-primary/40',
            isMenuActive && 'bg-accent/50 node-menu-active',
          )}
        >
          <div
            ref={combinedRef}
            role="button"
            tabIndex={0}
            className="flex items-center gap-2 px-1 pr-2 h-full group relative no-underline outline-none text-density text-foreground/80 font-medium"
            onClick={(e) => {
              if (isFile && url) e.preventDefault();
              if ((isFile && url) || isItem) node.select();
              open();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') open();
            }}
          >
            <FolderTreeNodeContent
              node={node}
              folderIcon={null}
              fileIcon={null}
              toggleIcon={toggleIcon}
              handleToggle={(e) => {
                e.stopPropagation();
                node.toggle();
              }}
              newName={newName}
              setNewName={setNewName}
              hoverRef={rowRef}
              isPinned={isPinned}
              tooltipContent={tooltipContent}
              forceShowTooltip={forceShowTooltip}
              searchQuery={searchQuery}
            />
            {(isFile || isItem) && (
              <NodeActionBar
                actions={actions}
                menuItems={isItem ? itemMenuItems : fileMenuItems}
                forceVisible={isMenuActive}
                onDropdownOpenChange={setIsDropdownOpen}
              />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      {isItem && (
        <ContextMenuContent className="z-[9999] w-48">
          {renderMenuItems(itemMenuItems, 'context')}
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
    </ExclusiveContextMenu>
  );
};
