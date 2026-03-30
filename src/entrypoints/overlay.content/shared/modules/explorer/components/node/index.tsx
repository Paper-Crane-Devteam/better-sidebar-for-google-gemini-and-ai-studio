import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Folder as FolderIcon,
  MessageSquare,
  MessageSquarePlus,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Star,
  Calendar,
  Image,
  Settings,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { navigateToConversation } from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { modal } from '@/shared/lib/modal';
import { useI18n } from '@/shared/hooks/useI18n';
import { useCurrentConversationId } from '../../../../hooks/useCurrentConversationId';
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';

import { NodeProps } from './types';
import { NodeContent } from './NodeContent';
import { NodeContextMenu } from './NodeContextMenu';
import { FolderSettingsDialog } from './FolderSettingsDialog';
import { useDeleteHandler } from '../../hooks/useDeleteHandler';
import { useExplorerContext } from '../../ExplorerContext';

export const Node = ({ node, style, dragHandle, tree, preview }: NodeProps) => {
  const { t } = useI18n();
  const { onNewChat } = useExplorerContext();
  const {
    conversationTags,
    addTagToConversation,
    removeTagFromConversation,
    ui,
    toggleExplorerBatchSelection,
    setExplorerBatchSelection,
    favorites,
    toggleFavorite,
    createFolder,
    updateFolderColor,
    renameItem,
  } = useAppStore();
  const { handleDelete: deleteHandler } = useDeleteHandler();
  const currentConversationId = useCurrentConversationId();
  const [newName, setNewName] = useState(node.data.name);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const nodeRowRef = useRef<HTMLDivElement>(null);

  // Combine dragHandle and nodeRowRef into one callback ref
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      (nodeRowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (dragHandle) dragHandle(el);
    },
    [dragHandle],
  );

  // --- Derived state ---
  const isTimeGroup = node.data.data?.isTimeGroup;
  const isFile = node.data.type === 'file';
  const isFolder = node.data.type === 'folder';
  const isFavorite = favorites.some(
    (f) => f.target_id === node.data.id && f.target_type === 'conversation',
  );
  const folderColor = !isFile && !isTimeGroup ? node.data?.data?.color : null;
  const url = isFile ? node.data?.data?.external_url : undefined;

  // --- Batch selection state ---
  const { isBatchMode, selectedIds: batchSelectedIds } = ui.explorer.batch;
  let isBatchSelected = false;
  let isBatchIndeterminate = false;

  if (isTimeGroup) {
    const childrenIds = node.data.children?.map((c) => c.id) || [];
    const selectedChildrenCount = childrenIds.filter((id) =>
      batchSelectedIds.includes(id),
    ).length;
    isBatchSelected =
      childrenIds.length > 0 && selectedChildrenCount === childrenIds.length;
    isBatchIndeterminate =
      selectedChildrenCount > 0 && selectedChildrenCount < childrenIds.length;
  } else {
    isBatchSelected = batchSelectedIds.includes(node.data.id);
    // Compute indeterminate state for regular folder nodes
    if (isFolder && isBatchMode && !isBatchSelected) {
      const getAllDescendantIds = (folderId: string): string[] => {
        const ids: string[] = [];
        const { folders: allFolders, conversations: allConvs } = useAppStore.getState();
        for (const f of allFolders.filter((f) => f.parent_id === folderId)) {
          ids.push(f.id);
          ids.push(...getAllDescendantIds(f.id));
        }
        for (const c of allConvs.filter((c) => c.folder_id === folderId)) {
          ids.push(c.id);
        }
        return ids;
      };
      const descendantIds = getAllDescendantIds(node.data.id);
      isBatchIndeterminate =
        descendantIds.length > 0 &&
        descendantIds.some((id) => batchSelectedIds.includes(id));
    }
  }

  const isActive = node.isSelected || isBatchSelected;
  const isCurrentConversation =
    isFile && node.data.id === currentConversationId;
  const hasHoverActions =
    (isFile && !isBatchMode) ||
    (!isFile && !isTimeGroup && !isBatchMode);

  // --- Handlers ---
  useEffect(() => {
    setNewName(node.data.name);
  }, [node.data.name, node.isEditing]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    node.toggle();
  };

  const handleDelete = async () => {
    await deleteHandler([node.data.id]);
  };

  const handleCreateFolder = async (parentId: string) => {
    const newFolderId = await createFolder(t('node.newFolderName'), parentId);
    if (newFolderId) {
      tree.open(parentId);
      setTimeout(() => {
        tree.edit(newFolderId);
      }, 300);
    }
  };

  const handleTagToggle = async (tagId: string, checked: boolean) => {
    let targetIds = [node.data.id];
    if (node.isSelected && node.tree.selectedIds.size > 1) {
      targetIds = Array.from(node.tree.selectedIds).filter((id) => {
        const n = node.tree.get(id);
        return n && n.data.type === 'file';
      });
    }

    for (const id of targetIds) {
      const hasTag = conversationTags.some(
        (ct) => ct.conversation_id === id && ct.tag_id === tagId,
      );
      if (checked && !hasTag) await addTagToConversation(id, tagId);
      if (!checked && hasTag) await removeTagFromConversation(id, tagId);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isBatchMode) {
      e.preventDefault();
      if (isTimeGroup) {
        node.toggle();
      } else {
        toggleExplorerBatchSelection(node.data.id);
      }
      return;
    }

    if (url) {
      e.preventDefault();
      node.select();
      navigateToConversation(node.data.id);
    } else {
      node.select();
      node.toggle();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    if (isBatchMode) {
      if (isTimeGroup) {
        node.toggle();
      } else {
        toggleExplorerBatchSelection(node.data.id);
      }
      return;
    }

    if (url) {
      navigateToConversation(node.data.id);
    } else {
      node.toggle();
    }
  };

  const handleBatchToggle = () => {
    if (isTimeGroup) {
      const childrenIds = node.data.children?.map((c) => c.id) || [];
      if (childrenIds.length === 0) return;

      let newSelection = [...batchSelectedIds];
      if (isBatchSelected) {
        newSelection = newSelection.filter((id) => !childrenIds.includes(id));
      } else {
        const childrenSet = new Set(childrenIds);
        newSelection = newSelection.filter((id) => !childrenSet.has(id));
        newSelection = [...newSelection, ...childrenIds];
      }
      setExplorerBatchSelection(newSelection);
    } else {
      toggleExplorerBatchSelection(node.data.id);
    }
  };

  // --- Icons ---
  const FolderIconComponent = isTimeGroup
    ? Calendar
    : node.isOpen
      ? FolderOpen
      : FolderIcon;

  const toggleIcon = isFolder ? (
    node.isOpen ? (
      <ChevronDown className="w-3 h-3" />
    ) : (
      <ChevronRight className="w-3 h-3" />
    )
  ) : null;
  const folderIcon = (
    <FolderIconComponent
      className="w-4 h-4"
      style={{ color: folderColor || 'inherit' }}
    />
  );

  const fileIcon =
    node.data.data?.type === 'text-to-image' ? (
      <Image className="w-4 h-4" />
    ) : (
      <MessageSquare className="w-4 h-4" />
    );

  // --- Colored folder selected style ---
  const coloredSelectedStyle: React.CSSProperties | undefined =
    folderColor && isActive
      ? { backgroundColor: `${folderColor}26`, color: folderColor }
      : undefined;

  // --- CSS classes ---
  const nodeClasses = cn(
    // Base layout
    'flex items-center gap-1.5 px-1 pr-2 h-full',
    'cursor-pointer group relative',
    'no-underline outline-none rounded-sm',
    'text-density text-foreground/80 font-medium',
    // Hover: only apply default hover when not active and not current conversation
    !isActive && !isCurrentConversation && 'hover:bg-accent/50',
    // Selection state: use node-item-selected for non-colored, inline style for colored (highest priority)
    isActive && !folderColor && 'node-item-selected',
    // Current conversation state: lighter highlight when not actively selected (lower priority)
    !isActive && isCurrentConversation && 'node-item-current',
    // Expand right padding on hover to make room for action buttons
    hasHoverActions && isFile && 'group-hover:pr-8',
    hasHoverActions && !isFile && !isTimeGroup && 'group-hover:pr-14',
    // Drag-over state
    node.willReceiveDrop && 'bg-accent/50 border border-primary/40 rounded-sm',
    // Context menu open state
    isContextMenuOpen && !folderColor && 'bg-accent/50',
    isContextMenuOpen && hasHoverActions && isFile && 'pr-8',
    isContextMenuOpen && hasHoverActions && !isFile && !isTimeGroup && 'pr-14',
  );

  return (
    <ContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild disabled={isTimeGroup || isBatchMode}>
        <div
          style={style}
          className="outline-none h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]"
        >
          <div
            ref={combinedRef}
            role="button"
            tabIndex={0}
            className={nodeClasses}
            style={coloredSelectedStyle}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onContextMenu={(e) => {
              if (isBatchMode) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {/* Node content: checkbox, toggle, icon, name */}
            <NodeContent
              node={node}
              style={style}
              dragHandle={dragHandle}
              onToggleFavorite={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleFavorite(node.data.id, 'conversation', isFavorite);
              }}
              isBatchMode={isBatchMode}
              isBatchSelected={isBatchSelected}
              isBatchIndeterminate={isBatchIndeterminate}
              onToggleBatchSelection={handleBatchToggle}
              isFavorite={isFavorite}
              folderIcon={folderIcon}
              fileIcon={fileIcon}
              toggleIcon={toggleIcon}
              handleToggle={handleToggle}
              folderColor={folderColor}
              hoverRef={nodeRowRef}
              tree={tree}
              preview={preview}
              newName={newName}
              setNewName={setNewName}
            />

            {/* Hover action buttons */}
            <div
              className={cn(
                'hidden group-hover:flex items-center gap-1 absolute right-0 pr-2 top-0 bottom-0',
                'node-action-bar',
                isContextMenuOpen && 'flex',
              )}
              style={coloredSelectedStyle ? { backgroundColor: `color-mix(in srgb, ${folderColor} 15%, rgb(var(--background)))` } : undefined}
            >
              <div
                className="absolute inset-y-0 -left-6 w-6 pointer-events-none [background:inherit] [mask-image:linear-gradient(to_right,transparent,black)]"
                style={coloredSelectedStyle ? { backgroundColor: `color-mix(in srgb, ${folderColor} 15%, rgb(var(--background)))` } : undefined}
              />

              {/* New chat button for folders */}
              {!isFile && !isTimeGroup && !isBatchMode && onNewChat && (
                <SimpleTooltip content={t('tooltip.newChat')}>
                  <div
                    role="button"
                    className="h-5 w-5 flex items-center justify-center rounded-sm cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      node.select();
                      onNewChat();
                    }}
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </div>
                </SimpleTooltip>
              )}

              {/* Folder settings button */}
              {!isFile && !isTimeGroup && !isBatchMode && (
                <SimpleTooltip content={t('folderSettings.title')}>
                  <div
                    role="button"
                    className="h-5 w-5 flex items-center justify-center rounded-sm cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      let pendingName = node.data.name;
                      let pendingColor = folderColor;
                      const confirmed = await modal.confirm({
                        title: t('folderSettings.title'),
                        content: (
                          <FolderSettingsDialog
                            initialName={node.data.name}
                            initialColor={folderColor}
                            onSave={(name, color) => {
                              pendingName = name;
                              pendingColor = color;
                            }}
                          />
                        ),
                        confirmText: t('common.save'),
                        cancelText: t('common.cancel'),
                      });
                      if (confirmed) {
                        if (pendingName !== node.data.name) {
                          await renameItem(node.data.id, pendingName, 'folder');
                        }
                        if (pendingColor !== folderColor) {
                          await updateFolderColor(node.data.id, pendingColor);
                        }
                      }
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </div>
                </SimpleTooltip>
              )}
              {isFile && !isBatchMode && (
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
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      {!isTimeGroup && !isBatchMode && (
        <NodeContextMenu
          node={node}
          onToggleFavorite={(id: string, isFav: boolean) =>
            toggleFavorite(id, 'conversation', isFav)
          }
          onCreateFolder={handleCreateFolder}
          onDelete={handleDelete}
          onTagToggle={handleTagToggle}
          onColorChange={async (color: string | null) => {
            await updateFolderColor(node.data.id, color);
          }}
          isFavorite={isFavorite}
          folderColor={folderColor}
          style={style}
          dragHandle={dragHandle}
          tree={tree}
          preview={preview}
        />
      )}
    </ContextMenu>
  );
};
