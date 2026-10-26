import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import type { CollectionScope } from '@/shared/types/db';
import {
  FolderTree,
  FolderTintRow,
  type FolderTreeHandle,
  type FolderTreeNodeData,
  type NodeRendererProps,
} from '../../components/folder-tree';
import {
  COLLECTION_CONFIG,
  buildCollectionTree,
  isCollectionFolderNode,
  type CollectionItem,
} from './collection-tree';
import { CollectionFolderNode } from './CollectionFolderNode';
import { deleteCollectionFolder } from './collection-actions';
import { useCollectionSortOrder } from './useCollectionSortOrder';

export interface CollectionTreeHandle {
  collapseAll: () => void;
  select: (id: string) => void;
  /** Add a folder at the top level and start renaming it. */
  createRootFolder: () => Promise<void>;
}

interface CollectionTreeViewProps {
  scope: CollectionScope;
  /** Renders gem/notebook rows and their chats; folder rows are handled here. */
  itemNode: React.ComponentType<NodeRendererProps<FolderTreeNodeData>>;
  onSelect?: (nodes: any[]) => void;
}

/**
 * The Gems / Notebooks panel tree: user folders (nestable, manually ordered),
 * gems/notebooks inside them, and the chats of each gem/notebook.
 *
 * Dragging moves and orders folders and gems/notebooks. Chats are fixed: which
 * gem/notebook they belong to is Gemini's, and they have no manual order here.
 */
export const CollectionTreeView = forwardRef<CollectionTreeHandle, CollectionTreeViewProps>(
  ({ scope, itemNode: ItemNode, onSelect }, ref) => {
    const { t } = useI18n();
    const {
      items,
      allFolders,
      conversations,
      conversationTags,
      favorites,
      filterUi,
      moveCollectionFolder,
      moveCollectionItem,
      reorderCollectionFolders,
      reorderCollectionItems,
      renameCollectionFolder,
      createCollectionFolder,
    } = useAppStore(
      useShallow((s) => ({
        items: s[scope] as CollectionItem[],
        allFolders: s.collectionFolders,
        conversations: s.conversations,
        conversationTags: s.conversationTags,
        favorites: s.favorites,
        filterUi: s.ui[scope],
        moveCollectionFolder: s.moveCollectionFolder,
        moveCollectionItem: s.moveCollectionItem,
        reorderCollectionFolders: s.reorderCollectionFolders,
        reorderCollectionItems: s.reorderCollectionItems,
        renameCollectionFolder: s.renameCollectionFolder,
        createCollectionFolder: s.createCollectionFolder,
      })),
    );
    const [sortOrder, setSortOrder] = useCollectionSortOrder(scope);
    const folderTreeRef = useRef<FolderTreeHandle>(null);

    const { tags: tagFilter, onlyFavorites } = filterUi;
    const searchTerm = filterUi.search.query;
    const isFiltering = onlyFavorites || tagFilter.selected.length > 0;

    const folders = useMemo(
      () => allFolders.filter((f) => f.scope === scope),
      [allFolders, scope],
    );
    const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

    const data = useMemo(() => {
      const favoriteIds = new Set(
        favorites.filter((f) => f.target_type === 'conversation').map((f) => f.target_id),
      );
      let taggedIds: Set<string> | null = null;
      if (tagFilter.selected.length > 0) {
        const selected = new Set(tagFilter.selected);
        taggedIds = new Set(
          conversationTags.filter((ct) => selected.has(ct.tag_id)).map((ct) => ct.conversation_id),
        );
      }
      return buildCollectionTree({
        scope,
        items,
        folders,
        conversations,
        favoriteIds,
        taggedIds,
        onlyFavorites,
        sortOrder,
        untitled: t('common.untitled'),
      });
    }, [
      scope,
      items,
      folders,
      conversations,
      favorites,
      tagFilter.selected,
      conversationTags,
      onlyFavorites,
      sortOrder,
      t,
    ]);

    // react-arborist renders this as a component: its identity must stay stable
    // or every row remounts on each render.
    const renderNode = useMemo(
      () =>
        function CollectionNodeRenderer(props: NodeRendererProps<FolderTreeNodeData>) {
          return isCollectionFolderNode(props.node.data) ? (
            <CollectionFolderNode {...props} scope={scope} />
          ) : (
            <ItemNode {...props} />
          );
        },
      [scope, ItemNode],
    );

    const handleReorderItems = async (
      _parentId: string | null,
      orderedIds: string[],
      { draggedId, crossParent }: { draggedId: string; crossParent: boolean },
    ) => {
      const known = new Set(items.map((i) => i.id));
      if (!known.has(draggedId)) return;
      const ids = orderedIds.filter((id) => known.has(id));
      // Only part of the folder is on screen; ranking that part would scramble the rest.
      if (isFiltering) return;

      if (crossParent) {
        // The move already left it unranked; only an arranged list cares where it landed.
        if (sortOrder === 'custom') await reorderCollectionItems(scope, ids);
        return;
      }

      // Dragging within a folder asks for manual order.
      if (sortOrder !== 'custom') {
        setSortOrder('custom');
        const idSet = new Set(ids);
        const alreadyArranged = items.some(
          (i) => idSet.has(i.id) && (i.order_index ?? 0) > 0,
        );
        if (alreadyArranged) {
          // Rebuilding the ranks from the alpha/date order on screen would
          // silently throw the saved arrangement away. Show it instead.
          toast.info(t('explorer.showingSavedCustomSort'), 4000);
          return;
        }
        toast.info(t('explorer.switchedToCustomSort'));
      }
      await reorderCollectionItems(scope, ids);
    };

    useImperativeHandle(ref, () => ({
      collapseAll: () => folderTreeRef.current?.collapseAll(),
      select: (id: string) => folderTreeRef.current?.select(id),
      createRootFolder: async () => {
        const id = await createCollectionFolder(scope, t('node.newFolderName'), null);
        if (id) setTimeout(() => folderTreeRef.current?.edit(id), 300);
      },
    }));

    return (
      <FolderTree
        ref={folderTreeRef}
        data={data}
        storageKey={COLLECTION_CONFIG[scope].storageKey}
        folders={folders}
        searchTerm={searchTerm}
        onSelect={onSelect}
        onMoveItem={async (id, parentId) => {
          if (folderIds.has(id)) await moveCollectionFolder(id, parentId);
          else if (items.some((i) => i.id === id)) await moveCollectionItem(scope, id, parentId);
        }}
        onReorderFolders={async (_parentId, orderedIds) => {
          await reorderCollectionFolders(orderedIds);
        }}
        onReorderFiles={handleReorderItems}
        onRenameItem={async (id, name) => {
          if (folderIds.has(id)) await renameCollectionFolder(id, name);
        }}
        // Only user folders: gem/notebook names belong to Gemini.
        disableEdit={(d) => !isCollectionFolderNode(d)}
        onDeleteItems={async (ids) => {
          // Delete key: folders only. Deleting a gem/notebook removes it from
          // Gemini, which is too much for a stray keypress.
          for (const id of ids) {
            if (folderIds.has(id)) await deleteCollectionFolder(scope, id);
          }
        }}
        onCreateFolder={(name, parentId) => createCollectionFolder(scope, name, parentId)}
        disableDrag={(d) => d.type === 'file'}
        disableDrop={({ parentNode, dragNodes }) =>
          // Folders and gems/notebooks go to the top level or into a folder —
          // never into a gem/notebook. Chats don't move at all.
          !(parentNode.isRoot || isCollectionFolderNode(parentNode.data)) ||
          dragNodes.some((n) => n.data.type === 'file')
        }
        renderNode={renderNode}
        renderRow={FolderTintRow}
      />
    );
  },
);
