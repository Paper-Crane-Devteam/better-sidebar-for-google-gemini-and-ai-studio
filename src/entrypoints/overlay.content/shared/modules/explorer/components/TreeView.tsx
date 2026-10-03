import React, { useMemo, forwardRef, useImperativeHandle } from 'react';
import { STORAGE_KEY } from '../hooks/useArboristTree';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Node } from './node';
import {
  FolderTree,
  FolderTintRow,
  FolderTreeHandle,
  FolderTreeNodeData,
  NodeRendererProps,
} from '../../../components/folder-tree';
import { ArboristTreeHandle } from '../types';
import { useI18n } from '@/shared/hooks/useI18n';
import { useDeleteHandler } from '../hooks/useDeleteHandler';
import { useExplorerContext } from '../ExplorerContext';
import { isInboxFolder } from '@/shared/constants/inbox';
import { PENDING_NODE_ID } from '../hooks/usePendingNewChat';
import { useToastStore } from '@/shared/lib/toast';

interface TreeViewProps {
  onSelect: (item: any) => void;
}

const NodeWrapper = (props: NodeRendererProps<FolderTreeNodeData>) => {
  return <Node {...props} />;
};

export const TreeView = forwardRef<ArboristTreeHandle, TreeViewProps>(
  ({ onSelect }, ref) => {
    const { t } = useI18n();
    const { pendingNewChatFolderId, pendingEntry, movePendingEntry } = useExplorerContext();
    const {
      folders,
      conversations,
      conversationTags,
      favorites,
      setExplorerBatchSelection,
      moveItem,
      renameItem,
      createFolder,
      reorderFolders,
      reorderConversations,
      setExplorerSortOrder,
      ui,
    } = useAppStore();
    const { explorer } = useSettingsStore();
    const { handleDelete } = useDeleteHandler();

    const {
      sortOrder,
      tags: tagFilter,
      typeFilter,
      onlyFavorites,
    } = ui.explorer;
    const { query: searchTerm } = ui.explorer.search;
    const { ignoredFolders } = explorer;

    // While filtering, a folder shows only some of its chats, so a drop position
    // among them says nothing about where the hidden ones should go.
    const isFiltering =
      tagFilter.selected.length > 0 ||
      typeFilter !== 'all' ||
      onlyFavorites ||
      !!searchTerm;

    const folderTreeRef = React.useRef<FolderTreeHandle>(null);

    // Transform data into tree structure
    const data = useMemo(() => {
      const folderMap = new Map<string, FolderTreeNodeData>();
      const ignoredSet = new Set(
        ignoredFolders.map((f: string) => f.toLowerCase().trim()),
      );
      const ignoredFolderIds = new Set<string>();

      folders.forEach((f) => {
        if (ignoredSet.has(f.name.toLowerCase().trim())) {
          ignoredFolderIds.add(f.id);
        }
      });

      folders
        .filter((f) => !ignoredFolderIds.has(f.id))
        .forEach((f) => {
          folderMap.set(f.id, {
            id: f.id,
            name: isInboxFolder(f.id) ? t('explorer.imported') : f.name,
            type: 'folder',
            children: [],
            data: f,
          });
        });

      const rootNodes: FolderTreeNodeData[] = [];
      let filteredConversations = conversations;

      if (typeFilter !== 'all') {
        filteredConversations = filteredConversations.filter((c) => {
          const type = c.type || 'conversation';
          return type === typeFilter;
        });
      }

      if (onlyFavorites) {
        const favoriteIds = new Set(
          favorites
            .filter((f) => f.target_type === 'conversation')
            .map((f) => f.target_id),
        );
        filteredConversations = filteredConversations.filter((c) =>
          favoriteIds.has(c.id),
        );
      }

      if (tagFilter.selected.length > 0) {
        const selectedTagIds = new Set(tagFilter.selected);
        const matchingConversationIds = new Set<string>();
        conversationTags.forEach((ct) => {
          if (selectedTagIds.has(ct.tag_id)) {
            matchingConversationIds.add(ct.conversation_id);
          }
        });
        filteredConversations = filteredConversations.filter((c) =>
          matchingConversationIds.has(c.id),
        );
      }

      filteredConversations.forEach((c) => {
        if (c.folder_id && ignoredFolderIds.has(c.folder_id)) return;

        const item: FolderTreeNodeData = {
          id: c.id,
          name: c.title || t('common.untitled'),
          type: 'file',
          data: c,
        };

        if (c.folder_id && folderMap.has(c.folder_id)) {
          folderMap.get(c.folder_id)!.children!.push(item);
        } else {
          rootNodes.push(item);
        }
      });

      folders.forEach((f) => {
        if (ignoredFolderIds.has(f.id)) return;
        const node = folderMap.get(f.id);
        if (!node) return;

        if (f.parent_id && folderMap.has(f.parent_id)) {
          folderMap.get(f.parent_id)!.children!.push(node);
        } else if (f.parent_id && ignoredFolderIds.has(f.parent_id)) {
          return;
        } else {
          rootNodes.push(node);
        }
      });

      const favoriteIds = new Set(
        favorites
          .filter((f) => f.target_type === 'conversation')
          .map((f) => f.target_id),
      );

      // Newest first.
      const compareByDate = (a: FolderTreeNodeData, b: FolderTreeNodeData) => {
        const dateA = a.data?.last_active_at || a.data?.updated_at || a.data?.created_at || 0;
        const dateB = b.data?.last_active_at || b.data?.updated_at || b.data?.created_at || 0;
        return dateB - dateA;
      };

      const sortNodes = (nodes: FolderTreeNodeData[]) => {
        nodes.sort((a, b) => {
          // Pinned items always come first
          const isAPinned = a.data?.is_pinned ? 1 : 0;
          const isBPinned = b.data?.is_pinned ? 1 : 0;
          if (isAPinned !== isBPinned) return isBPinned - isAPinned;

          const isAFav = favoriteIds.has(a.id);
          const isBFav = favoriteIds.has(b.id);
          if (isAFav && !isBFav) return -1;
          if (!isAFav && isBFav) return 1;
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

          // Folders: sort by order_index (drag-and-drop order)
          if (a.type === 'folder' && b.type === 'folder') {
            const orderA = a.data?.order_index ?? 0;
            const orderB = b.data?.order_index ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
          }

          if (sortOrder === 'custom') {
            // 0 = never ranked: chats that arrived after the folder was arranged.
            // They sit on top, newest first, until the next drag in the folder
            // ranks the whole folder again.
            const rankA = a.data?.order_index ?? 0;
            const rankB = b.data?.order_index ?? 0;
            const rankedA = rankA > 0;
            const rankedB = rankB > 0;
            if (rankedA !== rankedB) return rankedA ? 1 : -1;
            if (rankedA && rankA !== rankB) return rankA - rankB;
            return compareByDate(a, b);
          }
          if (sortOrder === 'date') return compareByDate(a, b);
          return a.name.localeCompare(b.name);
        });
        nodes.forEach((node) => {
          if (node.children) sortNodes(node.children);
        });
      };

      const hasContent = (node: FolderTreeNodeData): boolean => {
        if (node.type === 'file') return true;
        if (!node.children || node.children.length === 0) return false;
        node.children = node.children.filter((child) => hasContent(child));
        return node.children.length > 0;
      };

      if (isFiltering) {
        // When search is active, also prune folders whose descendants don't match
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const hasMatchingContent = (node: FolderTreeNodeData): boolean => {
            if (node.type === 'file')
              return node.name.toLowerCase().includes(term) ||
                (node.data?.description || '').toLowerCase().includes(term);
            if (!node.children || node.children.length === 0) return false;
            node.children = node.children.filter((child) =>
              hasMatchingContent(child),
            );
            return node.children.length > 0;
          };
          const prunedRootNodes = rootNodes.filter((node) =>
            hasMatchingContent(node),
          );
          sortNodes(prunedRootNodes);
          return prunedRootNodes;
        }

        const prunedRootNodes = rootNodes.filter((node) => hasContent(node));
        sortNodes(prunedRootNodes);
        return prunedRootNodes;
      }

      sortNodes(rootNodes);

      // Inject a virtual loading node into the pending folder (legacy shimmer)
      // Only show legacy shimmer when there's NO pending entry (they are mutually exclusive)
      if (pendingNewChatFolderId && !pendingEntry) {
        const loadingNode: FolderTreeNodeData = {
          id: '__pending_new_chat__',
          name: t('common.loading'),
          type: 'file',
          data: { isPendingNewChat: true },
        };
        const injectLoading = (nodes: FolderTreeNodeData[]): boolean => {
          for (const node of nodes) {
            if (node.id === pendingNewChatFolderId && node.type === 'folder') {
              node.children = node.children || [];
              node.children.unshift(loadingNode);
              return true;
            }
            if (node.children && injectLoading(node.children)) return true;
          }
          return false;
        };
        injectLoading(rootNodes);
      }

      // Inject the new pending entry node (singleton temporary entry)
      if (pendingEntry) {
        const pendingNode: FolderTreeNodeData = {
          id: pendingEntry.nodeId,
          name: pendingEntry.title || '',
          type: 'file',
          data: { isPendingEntry: true, pendingPhase: pendingEntry.phase, pendingTitle: pendingEntry.title },
        };
        if (pendingEntry.folderId) {
          const injectPending = (nodes: FolderTreeNodeData[]): boolean => {
            for (const node of nodes) {
              if (node.id === pendingEntry.folderId && node.type === 'folder') {
                node.children = node.children || [];
                node.children.unshift(pendingNode);
                return true;
              }
              if (node.children && injectPending(node.children)) return true;
            }
            return false;
          };
          // If target folder doesn't exist in tree (e.g. inbox not yet created),
          // fall back to inserting at root so the pending entry is always visible.
          if (!injectPending(rootNodes)) {
            rootNodes.unshift(pendingNode);
          }
        } else {
          rootNodes.unshift(pendingNode);
        }
      }

      return rootNodes;
    }, [
      folders, conversations, sortOrder, favorites,
      tagFilter.selected, conversationTags, typeFilter,
      onlyFavorites, ignoredFolders, searchTerm, t,
      pendingNewChatFolderId, pendingEntry, isFiltering,
    ]);

    const handleReorderFiles = async (
      parentId: string | null,
      orderedIds: string[],
      { draggedId, crossParent }: { draggedId: string; crossParent: boolean },
    ) => {
      // Rendered rows include placeholders (pending entry, loading shimmer).
      const known = new Set(conversations.map((c) => c.id));
      if (!known.has(draggedId)) return;
      const ids = orderedIds.filter((id) => known.has(id));
      if (isFiltering) return;

      if (crossParent) {
        // A plain move already left it unranked; only a folder that is being
        // arranged by hand cares where in it the chat was dropped.
        if (sortOrder === 'custom') await reorderConversations(parentId, ids);
        return;
      }

      // Dragging within a folder is asking for manual order.
      if (sortOrder !== 'custom') {
        // A folder arranged before must not be rebuilt from the alpha/date order
        // on screen — that would silently discard the arrangement. Show it instead
        // and let the user drag again against what they actually saved.
        const idSet = new Set(ids);
        const alreadyArranged = conversations.some(
          (c) => idSet.has(c.id) && (c.order_index ?? 0) > 0,
        );
        if (alreadyArranged) {
          setExplorerSortOrder('custom');
          useSettingsStore.getState().setExplorerSortOrder('custom');
          useToastStore.getState().addToast(t('explorer.showingSavedCustomSort'), 'info', 4000);
          return;
        }

        // Never arranged: start from the order on screen (alpha or date), so
        // nothing moves except the dragged row.
        setExplorerSortOrder('custom');
        // Persisted as the default too: after a reload the arrangement would
        // otherwise look lost behind the previous default.
        useSettingsStore.getState().setExplorerSortOrder('custom');
        useToastStore.getState().addToast(t('explorer.switchedToCustomSort'), 'info');
      }
      await reorderConversations(parentId, ids);
    };

    useImperativeHandle(ref, () => ({
      collapseAll: () => folderTreeRef.current?.collapseAll(),
      edit: (id: string) => folderTreeRef.current?.edit(id),
      select: (id: string) => folderTreeRef.current?.select(id),
      selectAll: () => {
        const getAllIds = (nodes: FolderTreeNodeData[]): string[] => {
          let ids: string[] = [];
          nodes.forEach((node) => {
            const matches =
              !searchTerm ||
              node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (node.data?.description || '').toLowerCase().includes(searchTerm.toLowerCase());
            if (matches) ids.push(node.id);
            if (node.children) ids = ids.concat(getAllIds(node.children));
          });
          return ids;
        };
        setExplorerBatchSelection(getAllIds(data));
      },
      open: (id: string) => folderTreeRef.current?.open?.(id),
    }));

    return (
      <FolderTree
        ref={folderTreeRef}
        data={data}
        storageKey={STORAGE_KEY}
        folders={folders}
        searchTerm={searchTerm}
        onSelect={onSelect}
        onMoveItem={async (id, parentId, type) => {
          if (id === PENDING_NODE_ID) {
            movePendingEntry?.(parentId);
            return;
          }
          await moveItem(id, parentId, type);
        }}
        onRenameItem={async (id, name, type) => {
          if (type === 'folder' && isInboxFolder(id)) return;
          await renameItem(id, name, type);
        }}
        onDeleteItems={async (ids) => {
          await handleDelete(ids);
        }}
        onCreateFolder={async (name, parentId) => {
          return createFolder(name, parentId);
        }}
        onReorderFolders={async (parentId, orderedIds) => {
          await reorderFolders(parentId, orderedIds);
        }}
        onReorderFiles={handleReorderFiles}
        renderNode={NodeWrapper}
        renderRow={FolderTintRow}
      />
    );
  },
);
