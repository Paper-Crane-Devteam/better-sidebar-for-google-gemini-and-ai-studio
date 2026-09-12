import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Folder as FolderIcon,
  ChevronRight,
  ChevronDown,
  Star,
  FilePlus,
  Pencil,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';
import { ExclusiveContextMenu } from '@/entrypoints/overlay.content/shared/components/ui/exclusive-context-menu';

import { FolderTreeNodeContent } from '../../../../components/folder-tree';
import { NodeContextMenu } from './NodeContextMenu';
import { useDeleteHandler } from '../../hooks/useDeleteHandler';

import { toast } from '@/shared/lib/toast';
import { modal } from '@/shared/lib/modal';
import { SnippetMoveDialog } from '../SnippetMoveDialog';
import { NodeActionBar } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { ActionButtonDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { useSnippetMenuItems } from './useSnippetMenuItems';
import { useExport } from '../../../../features/export';
import { snippetDragBus } from '../../snippet-drag-bus';
import type { NodeRendererProps } from '../../../../components/folder-tree/types';
import type { FolderTreeNodeData } from '../../../../components/folder-tree/types';
import type { ExportFormat } from '../../../../features/export/types';

interface SnippetNodeProps extends NodeRendererProps<FolderTreeNodeData> {
  onPreview?: (snippet: any) => void;
  onEdit?: (snippet: any) => void;
  onCreateInFolder?: (folderId: string) => void;
}

export const SnippetNode = ({
  node,
  style,
  dragHandle,
  tree,
  preview,
  onPreview,
  onEdit,
  onCreateInFolder,
}: SnippetNodeProps) => {
  const { t } = useI18n();
  const {
    ui,
    toggleSnippetsBatchSelection,
    createSnippetFolder,
    favorites,
    toggleFavorite,
    moveSnippetItem,
  } = useAppStore();
  const { handleDelete: deleteHandler } = useDeleteHandler();
  const { exportItem } = useExport();
  const [newName, setNewName] = useState(node.data.name);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Disable drag when node is in editing (rename) mode so user can drag-select text
  // Also captures a ref for hover tooltip detection
  // (combinedRef is defined below after quickActions/tooltipContent)

  const { isBatchMode, selectedIds: batchSelectedIds } = ui.snippets.batch;
  const isBatchSelected = batchSelectedIds.includes(node.data.id);

  const isFile = node.data.type === 'file';
  const isFavorite = isFile && favorites.some(
    (f) => f.target_id === node.data.id && f.target_type === 'snippet',
  );

  const handleCreateFolder = async (parentId: string) => {
    const newFolderId = await createSnippetFolder(t('node.newFolderName'), parentId);
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

  const toggleIcon =
    node.data.type === 'folder' ? (
      node.isOpen ? (
        <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
      ) : (
        <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
      )
    ) : null;

  const folderIcon = <FolderIcon className="w-4 h-4 text-foreground/80" />;
  const fileIcon = null;

  const handleEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (onEdit) {
      onEdit(node.data.data);
    }
  };

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const content = node.data.data.content || '';
    if (content) {
      navigator.clipboard.writeText(content);
      toast.success(t('snippets.copiedToClipboard'), 1000);
    }
  };

  const handleMoveTo = async () => {
    let targetFolderId: string | null = null;

    // For folders, exclude the folder itself and all its descendants
    // to prevent circular moves
    let excludeIds = [node.data.id];
    if (node.data.type === 'folder') {
      const { snippetFolders } = useAppStore.getState();
      const getDescendantIds = (parentId: string): string[] => {
        const children = snippetFolders.filter((f) => f.parent_id === parentId);
        return children.flatMap((c) => [c.id, ...getDescendantIds(c.id)]);
      };
      excludeIds = [node.data.id, ...getDescendantIds(node.data.id)];
    }

    const confirmed = await modal.confirm({
      title: t('batch.moveTitle'),
      content: (
        <SnippetMoveDialog
          selectedIds={excludeIds}
          onSelect={(id) => (targetFolderId = id)}
        />
      ),
      modalClassName: 'max-w-xl',
      confirmText: t('common.move'),
      cancelText: t('common.cancel'),
    });

    if (confirmed) {
      await moveSnippetItem(node.data.id, targetFolderId, node.data.type);
    }
  };

  const handleExport = (format: ExportFormat) => {
    const snippet = node.data.data;
    exportItem(
      {
        id: snippet.id,
        title: snippet.title || t('common.untitled'),
        content: snippet.content || '',
        sourceUrl: snippet.source_url,
        createdAt: snippet.created_at,
        updatedAt: snippet.updated_at,
      },
      format,
    );
  };

  const handlePreview = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (onPreview) {
      onPreview(node.data.data);
    }
  };

  const menuItems = useSnippetMenuItems({
    node,
    isPinned: !!node.data.data?.is_pinned,
    isFavorite,
    onDelete: handleDelete,
    onCreateFolder: handleCreateFolder,
    onTogglePin: (id: string, isPinned: boolean) =>
      useAppStore.getState().togglePin(id, 'snippet_folders', isPinned),
    onToggleFavorite: (id: string, isFav: boolean) =>
      toggleFavorite(id, 'snippet', isFav),
    onMoveTo: handleMoveTo,
    onCopy: handleCopy,
    onEdit: onEdit ? handleEdit : undefined,
    onPreview: onPreview ? handlePreview : undefined,
    onExport: isFile ? handleExport : undefined,
  });

  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  const nodeRowRef = useRef<HTMLDivElement>(null);

  // Combine dragHandle and nodeRowRef
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      (nodeRowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (dragHandle) dragHandle(node.isEditing ? null : el);
    },
    [dragHandle, node.isEditing],
  );

  const quickActions: ActionButtonDef[] = [];

  if (isFile) {
    // Edit button for files
    if (onEdit) {
      quickActions.push({
        icon: <Pencil className="h-3.5 w-3.5" />,
        tooltip: t('common.edit'),
        onClick: (e) => {
          e.stopPropagation();
          e.preventDefault();
          handleEdit(e);
        },
      });
    }
    // Favorite star for favorited files
    if (isFavorite) {
      quickActions.push({
        icon: <Star className="h-3.5 w-3.5 fill-highlight text-highlight" />,
        tooltip: t('node.removeFromFavorites'),
        onClick: (e) => {
          e?.stopPropagation();
          e?.preventDefault();
          toggleFavorite(node.data.id, 'snippet', true);
        },
        className: 'text-highlight hover:text-highlight/80',
      });
    }
  } else {
    // New prompt button for folders
    if (onCreateInFolder) {
      quickActions.push({
        icon: <FilePlus className="h-3.5 w-3.5" />,
        tooltip: t('tooltip.newPrompt'),
        onClick: (e) => {
          e.stopPropagation();
          e.preventDefault();
          node.select();
          onCreateInFolder(node.data.id);
        },
      });
    }
  }

  // Tooltip content for file nodes: show full title + snippet content
  const snippetContent = isFile ? (node.data.data?.content || '') : '';
  const tooltipContent = isFile
    ? (isOverflowing: boolean) => (
        <div className="max-h-[200px] overflow-y-auto custom-scrollbar-inverted">
          {isOverflowing && (
            <div className="font-medium mb-1">{node.data.name}</div>
          )}
          {snippetContent && (
            <div className="whitespace-pre-wrap text-xs opacity-90">
              {snippetContent.length > 300 ? snippetContent.slice(0, 300) + '…' : snippetContent}
            </div>
          )}
        </div>
      )
    : undefined;

  const searchQuery = ui.snippets.search.query;

  const innerContent = (
    <>
      <FolderTreeNodeContent
        node={node}
        folderIcon={folderIcon}
        fileIcon={fileIcon}
        toggleIcon={toggleIcon}
        handleToggle={handleToggle}
        batchMode={isBatchMode ? {
          enabled: true,
          selected: isBatchSelected,
          indeterminate: false,
          onToggle: () => toggleSnippetsBatchSelection(node.data.id),
        } : undefined}
        newName={newName}
        setNewName={setNewName}
        searchQuery={searchQuery}
        hoverRef={nodeRowRef}
        tooltipContent={tooltipContent}
        forceShowTooltip={isFile && !!snippetContent}
      />
      {/* Action bar with three-dot menu – hidden while renaming */}
      {!isBatchMode && !node.isEditing && (
        <NodeActionBar
          actions={quickActions}
          menuItems={menuItems}
          forceVisible={isMenuActive}
          onDropdownOpenChange={setIsDropdownOpen}
        />
      )}
    </>
  );

  const commonClasses = cn(
    'flex items-center gap-1.5 px-1 cursor-pointer group relative pr-2 h-full no-underline outline-none text-density font-medium text-foreground/80',
    !(node.isSelected || isBatchSelected) && 'hover:bg-accent/50',
    (node.isSelected || isBatchSelected) && 'node-item-selected',
    !isFile && node.data.data?.is_pinned && 'node-item-pinned',
    isFile && isFavorite && 'node-item-favorited',
    node.willReceiveDrop && 'bg-accent/50 border border-primary/40',
    isMenuActive && 'bg-accent/50',
    isMenuActive && 'node-menu-active',
  );

  const content = (
    <div
      style={style}
      className={cn(
        'outline-none',
        'h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]',
      )}
      onContextMenu={(e) => {
        // Stop propagation to prevent the outer SnippetsTab ExclusiveContextMenu
        // from intercepting the event and closing this node's context menu
        if (isBatchMode) {
          e.preventDefault();
        }
        e.stopPropagation();
      }}
      onPointerEnter={() => {
        if (!isFile) {
          snippetDragBus.setDropTarget(node.data.id);
        }
      }}
      onPointerLeave={() => {
        if (!isFile && snippetDragBus.currentDropTarget === node.data.id) {
          snippetDragBus.clearDropTarget();
        }
      }}
    >
      <div
        ref={combinedRef}
        role="button"
        tabIndex={0}
        className={commonClasses}
        onClick={(e) => {
          if (isBatchMode) {
            e.preventDefault();
            toggleSnippetsBatchSelection(node.data.id);
            return;
          }

          if (isFile) {
            // View on click for snippet files
            if (onPreview) onPreview(node.data.data);
            return;
          }

          node.select();
          if (node.data.type === 'folder') {
            node.toggle();
          }
        }}
        onKeyDown={(e) => {
          if (node.isEditing) return;
          if (e.key === 'Enter' || e.key === ' ') {
            if (isBatchMode) {
              toggleSnippetsBatchSelection(node.data.id);
              return;
            }
            if (node.data.type === 'folder') {
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
    <ExclusiveContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild disabled={isBatchMode}>
        {content}
      </ContextMenuTrigger>
      {!isBatchMode && (
        <NodeContextMenu
          node={node}
          onCreateFolder={handleCreateFolder}
          onDelete={handleDelete}
          onCopy={handleCopy}
          onEditSnippet={onEdit ? handleEdit : undefined}
          onPreviewSnippet={onPreview ? handlePreview : undefined}
          isFavorite={isFavorite}
          isPinned={!!node.data.data?.is_pinned}
          onToggleFavorite={(id: string, isFav: boolean) =>
            toggleFavorite(id, 'snippet', isFav)
          }
          onTogglePin={(id: string, isPinned: boolean) =>
            useAppStore.getState().togglePin(id, 'snippet_folders', isPinned)
          }
          onMoveTo={handleMoveTo}
          onExport={isFile ? handleExport : undefined}
        />
      )}
    </ExclusiveContextMenu>
  );
};
