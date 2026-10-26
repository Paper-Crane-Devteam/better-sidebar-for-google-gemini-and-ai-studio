import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit2,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import type { CollectionScope } from '@/shared/types/db';
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
import { deleteCollectionFolder, moveToCollectionFolder } from './collection-actions';

interface CollectionFolderNodeProps extends NodeRendererProps<FolderTreeNodeData> {
  scope: CollectionScope;
}

/** A user folder row in the Gems / Notebooks panel. */
export const CollectionFolderNode = ({
  node,
  style,
  dragHandle,
  tree,
  scope,
}: CollectionFolderNodeProps) => {
  const { t } = useI18n();
  const searchQuery = useAppStore((s) => s.ui[scope].search.query);
  const [newName, setNewName] = useState(node.data.name);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const isPinned = !!node.data.data?.is_pinned;

  useEffect(() => {
    setNewName(node.data.name);
  }, [node.data.name, node.isEditing]);

  // No drag while renaming, so the text in the input can be selected.
  const combinedRef = useCallback(
    (el: HTMLDivElement | null) => {
      (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      dragHandle?.(node.isEditing ? null : el);
    },
    [dragHandle, node.isEditing],
  );

  const togglePin = () =>
    useAppStore.getState().togglePin(node.data.id, 'collection_folders', isPinned);

  const handleCreateSubfolder = async () => {
    const id = await useAppStore
      .getState()
      .createCollectionFolder(scope, t('node.newFolderName'), node.data.id);
    if (!id) return;
    tree.open(node.data.id);
    setTimeout(() => tree.edit(id), 300);
  };

  const menuItems: MenuEntryDef[] = [
    {
      type: 'item',
      key: 'toggle-pin',
      icon: isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4 rotate-45" />,
      label: isPinned ? t('node.unpinFromTop') : t('node.pinToTop'),
      onClick: () => void togglePin(),
    },
    {
      type: 'item',
      key: 'new-subfolder',
      icon: <FolderPlus className="h-4 w-4" />,
      label: t('node.newFolder'),
      onClick: () => void handleCreateSubfolder(),
    },
    {
      type: 'item',
      key: 'rename',
      icon: <Edit2 className="h-4 w-4" />,
      label: t('node.rename'),
      // Deferred so the menu's closing focus shuffle doesn't blur the input.
      onClick: () => setTimeout(() => node.edit()),
    },
    {
      type: 'item',
      key: 'move',
      icon: <FolderInput className="h-4 w-4" />,
      label: t('node.moveTo'),
      onClick: () =>
        void moveToCollectionFolder(scope, {
          kind: 'folder',
          id: node.data.id,
          currentFolderId: node.data.data?.parent_id ?? null,
        }),
    },
    { type: 'separator', key: 'sep-delete' },
    {
      type: 'item',
      key: 'delete',
      icon: <Trash2 className="h-4 w-4" />,
      label: t('node.delete'),
      className: 'text-destructive focus:text-destructive',
      onClick: () => void deleteCollectionFolder(scope, node.data.id),
    },
  ];

  const actions: ActionButtonDef[] = isPinned
    ? [
        {
          icon: <Pin className="h-3.5 w-3.5 rotate-45 fill-current" />,
          tooltip: t('node.unpinFromTop'),
          onClick: (e) => {
            e.stopPropagation();
            e.preventDefault();
            void togglePin();
          },
          persistent: true,
        },
      ]
    : [];

  const isMenuActive = isContextMenuOpen || isDropdownOpen;

  const toggleIcon = node.isOpen ? (
    <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.5} />
  ) : (
    <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
  );

  return (
    <ExclusiveContextMenu onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger asChild>
        <div
          style={style}
          className={cn(
            'outline-none h-[calc(100%-2px)] w-[calc(100%-4px)] mx-auto mt-[1px]',
            'rounded-md cursor-pointer',
            !node.isSelected && 'hover:bg-accent/50',
            node.isSelected && 'node-item-selected',
            node.willReceiveDrop && 'bg-accent/50 border border-primary/40',
            isMenuActive && 'bg-accent/50 node-menu-active',
          )}
        >
          <div
            ref={combinedRef}
            role="button"
            tabIndex={0}
            className="flex items-center gap-2 px-1 pr-2 h-full group relative no-underline outline-none text-density text-foreground/80 font-medium"
            onClick={() => {
              if (node.isEditing) return;
              node.select();
              node.toggle();
            }}
            onKeyDown={(e) => {
              if (node.isEditing) return;
              if (e.key === 'Enter' || e.key === ' ') node.toggle();
            }}
          >
            <FolderTreeNodeContent
              node={node}
              folderIcon={<FolderIcon className="w-4 h-4 text-foreground/80" />}
              fileIcon={null}
              toggleIcon={toggleIcon}
              handleToggle={(e) => {
                e.stopPropagation();
                node.toggle();
              }}
              newName={newName}
              setNewName={setNewName}
              hoverRef={rowRef}
              searchQuery={searchQuery}
            />
            {!node.isEditing && (
              <NodeActionBar
                actions={actions}
                menuItems={menuItems}
                forceVisible={isMenuActive}
                onDropdownOpenChange={setIsDropdownOpen}
              />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="z-[9999] w-48">
        {renderMenuItems(menuItems, 'context')}
      </ContextMenuContent>
    </ExclusiveContextMenu>
  );
};
