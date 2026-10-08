import React, { useMemo, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useModalStore } from '@/shared/lib/modal';
import { SnippetNode } from './node';
import { CreateSnippetForm } from './CreateSnippetForm';
import {
  FolderTree,
  FolderTreeHandle,
  FolderTreeNodeData,
  NodeRendererProps,
} from '../../../components/folder-tree';
import { useI18n } from '@/shared/hooks/useI18n';
import { useDeleteHandler } from '../hooks/useDeleteHandler';
import { useShallow } from 'zustand/react/shallow';

const STORAGE_KEY = 'snippets-tree-open-state';

export interface SnippetsTreeHandle {
  collapseAll: () => void;
  edit: (id: string) => void;
  select: (id: string) => void;
  selectAll?: () => void;
  open: (id: string) => void;
}

interface SnippetsTreeProps {
  onSelect: (item: any) => void;
  onPreview: (snippet: any) => void;
  onEdit: (snippet: any) => void;
}

export const SnippetsTree = forwardRef<SnippetsTreeHandle, SnippetsTreeProps>(
  ({ onSelect, onPreview, onEdit }, ref) => {
    const { t } = useI18n();
    const {
      snippetFolders,
      snippets,
      favorites,
      moveSnippetItem,
      renameSnippetItem,
      createSnippetFolder,
      createSnippet,
      ui,
    } = useAppStore(
      useShallow((s) => ({
        snippetFolders: s.snippetFolders,
        snippets: s.snippets,
        favorites: s.favorites,
        moveSnippetItem: s.moveSnippetItem,
        renameSnippetItem: s.renameSnippetItem,
        createSnippetFolder: s.createSnippetFolder,
        createSnippet: s.createSnippet,
        ui: s.ui,
      })),
    );
    const { handleDelete } = useDeleteHandler();
    const { sortOrder, onlyFavorites } = ui.snippets;
    const { query: searchTerm } = ui.snippets.search;

    const folderTreeRef = React.useRef<FolderTreeHandle>(null);

    // Create snippet in folder via modal
    const createFormRef = useRef<HTMLFormElement>(null);

    const handleCreateInFolder = useCallback((folderId: string) => {
      let formData = { title: '', content: '' };

      const doCreate = () => {
        if (!formData.title.trim()) return;
        useModalStore.getState().close();
        createSnippet(formData.title, formData.content, null, null, folderId);
      };

      useModalStore.getState().open({
        type: 'confirm',
        title: t('snippets.createSnippet'),
        content: (
          <CreateSnippetForm
            formRef={createFormRef}
            onChange={(d) => (formData = d)}
            onValidSubmit={doCreate}
          />
        ),
        confirmText: t('common.create'),
        cancelText: t('common.cancel'),
        onConfirm: doCreate,
        onCancel: () => useModalStore.getState().close(),
        modalClassName: 'max-w-2xl',
      });
    }, [createSnippet, t]);

    useImperativeHandle(ref, () => ({
      collapseAll: () => folderTreeRef.current?.collapseAll(),
      edit: (id: string) => folderTreeRef.current?.edit(id),
      select: (id: string) => folderTreeRef.current?.select(id),
      selectAll: () => {
        const { setSnippetsBatchSelection } = useAppStore.getState();
        const getAllIds = (nodes: FolderTreeNodeData[]): string[] => {
          let ids: string[] = [];
          nodes.forEach((node) => {
            ids.push(node.id);
            if (node.children) ids = ids.concat(getAllIds(node.children));
          });
          return ids;
        };
        setSnippetsBatchSelection(getAllIds(data));
      },
      open: (id: string) => folderTreeRef.current?.open?.(id),
    }));

    const data = useMemo(() => {
      const folderMap = new Map<string, FolderTreeNodeData>();

      snippetFolders.forEach((f) => {
        folderMap.set(f.id, {
          id: f.id,
          name: f.name,
          type: 'folder',
          children: [],
          data: f,
        });
      });

      const rootNodes: FolderTreeNodeData[] = [];

      let filteredSnippets = snippets;

      if (onlyFavorites) {
        const favoriteIds = new Set(
          favorites
            .filter((f) => f.target_type === 'snippet')
            .map((f) => f.target_id),
        );
        filteredSnippets = filteredSnippets.filter((s) => favoriteIds.has(s.id));
      }

      filteredSnippets.forEach((s) => {
        const item: FolderTreeNodeData = {
          id: s.id,
          name: s.title || t('common.untitled'),
          type: 'file',
          data: s,
        };

        if (s.folder_id && folderMap.has(s.folder_id)) {
          folderMap.get(s.folder_id)!.children!.push(item);
        } else {
          rootNodes.push(item);
        }
      });

      snippetFolders.forEach((f) => {
        const node = folderMap.get(f.id);
        if (!node) return;

        if (f.parent_id && folderMap.has(f.parent_id)) {
          folderMap.get(f.parent_id)!.children!.push(node);
        } else {
          rootNodes.push(node);
        }
      });

      const favoriteIds = new Set(
        favorites
          .filter((f) => f.target_type === 'snippet')
          .map((f) => f.target_id),
      );

      const sortNodes = (nodes: FolderTreeNodeData[]) => {
        nodes.sort((a, b) => {
          // Pinned items always come first
          const isAPinned = a.data?.is_pinned ? 1 : 0;
          const isBPinned = b.data?.is_pinned ? 1 : 0;
          if (isAPinned !== isBPinned) return isBPinned - isAPinned;

          // Favorited files come next
          if (a.type === 'file' && b.type === 'file') {
            const isAFav = favoriteIds.has(a.id);
            const isBFav = favoriteIds.has(b.id);
            if (isAFav && !isBFav) return -1;
            if (!isAFav && isBFav) return 1;
          }

          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

          if (sortOrder === 'date') {
            if (a.type === 'folder') return a.name.localeCompare(b.name);
            let dateA = a.data?.updated_at || a.data?.created_at || 0;
            let dateB = b.data?.updated_at || b.data?.created_at || 0;
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

      // Search filtering: prune nodes that don't match search term (by title)
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

      sortNodes(rootNodes);
      return rootNodes;
    }, [snippetFolders, snippets, sortOrder, favorites, onlyFavorites, searchTerm, t]);

    const renderNode = useCallback((props: NodeRendererProps<FolderTreeNodeData>) => {
      return (
        <SnippetNode
          {...props}
          onPreview={onPreview}
          onEdit={onEdit}
          onCreateInFolder={handleCreateInFolder}
        />
      );
    }, [onPreview, onEdit, handleCreateInFolder]);

    return (
      <FolderTree
        ref={folderTreeRef}
        data={data}
        storageKey={STORAGE_KEY}
        folders={snippetFolders}
        searchTerm={searchTerm}
        onSelect={onSelect}
        onMoveItem={async (id, parentId, type) => {
          await moveSnippetItem(id, parentId, type);
        }}
        onRenameItem={async (id, name, type) => {
          await renameSnippetItem(id, name, type);
        }}
        onDeleteItems={async (ids) => {
          await handleDelete(ids);
        }}
        onCreateFolder={async (name, parentId) => {
          return createSnippetFolder(name, parentId);
        }}
        renderNode={renderNode}
      />
    );
  },
);
