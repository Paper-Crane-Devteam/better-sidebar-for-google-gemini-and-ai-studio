import React, { useState, useEffect } from 'react';
import {
  Folder as FolderIcon,
  MessageSquare,
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
import { navigate, navigateToConversation } from '@/shared/lib/navigation';
import { useAppStore } from '@/shared/lib/store';
import { modal } from '@/shared/lib/modal';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';

import { NodeProps } from './types';
import { NodeContent } from './NodeContent';
import { NodeContextMenu } from './NodeContextMenu';
import { FolderSettingsDialog } from './FolderSettingsDialog';
import { useDeleteHandler } from '../../hooks/useDeleteHandler';
import { platform } from 'os';

export const Node = ({ node, style, dragHandle, tree, preview }: NodeProps) => {
  const { t } = useI18n();
  const {
    deleteItem,
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
  const [newName, setNewName] = useState(node.data.name);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);

  const isTimeGroup = node.data.data?.isTimeGroup;
  const isFile = node.data.type === 'file';

  const isFavorite = favorites.some(
    (f) => f.target_id === node.data.id && f.target_type === 'conversation',
  );
  const { isBatchMode, selectedIds: batchSelectedIds } = ui.explorer.batch;

  // Calculate selection state
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
  }

  const handleCreateFolder = async (parentId: string) => {
    const newFolderId = await createFolder(t('node.newFolder'), parentId);
    if (newFolderId) {
      tree.open(parentId);
      setTimeout(() => {
        tree.edit(newFolderId);
      }, 300);
    }
  };

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

  const handleTagToggle = async (tagId: string, checked: boolean) => {
    let targetIds = [node.data.id];
    if (node.isSelected && node.tree.selectedIds.size > 1) {
      targetIds = Array.from(node.tree.selectedIds).filter((id) => {
        const n = node.tree.get(id);
        return n && n.data.type === 'file';
      });
    }

    const shouldAdd = checked;

    for (const id of targetIds) {
      const hasTag = conversationTags.some(
        (ct) => ct.conversation_id === id && ct.tag_id === tagId,
      );

      if (shouldAdd) {
        if (!hasTag) await addTagToConversation(id, tagId);
      } else {
        if (hasTag) await removeTagFromConversation(id, tagId);
      }
    }
  };

  const FolderIconComponent = isTimeGroup
    ? Calendar
    : node.isOpen
      ? FolderOpen
      : FolderIcon;

  // Get folder color from data
  const folderColor = !isFile && !isTimeGroup ? node.data?.data?.color : null;

  const url = isFile ? node.data?.data?.external_url : undefined;

  const toggleIcon =
    node.data.type === 'folder' ? (
      node.isOpen ? (
        <ChevronDown className="w-3 h-3" />
      ) : (
        <ChevronRight className="w-3 h-3" />
      )
    ) : null;

  const folderIcon = (
    <FolderIconComponent
      className={folderColor ? 'w-4 h-4' : 'w-4 h-4 text-foreground/80'}
      style={folderColor ? { color: folderColor } : undefined}
    />
  );
  const fileIcon =
    node.data.data?.type === 'text-to-image' ? (
      <Image className="w-4 h-4" />
    ) : (
      <MessageSquare className="w-4 h-4" />
    );

  const innerContent = (
    <>
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
        onToggleBatchSelection={() => {
          if (isTimeGroup) {
            const childrenIds = node.data.children?.map((c) => c.id) || [];
            if (childrenIds.length === 0) return;

            let newSelection = [...batchSelectedIds];
            if (isBatchSelected) {
              // Deselect all children
              newSelection = newSelection.filter(
                (id) => !childrenIds.includes(id),
              );
            } else {
              // Select all children
              const childrenSet = new Set(childrenIds);
              newSelection = newSelection.filter((id) => !childrenSet.has(id)); // Remove existing to avoid dupes
              newSelection = [...newSelection, ...childrenIds];
            }
            setExplorerBatchSelection(newSelection);
          } else {
            toggleExplorerBatchSelection(node.data.id);
          }
        }}
        isFavorite={isFavorite}
        folderIcon={folderIcon}
        fileIcon={fileIcon}
        toggleIcon={toggleIcon}
        handleToggle={handleToggle}
        folderColor={folderColor}
        tree={tree}
        preview={preview}
        newName={newName}
        setNewName={setNewName}
      />
      {/* Hover Actions */}
      <div
        className={cn(
          'hidden group-hover:flex items-center gap-1 absolute right-2',
          isContextMenuOpen && 'flex',
        )}
      >
        {/* Folder settings button */}
        {!isFile && !isTimeGroup && !isBatchMode && (
          <SimpleTooltip content={t('folderSettings.title')}>
            <div
              role="button"
              className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted/50 cursor-pointer text-muted-foreground hover:text-foreground transition-colors font-medium"
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
        {isFile && !isFavorite && !isBatchMode && (
          <SimpleTooltip content={t('tooltip.addToFavorites')}>
            <div
              role="button"
              className="h-5 w-5 flex items-center justify-center rounded-sm hover:bg-muted/50 cursor-pointer text-muted-foreground hover:text-foreground transition-colors font-medium"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                toggleFavorite(node.data.id, 'conversation', isFavorite);
              }}
            >
              <Star className="h-3.5 w-3.5" />
            </div>
          </SimpleTooltip>
        )}
      </div>
    </>
  );

  const commonClasses = cn(
    'flex items-center gap-1.5 px-1 cursor-pointer group relative pr-2 h-full no-underline outline-none text-density rounded-sm text-foreground/80',
    !(node.isSelected || isBatchSelected) && 'hover:bg-accent/50',
    ((isFile && !isFavorite) || (!isFile && !isTimeGroup)) &&
      'group-hover:pr-8',
    (node.isSelected || isBatchSelected) && 'node-item-selected',
    'font-medium',
    node.willReceiveDrop && 'bg-accent/50 border border-primary/40 rounded-sm',
    isContextMenuOpen && 'bg-accent/50',
    isContextMenuOpen &&
      ((isFile && !isFavorite) || (!isFile && !isTimeGroup)) &&
      'pr-8',
  );

  const content = (
    <div
      style={style}
      className={cn(
        'outline-none',
        'h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]',
      )}
    >
      <div
        ref={dragHandle}
        role="button"
        tabIndex={0}
        className={cn(commonClasses)}
        onContextMenu={(e) => {
          if (isBatchMode) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
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
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
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
          }
        }}
      >
        {innerContent}
      </div>
    </div>
  );

  return (
    <ContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild disabled={isTimeGroup || isBatchMode}>
        {content}
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
