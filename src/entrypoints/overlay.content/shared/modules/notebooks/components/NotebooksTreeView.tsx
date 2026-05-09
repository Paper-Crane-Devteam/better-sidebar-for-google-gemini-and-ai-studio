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
import { NotebookNode } from './NotebookNode';

const STORAGE_KEY = 'notebooks-tree-open-state';

export interface NotebooksTreeHandle {
  collapseAll: () => void;
  select: (id: string) => void;
}

interface NotebooksTreeViewProps {
  onSelect: (nodes: any[]) => void;
}

const NodeWrapper = (props: NodeRendererProps<FolderTreeNodeData>) => {
  return <NotebookNode {...props} />;
};

export const NotebooksTreeView = forwardRef<
  NotebooksTreeHandle,
  NotebooksTreeViewProps
>(({ onSelect }, ref) => {
  const { t } = useI18n();
  const { notebooks, conversations, conversationTags, favorites, ui } =
    useAppStore();

  const { sortOrder, tags: tagFilter, onlyFavorites } = ui.notebooks;
  const { query: searchTerm } = ui.notebooks.search;

  const folderTreeRef = React.useRef<FolderTreeHandle>(null);

  const data = useMemo(() => {
    const notebookConversations = conversations.filter((c) => c.notebook_id);

    let filteredConversations = notebookConversations;

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

    const byNotebook = new Map<string, typeof filteredConversations>();
    filteredConversations.forEach((c) => {
      if (!c.notebook_id) return;
      if (!byNotebook.has(c.notebook_id)) byNotebook.set(c.notebook_id, []);
      byNotebook.get(c.notebook_id)!.push(c);
    });

    const favoriteIds = new Set(
      favorites
        .filter((f) => f.target_type === 'conversation')
        .map((f) => f.target_id),
    );

    const nodes: FolderTreeNodeData[] = notebooks.map((nb) => {
      const children: FolderTreeNodeData[] = (byNotebook.get(nb.id) || [])
        .map((c) => ({
          id: c.id,
          name: c.title || t('common.untitled'),
          type: 'file' as const,
          data: c,
        }));

      children.sort((a, b) => {
        const isAFav = favoriteIds.has(a.id);
        const isBFav = favoriteIds.has(b.id);
        if (isAFav && !isBFav) return -1;
        if (!isAFav && isBFav) return 1;
        if (sortOrder === 'date') {
          const dateA =
            a.data?.last_active_at ||
            a.data?.updated_at ||
            a.data?.created_at ||
            0;
          const dateB =
            b.data?.last_active_at ||
            b.data?.updated_at ||
            b.data?.created_at ||
            0;
          return dateB - dateA;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        id: nb.id,
        name: nb.name,
        type: 'folder' as const,
        children,
        data: { ...nb, isNotebook: true },
      };
    });

    const hasActiveFilter = tagFilter.selected.length > 0 || onlyFavorites;
    const filteredNodes = hasActiveFilter
      ? nodes.filter((n) => n.children && n.children.length > 0)
      : nodes;

    filteredNodes.sort((a, b) => {
      if (sortOrder === 'date') {
        const dateA = a.data?.updated_at || a.data?.created_at || 0;
        const dateB = b.data?.updated_at || b.data?.created_at || 0;
        return dateB - dateA;
      }
      return a.name.localeCompare(b.name);
    });

    return filteredNodes;
  }, [
    notebooks,
    conversations,
    sortOrder,
    favorites,
    tagFilter.selected,
    conversationTags,
    onlyFavorites,
    t,
  ]);

  useImperativeHandle(ref, () => ({
    collapseAll: () => folderTreeRef.current?.collapseAll(),
    select: (id: string) => folderTreeRef.current?.select(id),
  }));

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
});
