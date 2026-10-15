import React, { useState, useRef, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Star,
  Trash2,
  Pin,
  PinOff,
  FolderInput,
} from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { cn } from '@/shared/lib/utils/utils';
import {
  navigateToConversation,
  navigateToNotebook,
  navigateToNewChat,
} from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useCurrentConversationId } from '../../../../shared/hooks/useCurrentConversationId';
import type { NodeRendererProps } from 'react-arborist';
import type { FolderTreeNodeData } from '../../../components/folder-tree/types';
import {
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { ExclusiveContextMenu } from '@/entrypoints/overlay.content/shared/components/ui/exclusive-context-menu';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import { NodeContextMenu } from '../../explorer/components/node/NodeContextMenu';
import { NodeActionBar } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { useExplorerMenuItems } from '../../explorer/components/node/useExplorerMenuItems';
import { renderMenuItems } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { MenuEntryDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { FolderTreeNodeContent } from '../../../components/folder-tree';
import { useNodeTooltip } from '../../../hooks/useNodeTooltip';
import { MoveItemsDialog } from '../../explorer/components/batch/MoveItemsDialog';
import { useShallow } from 'zustand/react/shallow';

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
  } = useAppStore(
    useShallow((s) => ({
      favorites: s.favorites,
      toggleFavorite: s.toggleFavorite,
      fetchData: s.fetchData,
      conversationTags: s.conversationTags,
      addTagToConversation: s.addTagToConversation,
      removeTagFromConversation: s.removeTagFromConversation,
    })),
  );
  const currentConversationId = useCurrentConversationId();
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newName, setNewName] = useState(node.data.name);
  const nodeRowRef = useRef<HTMLDivElement>(null);
  const { tooltipContent, forceShowTooltip } = useNodeTooltip(node);

  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      (nodeRowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (dragHandle) dragHandle(el);
    },
    [dragHandle],
  );

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

  const handleDeleteNotebook = async () => {
    const confirmed = await modal.confirmDelete({
      title: t('notebooks.deleteNotebook'),
      content: t('notebooks.deleteNotebookConfirm', { name: node.data.name }),
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

      // Navigate to new app blank page if currently viewing this notebook
      try {
        const path = decodeURIComponent(window.location.pathname);
        if (path.includes(`/notebook/${node.data.id}`) || path.includes(`/notebook/notebooks/${node.data.id}`)) {
          navigateToNewChat();
        }
      } catch {
        // non-critical
      }

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
    if (useSettingsStore.getState().skipDeleteConfirm ?? false) {
      await deleteItem(node.data.id, 'file');
      return;
    }
    const confirmed = await modal.confirmDelete({
      title: t('node.deleteItem'),
      content: t('node.deleteConfirm', { name: node.data.name }),
    });
    if (confirmed) {
      await deleteItem(node.data.id, 'file');
    }
  };

  const handleSetDefaultFolder = async () => {
    let targetFolderId: string | null = node.data.data?.default_folder_id || null;

    const confirmed = await modal.confirm({
      title: t('notebooks.setDefaultFolder'),
      content: (
        <MoveItemsDialog
          selectedIds={[]}
          onSelect={(id) => (targetFolderId = id)}
          initialSelectedId={targetFolderId}
        />
      ),
      modalClassName: 'max-w-xl',
      confirmText: t('common.save'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      await browser.runtime.sendMessage({
        type: 'UPDATE_NOTEBOOK',
        payload: { id: node.data.id, updates: { default_folder_id: targetFolderId } },
      });
      fetchData(true);
      toast.success(t('notebooks.defaultFolderSet'));
    }
  };

  const toggleIcon = isNotebook ? (
    node.isOpen ? (
      <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
    ) : (
      <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
    )
  ) : null;

  const hasHoverActions = isFile || isNotebook;

  const notebookMenuItems: MenuEntryDef[] = isNotebook
    ? [
        {
          type: 'item' as const,
          key: 'toggle-pin',
          icon: node.data.data?.is_pinned
            ? <PinOff className="h-4 w-4" />
            : <Pin className="h-4 w-4 rotate-45" />,
          label: node.data.data?.is_pinned ? t('node.unpinFromTop') : t('node.pinToTop'),
          onClick: () => {
            useAppStore.getState().togglePin(node.data.id, 'notebooks', !!node.data.data?.is_pinned);
          },
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
          key: 'set-default-folder',
          icon: <FolderInput className="h-4 w-4" />,
          label: t('notebooks.setDefaultFolder'),
          onClick: () => void handleSetDefaultFolder(),
        },
        { type: 'separator' as const, key: 'sep-delete' },
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
    isPinned: false,
    onDelete: handleDeleteConversation,
    onTagToggle: handleTagToggle,
    onColorChange: async () => {},
    onCreateFolder: async () => {},
    onToggleFavorite: (id: string, isFav: boolean) =>
      toggleFavorite(id, 'conversation', isFav),
    onTogglePin: () => {},
  });

  const activeMenuItems = isNotebook
    ? notebookMenuItems
    : isFile
      ? fileMenuItems
      : [];
  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  // --- Outer wrapper classes (visual states: hover, selected, etc.) ---
  const wrapperClasses = cn(
    'outline-none h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]',
    'rounded-md cursor-pointer',
    !isActive && !isCurrentConversation && 'hover:bg-accent/50',
    isActive && 'node-item-selected',
    !isActive && isCurrentConversation && 'node-item-current',
    node.willReceiveDrop && 'bg-accent/50 border border-primary/40',
    isMenuActive && 'bg-accent/50',
    isMenuActive && 'node-menu-active',
  );

  // --- Inner content classes (layout only) ---
  const nodeClasses = cn(
    'flex items-center gap-2 px-1 pr-2 h-full',
    'group relative',
    'no-underline outline-none',
    'text-density text-foreground/80 font-medium',
  );

  const searchQuery = useAppStore((state) => state.ui.notebooks.search.query);

  return (
    <ExclusiveContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          style={style}
          className={wrapperClasses}
        >
          <div
            ref={combinedRef}
            role="button"
            tabIndex={0}
            className={nodeClasses}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          >
            {/* Use shared FolderTreeNodeContent for both notebook headers and file children */}
            <FolderTreeNodeContent
              node={node}
              folderIcon={null}
              fileIcon={null}
              toggleIcon={toggleIcon}
              handleToggle={handleToggle}
              newName={newName}
              setNewName={setNewName}
              hoverRef={nodeRowRef}
              isPinned={isNotebook && !!node.data.data?.is_pinned}
              tooltipContent={tooltipContent}
              forceShowTooltip={forceShowTooltip}
              searchQuery={searchQuery}
            />

            {hasHoverActions && (
              <NodeActionBar
                actions={
                  isNotebook
                    ? [
                        // Unpin button for pinned notebooks — always shown, leftmost
                        ...(node.data.data?.is_pinned ? [{
                          icon: <Pin className="h-3.5 w-3.5 rotate-45 fill-current" />,
                          tooltip: t('node.unpinFromTop'),
                          onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            useAppStore.getState().togglePin(node.data.id, 'notebooks', true);
                          },
                          persistent: true,
                        }] : []),
                        {
                          icon: <UIcon icon="tabler:notebook" className="h-3.5 w-3.5" />,
                          tooltip: t('notebooks.newNotebookChat'),
                          onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleOpenNotebook();
                          },
                        },
                      ]
                    : isFile && isFavorite
                      ? [{
                          icon: <Star className="h-3.5 w-3.5 fill-highlight text-highlight" />,
                          tooltip: t('tooltip.removeFromFavorites'),
                          onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleFavorite(node.data.id, 'conversation', isFavorite);
                          },
                          className: 'text-highlight hover:text-highlight/80',
                          persistent: true,
                        }]
                      : []
                }
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
    </ExclusiveContextMenu>
  );
};
