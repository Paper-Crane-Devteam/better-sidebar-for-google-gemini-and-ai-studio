import React, { useState, useEffect, useRef } from 'react';
import {
  Folder as FolderIcon,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Eye,
  Star,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import {
  parsePromptVariables,
  substitutePromptVariables,
  hasImportReferences,
  resolveImports,
} from '@/shared/lib/prompt-variables';
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/entrypoints/overlay.content/shared/components/ui/context-menu';

import { NodeProps } from './types';
import { NodeContent } from './NodeContent';
import { NodeContextMenu } from './NodeContextMenu';
import { useDeleteHandler } from '../../hooks/useDeleteHandler';
import {
  VariableFillForm,
  type VariableFillFormRef,
} from '../VariableFillForm';

import { toast } from '@/shared/lib/toast';
import { NodeActionBar } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { ActionButtonDef } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import { usePromptsMenuItems } from './usePromptsMenuItems';

export const Node = ({
  node,
  style,
  dragHandle,
  tree,
  preview,
  onPreview,
  onEdit,
}: NodeProps) => {
  const { t } = useI18n();
  const {
    ui,
    togglePromptsBatchSelection,
    favorites,
    toggleFavorite,
    createPromptFolder,
    createPrompt,
  } = useAppStore();
  const { handleDelete: deleteHandler } = useDeleteHandler();
  const [newName, setNewName] = useState(node.data.name);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const variableFormRef = useRef<VariableFillFormRef | null>(null);

  const isFavorite = favorites.some(
    (f) => f.target_id === node.data.id && f.target_type === 'prompt',
  );
  const { isBatchMode, selectedIds: batchSelectedIds } = ui.prompts.batch;
  const isBatchSelected = batchSelectedIds.includes(node.data.id);

  // Compute indeterminate state for folder nodes
  let isBatchIndeterminate = false;
  if (node.data.type === 'folder' && isBatchMode && !isBatchSelected) {
    const getAllDescendantIds = (folderId: string): string[] => {
      const ids: string[] = [];
      const { promptFolders, prompts: allPrompts } = useAppStore.getState();
      for (const f of promptFolders.filter((f) => f.parent_id === folderId)) {
        ids.push(f.id);
        ids.push(...getAllDescendantIds(f.id));
      }
      for (const p of allPrompts.filter((p) => p.folder_id === folderId)) {
        ids.push(p.id);
      }
      return ids;
    };
    const descendantIds = getAllDescendantIds(node.data.id);
    isBatchIndeterminate =
      descendantIds.length > 0 &&
      descendantIds.some((id) => batchSelectedIds.includes(id));
  }

  const handleCreateFolder = async (parentId: string) => {
    const newFolderId = await createPromptFolder(t('node.newFolderName'), parentId);
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

  const isFile = node.data.type === 'file';

  const toggleIcon =
    node.data.type === 'folder' ? (
      node.isOpen ? (
        <ChevronDown className="w-3 h-3" />
      ) : (
        <ChevronRight className="w-3 h-3" />
      )
    ) : null;

  const folderIcon = <FolderIcon className="w-4 h-4 text-foreground/80" />;
  const fileIcon = <MessageSquare className="w-4 h-4" />;

  const handleView = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (onPreview) {
      onPreview(node.data.data);
    }
  };

  const handleEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (onEdit) {
      onEdit(node.data.data);
    }
  };

  const doCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success(t('prompts.promptCopiedToClipboard'), 1000);
  };

  const resolveContent = (content: string): string => {
    if (!hasImportReferences(content)) return content;
    const allPrompts = useAppStore.getState().prompts;
    return resolveImports(content, (title) => {
      const found = allPrompts.find((p) => p.title === title);
      return found?.content;
    });
  };

  const tryCopyContent = (content: string) => {
    if (!content) return;
    // Resolve @import references first
    const resolved = resolveContent(content);
    const variables = parsePromptVariables(resolved).filter(
      (v) => v.kind !== 'import',
    );
    if (variables.length > 0) {
      useModalStore.getState().open({
        type: 'confirm',
        title: t('prompts.fillVariablesTitle'),
        content: (
          <VariableFillForm ref={variableFormRef} variables={variables} />
        ),
        confirmText: t('prompts.copy'),
        cancelText: t('common.cancel'),
        onConfirm: () => {
          const values = variableFormRef.current?.getValues();
          if (values != null) {
            const filled = substitutePromptVariables(resolved, values);
            navigator.clipboard.writeText(filled);
            toast.success(t('prompts.promptCopiedToClipboard'), 1000);
          }
          useModalStore.getState().close();
        },
        onCancel: () => useModalStore.getState().close(),
      });
    } else {
      doCopy(resolved);
    }
  };

  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const content = node.data.data.content || '';
    tryCopyContent(content);
  };

  const handleDuplicate = async () => {
    const { title, content, type, icon, folder_id } = node.data.data;
    await createPrompt(
      t('prompts.copyOf', { title }),
      content,
      type,
      icon || '',
      folder_id,
    );
  };

  const menuItems = usePromptsMenuItems({
    node,
    isFavorite,
    onDelete: handleDelete,
    onCreateFolder: handleCreateFolder,
    onToggleFavorite: (id: string, isFav: boolean) =>
      toggleFavorite(id, 'prompt', isFav),
    onCopy: handleCopy,
    onDuplicate: handleDuplicate,
    onEdit: onEdit ? handleEdit : undefined,
  });

  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  const quickActions: ActionButtonDef[] = [];
  if (isFile && isFavorite) {
    quickActions.push({
      icon: <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />,
      tooltip: t('tooltip.removeFromFavorites'),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavorite(node.data.id, 'prompt', isFavorite);
      },
      className: 'text-yellow-400 hover:text-yellow-500',
    });
  }
  if (isFile && onPreview) {
    quickActions.push({
      icon: <Eye className="h-3.5 w-3.5" />,
      tooltip: t('prompts.viewPrompt'),
      onClick: handleView,
    });
  }

  const innerContent = (
    <>
      <NodeContent
        node={node}
        style={style}
        dragHandle={dragHandle}
        onToggleFavorite={(e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleFavorite(node.data.id, 'prompt', isFavorite);
        }}
        isBatchMode={isBatchMode}
        isBatchSelected={isBatchSelected}
        isBatchIndeterminate={isBatchIndeterminate}
        onToggleBatchSelection={() => togglePromptsBatchSelection(node.data.id)}
        isFavorite={isFavorite}
        folderIcon={folderIcon}
        fileIcon={fileIcon}
        toggleIcon={toggleIcon}
        handleToggle={handleToggle}
        tree={tree}
        preview={preview}
        newName={newName}
        setNewName={setNewName}
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
    'flex items-center gap-1.5 px-1 cursor-pointer group relative pr-2 h-full no-underline outline-none text-density rounded-sm font-medium text-foreground/80',
    !node.isEditing && (isFile ? 'group-hover:pr-14' : 'group-hover:pr-8'),
    !((node.isSelected && !isFile) || isBatchSelected) && 'hover:bg-accent/50',
    ((node.isSelected && !isFile) || isBatchSelected) && 'node-item-selected',
    node.willReceiveDrop && 'bg-accent/50 border border-primary/40 rounded-sm',
    isMenuActive && 'bg-accent/50',
    isMenuActive && (isFile ? 'pr-14' : 'pr-8'),
    isMenuActive && 'node-menu-active',
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
        className={commonClasses}
        onContextMenu={(e) => {
          if (isBatchMode) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          if (isBatchMode) {
            e.preventDefault();
            togglePromptsBatchSelection(node.data.id);
            return;
          }

          if (isFile) {
            // Copy on click for files (may open variable-fill modal)
            const content = node.data.data.content || '';
            tryCopyContent(content);
            return;
          }

          node.select();
          if (node.data.type === 'folder') {
            node.toggle();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if (isBatchMode) {
              togglePromptsBatchSelection(node.data.id);
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
    <ContextMenu onOpenChange={setIsContextMenuOpen} modal={false}>
      <ContextMenuTrigger asChild disabled={isBatchMode}>
        {content}
      </ContextMenuTrigger>
      {!isBatchMode && (
        <NodeContextMenu
          node={node}
          onToggleFavorite={(id: string, isFav: boolean) =>
            toggleFavorite(id, 'prompt', isFav)
          }
          onCreateFolder={handleCreateFolder}
          onDelete={handleDelete}
          isFavorite={isFavorite}
          style={style}
          dragHandle={dragHandle}
          tree={tree}
          preview={preview}
          onDuplicate={handleDuplicate}
          onCopy={handleCopy}
          onEditPrompt={onEdit ? handleEdit : undefined}
        />
      )}
    </ContextMenu>
  );
};
