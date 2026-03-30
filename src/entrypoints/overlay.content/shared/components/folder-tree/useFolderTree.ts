import { useRef, useState, useEffect } from 'react';
import { TreeApi, NodeApi } from 'react-arborist';
import { FolderTreeNodeData } from './types';
import { useI18n } from '@/shared/hooks/useI18n';

export interface UseFolderTreeOptions {
  /** localStorage key for persisting expanded folder state */
  storageKey: string;
  /** List of folders from the store */
  folders: any[];
  /** Current search term */
  searchTerm: string;
  /** Move an item to a new parent */
  onMoveItem: (id: string, parentId: string | null, type: 'folder' | 'file') => Promise<void>;
  /** Rename an item */
  onRenameItem: (id: string, name: string, type: 'folder' | 'file') => Promise<void>;
  /** Delete items by ids */
  onDeleteItems: (ids: string[]) => Promise<void>;
  /** Create a new folder, returns the new folder id or null */
  onCreateFolder: (name: string, parentId: string) => Promise<string | null>;
}

export const useFolderTree = (options: UseFolderTreeOptions) => {
  const {
    storageKey,
    folders,
    searchTerm,
    onMoveItem,
    onRenameItem,
    onDeleteItems,
    onCreateFolder,
  } = options;

  const { t } = useI18n();
  const treeRef = useRef<TreeApi<FolderTreeNodeData>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 500 });

  // Load initial expanded state from localStorage
  const [initialOpenState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error('Failed to load expanded state', e);
      return {};
    }
  });

  // ResizeObserver for container dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const onMove = async ({
    dragIds,
    parentId,
  }: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => {
    const id = dragIds[0];
    const isFolder = folders.some((f: any) => f.id === id);
    const type = isFolder ? 'folder' : 'file';
    await onMoveItem(id, parentId, type);
  };

  const onRename = async ({
    id,
    name,
    node,
  }: {
    id: string;
    name: string;
    node: NodeApi<FolderTreeNodeData>;
  }) => {
    const type = node.data.type;
    await onRenameItem(id, name, type);
  };

  const onDelete = async ({ ids }: { ids: string[] }) => {
    await onDeleteItems(ids);
  };

  const handleToggle = (id: string) => {
    setTimeout(() => {
      const isOpen = treeRef.current?.isOpen(id);
      try {
        const saved = localStorage.getItem(storageKey);
        const state = saved ? JSON.parse(saved) : {};

        if (isOpen) {
          state[id] = true;
        } else {
          delete state[id];
        }
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (e) {
        console.error('Failed to save expanded state', e);
      }
    }, 0);
  };

  const handleCreateFolder = async (parentId: string) => {
    const newFolderId = await onCreateFolder(t('node.newFolderName'), parentId);
    if (newFolderId) {
      treeRef.current?.open(parentId);
      setTimeout(() => {
        treeRef.current?.edit(newFolderId);
      }, 300);
    }
  };

  return {
    treeRef,
    containerRef,
    dimensions,
    searchTerm,
    initialOpenState,
    onMove,
    onRename,
    onDelete,
    handleToggle,
    handleCreateFolder,
  };
};
