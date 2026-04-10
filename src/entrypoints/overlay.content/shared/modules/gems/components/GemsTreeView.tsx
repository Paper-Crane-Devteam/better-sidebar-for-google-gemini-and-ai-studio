import React, { useMemo, forwardRef, useImperativeHandle } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  FolderTree,
  FolderTintRow,
  FolderTreeHandle,
  FolderTreeNodeData,
  NodeRendererProps,
} from '../../../components/folder-tree';
import { GemNode } from './GemNode';


const STORAGE_KEY = 'gems-tree-open-state';

export interface GemsTreeHandle {
  collapseAll: () => void;
  select: (id: string) => void;
}

interface GemsTreeViewProps {
  onSelect: (nodes: any[]) => void;
}

const NodeWrapper = (props: NodeRendererProps<FolderTreeNodeData>) => {
  return <GemNode {...props} />;
};

export const GemsTreeView = forwardRef<GemsTreeHandle, GemsTreeViewProps>(
  ({ onSelect }, ref) => {
    const { t } = useI18n();
    const {
      gems,
      conversations,
      conversationTags,
      favorites,
      ui,
    } = useAppStore();

    const { sortOrder, tags: tagFilter, onlyFavorites } = ui.gems;
    const { query: searchTerm } = ui.gems.search;

    const folderTreeRef = React.useRef<FolderTreeHandle>(null);

    const data = useMemo(() => {
      // Each gem becomes a "folder" node, its conversations become "file" children
      const gemConversations = conversations.filter((c) => c.gem_id);

      let filteredConversations = gemConversations;

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

      // Group conversations by gem_id
      const gemConvoMap = new Map<string, typeof filteredConversations>();
      filteredConversations.forEach((c) => {
        if (!c.gem_id) return;
        if (!gemConvoMap.has(c.gem_id)) {
          gemConvoMap.set(c.gem_id, []);
        }
        gemConvoMap.get(c.gem_id)!.push(c);
      });

      const favoriteIds = new Set(
        favorites
          .filter((f) => f.target_type === 'conversation')
          .map((f) => f.target_id),
      );

      const nodes: FolderTreeNodeData[] = gems.map((gem) => {
        const children: FolderTreeNodeData[] = (gemConvoMap.get(gem.id) || [])
          .map((c) => ({
            id: c.id,
            name: c.title || t('common.untitled'),
            type: 'file' as const,
            data: c,
          }));

        // Sort children
        children.sort((a, b) => {
          const isAFav = favoriteIds.has(a.id);
          const isBFav = favoriteIds.has(b.id);
          if (isAFav && !isBFav) return -1;
          if (!isAFav && isBFav) return 1;
          if (sortOrder === 'date') {
            const dateA = a.data?.last_active_at || a.data?.updated_at || a.data?.created_at || 0;
            const dateB = b.data?.last_active_at || b.data?.updated_at || b.data?.created_at || 0;
            return dateB - dateA;
          }
          return a.name.localeCompare(b.name);
        });

        return {
          id: gem.id,
          name: gem.name,
          type: 'folder' as const,
          children,
          data: { ...gem, isGem: true },
        };
      });

      // Filter out gems with no matching conversations when tag/fav filter is active
      const hasActiveFilter = tagFilter.selected.length > 0 || onlyFavorites;
      const filteredNodes = hasActiveFilter
        ? nodes.filter((n) => n.children && n.children.length > 0)
        : nodes;

      // Sort gems
      filteredNodes.sort((a, b) => {
        if (sortOrder === 'date') {
          const dateA = a.data?.updated_at || a.data?.created_at || 0;
          const dateB = b.data?.updated_at || b.data?.created_at || 0;
          return dateB - dateA;
        }
        return a.name.localeCompare(b.name);
      });

      return filteredNodes;
    }, [gems, conversations, sortOrder, favorites, tagFilter.selected, conversationTags, onlyFavorites, t]);

    useImperativeHandle(ref, () => ({
      collapseAll: () => folderTreeRef.current?.collapseAll(),
      select: (id: string) => folderTreeRef.current?.select(id),
    }));

    // Gems tree is flat (no folder nesting), no drag-and-drop needed
    return (
      <FolderTree
        ref={folderTreeRef}
        data={data}
        storageKey={STORAGE_KEY}
        folders={[]}
        searchTerm={searchTerm}
        onSelect={onSelect}
        onMoveItem={async () => {}}
        onRenameItem={async () => {}}
        onDeleteItems={async () => {}}
        onCreateFolder={async () => null}
        renderNode={NodeWrapper}
        renderRow={FolderTintRow}
      />
    );
  },
);
