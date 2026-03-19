import React, { useMemo, forwardRef, useImperativeHandle } from 'react';
import { Tree, NodeRendererProps } from 'react-arborist';
import { useArboristTree, STORAGE_KEY } from '../hooks/useArboristTree';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Node } from './node';
import { FolderTintRow } from './node/FolderTintRow';
import { NodeData, ArboristTreeHandle } from '../types';
import { useI18n } from '@/shared/hooks/useI18n';

interface TreeViewProps {
  onSelect: (item: any) => void;
}

const NodeWrapper = (props: NodeRendererProps<NodeData>) => {
  return <Node {...props} />;
};

export const TreeView = forwardRef<ArboristTreeHandle, TreeViewProps>(
  ({ onSelect }, ref) => {
    const {
      treeRef,
      containerRef,
      dimensions,
      folders,
      conversations,
      searchTerm,
      initialOpenState,
      ui,
      onMove,
      onRename,
      onDelete,
      handleToggle,
    } = useArboristTree();

    const { t } = useI18n();
    const { conversationTags, favorites, setExplorerBatchSelection } =
      useAppStore();
    const { layoutDensity, explorer } = useSettingsStore();
    const {
      sortOrder,
      tags: tagFilter,
      typeFilter,
      onlyFavorites,
    } = ui.explorer;
    const { ignoredFolders } = explorer;

    const rowHeight = layoutDensity === 'compact' ? 32 : 38;

    // Transform data into tree structure
    const data = useMemo(() => {
      const folderMap = new Map<string, NodeData>();
      const ignoredSet = new Set(
        ignoredFolders.map((f) => f.toLowerCase().trim()),
      );
      const ignoredFolderIds = new Set<string>();

      // Identify ignored folders to correctly filter children
      folders.forEach((f) => {
        if (ignoredSet.has(f.name.toLowerCase().trim())) {
          ignoredFolderIds.add(f.id);
        }
      });

      // Create folder nodes (skip ignored)
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

      const rootNodes: NodeData[] = [];

      // Filter conversations if tags selected
      let filteredConversations = conversations;

      // Filter by type
      if (typeFilter !== 'all') {
        filteredConversations = filteredConversations.filter((c) => {
          const type = c.type || 'conversation';
          return type === typeFilter;
        });
      }

      // Filter by favorites
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

      // Add conversations
      filteredConversations.forEach((c) => {
        // Skip if parent folder is ignored
        if (c.folder_id && ignoredFolderIds.has(c.folder_id)) {
          return;
        }

        const item: NodeData = {
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

      // Build hierarchy
      folders.forEach((f) => {
        // Skip if explicitly ignored
        if (ignoredFolderIds.has(f.id)) return;

        const node = folderMap.get(f.id);
        if (!node) return;

        if (f.parent_id && folderMap.has(f.parent_id)) {
          folderMap.get(f.parent_id)!.children!.push(node);
        } else if (f.parent_id && ignoredFolderIds.has(f.parent_id)) {
          // Parent is ignored, so this folder should also be hidden (transitive ignore)
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

      // Sort function
      const sortNodes = (nodes: NodeData[]) => {
        nodes.sort((a, b) => {
          // Check favorites first
          const isAFav = favoriteIds.has(a.id);
          const isBFav = favoriteIds.has(b.id);

          if (isAFav && !isBFav) return -1;
          if (!isAFav && isBFav) return 1;

          // Always keep folders on top
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
          }

          // Sorting logic based on sortOrder
          if (sortOrder === 'date') {
            // For folders, we fallback to alpha for now as we don't have created_at
            if (a.type === 'folder') {
              return a.name.localeCompare(b.name);
            }

            // For files (conversations), use updated_at or created_at
            // Newest first (descending)
            let dateA = a.data?.updated_at || a.data?.created_at || 0;
            let dateB = b.data?.updated_at || b.data?.created_at || 0;

            // Database stores seconds, convert to ms
            if (dateA > 0) dateA *= 1000;
            if (dateB > 0) dateB *= 1000;

            return dateB - dateA;
          }

          // Default alpha
          return a.name.localeCompare(b.name);
        });
        nodes.forEach((node) => {
          if (node.children) sortNodes(node.children);
        });
      };

      const hasContent = (node: NodeData): boolean => {
        if (node.type === 'file') return true;
        if (!node.children || node.children.length === 0) return false;
        // Filter children first
        node.children = node.children.filter((child) => hasContent(child));
        return node.children.length > 0;
      };

      if (tagFilter.selected.length > 0) {
        // Prune empty folders if filtering is active
        const prunedRootNodes = rootNodes.filter((node) => hasContent(node));

        // Sort
        sortNodes(prunedRootNodes);
        return prunedRootNodes;
      }

      sortNodes(rootNodes);
      return rootNodes;
    }, [
      folders,
      conversations,
      sortOrder,
      favorites,
      tagFilter.selected,
      conversationTags,
      typeFilter,
      onlyFavorites,
      ignoredFolders,
      t,
    ]);

    useImperativeHandle(ref, () => ({
      collapseAll: () => {
        treeRef.current?.closeAll();
        localStorage.removeItem(STORAGE_KEY);
      },
      edit: (id: string) => {
        treeRef.current?.edit(id);
      },
      select: (id: string) => {
        treeRef.current?.select(id);
        treeRef.current?.scrollTo(id);
      },
      selectAll: () => {
        const getAllIds = (nodes: NodeData[]): string[] => {
          let ids: string[] = [];
          nodes.forEach((node) => {
            const matches =
              !searchTerm ||
              node.name.toLowerCase().includes(searchTerm.toLowerCase());
            if (node.type === 'file' && matches) {
              ids.push(node.id);
            }
            if (node.children) {
              ids = ids.concat(getAllIds(node.children));
            }
          });
          return ids;
        };
        const allIds = getAllIds(data);
        setExplorerBatchSelection(allIds);
      },
      open: (id: string) => {
        treeRef.current?.open(id);
      },
    }));

    return (
      <div ref={containerRef} className="h-full w-full">
        <Tree
          padding={2}
          ref={treeRef}
          data={data}
          onMove={onMove}
          onRename={onRename}
          onDelete={onDelete}
          onSelect={onSelect}
          onToggle={handleToggle}
          width={dimensions.width}
          height={dimensions.height}
          indent={20}
          rowHeight={rowHeight}
          openByDefault={false}
          initialOpenState={initialOpenState}
          searchTerm={searchTerm}
          searchMatch={(node, term) =>
            node.data.name.toLowerCase().includes(term.toLowerCase())
          }
          renderRow={FolderTintRow}
        >
          {NodeWrapper}
        </Tree>
      </div>
    );
  },
);
