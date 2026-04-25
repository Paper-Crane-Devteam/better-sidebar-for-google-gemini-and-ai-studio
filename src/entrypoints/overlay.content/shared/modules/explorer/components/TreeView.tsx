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

interface TreeViewProps {
  onSelect: (item: any) => void;
}

const NodeWrapper = (props: NodeRendererProps<FolderTreeNodeData>) => {
  return <Node {...props} />;
};

export const TreeView = forwardRef<ArboristTreeHandle, TreeViewProps>(
  ({ onSelect }, ref) => {
    const { t } = useI18n();
    const { pendingNewChatFolderId } = useExplorerContext();
    const {
      folders,
      conversations,
      conversationTags,
      favorites,
      setExplorerBatchSelection,
      moveItem,
      renameItem,
      createFolder,
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
            name: f.name,
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

      const sortNodes = (nodes: FolderTreeNodeData[]) => {
        nodes.sort((a, b) => {
          const isAFav = favoriteIds.has(a.id);
          const isBFav = favoriteIds.has(b.id);
          if (isAFav && !isBFav) return -1;
          if (!isAFav && isBFav) return 1;
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

          if (sortOrder === 'date') {
            if (a.type === 'folder') return a.name.localeCompare(b.name);
            let dateA = a.data?.last_active_at || a.data?.updated_at || a.data?.created_at || 0;
            let dateB = b.data?.last_active_at || b.data?.updated_at || b.data?.created_at || 0;
            if (dateA > 0) dateA *= 1000;
            if (dateB > 0) dateB *= 1000;
            return dateB - dateA;
          }
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

      const isFiltering =
        tagFilter.selected.length > 0 ||
        typeFilter !== 'all' ||
        onlyFavorites ||
        !!searchTerm;

      if (isFiltering) {
        // When search is active, also prune folders whose descendants don't match
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          const hasMatchingContent = (node: FolderTreeNodeData): boolean => {
            if (node.type === 'file')
              return node.name.toLowerCase().includes(term);
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

      // Inject a virtual loading node into the pending folder
      if (pendingNewChatFolderId) {
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

      return rootNodes;
    }, [
      folders, conversations, sortOrder, favorites,
      tagFilter.selected, conversationTags, typeFilter,
      onlyFavorites, ignoredFolders, searchTerm, t,
      pendingNewChatFolderId,
    ]);

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
              node.name.toLowerCase().includes(searchTerm.toLowerCase());
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
          await moveItem(id, parentId, type);
        }}
        onRenameItem={async (id, name, type) => {
          await renameItem(id, name, type);
        }}
        onDeleteItems={async (ids) => {
          await handleDelete(ids);
        }}
        onCreateFolder={async (name, parentId) => {
          return createFolder(name, parentId);
        }}
        renderNode={NodeWrapper}
        renderRow={FolderTintRow}
      />
    );
  },
);
