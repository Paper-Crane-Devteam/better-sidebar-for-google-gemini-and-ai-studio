import { useRef, useState, useEffect } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  /** Reorder folders within a parent */
  onReorderFolders?: (parentId: string | null, orderedIds: string[]) => Promise<void>;
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
    onReorderFolders,
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
    index,
  }: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => {
    const id = dragIds[0];
    const isFolder = folders.some((f: any) => f.id === id);
    const type = isFolder ? 'folder' : 'file';

    if (isFolder && onReorderFolders) {
      const draggedFolder = folders.find((f: any) => f.id === id);
      const currentParentId = draggedFolder?.parent_id || null;

      // If the folder is staying within the same parent, treat as reorder
      if (parentId === currentParentId) {
        // Get sibling folders in the same parent, sorted by current order
        const siblings = folders
          .filter((f: any) => (f.parent_id || null) === parentId)
          .sort((a: any, b: any) => {
            const aPinned = a.is_pinned ? 1 : 0;
            const bPinned = b.is_pinned ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            const aOrder = a.order_index ?? 0;
            const bOrder = b.order_index ?? 0;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return (a.name || '').localeCompare(b.name || '');
          });

        // Separate pinned and unpinned
        const pinned = siblings.filter((f: any) => f.is_pinned);
        const unpinned = siblings.filter((f: any) => !f.is_pinned);
        const isDraggedPinned = draggedFolder?.is_pinned;

        if (isDraggedPinned) {
          // Remove dragged from the full ordered list, then reinsert at index
          const ordered = [...pinned];
          const fromIdx = ordered.findIndex((f: any) => f.id === id);
          ordered.splice(fromIdx, 1);
          // react-arborist index is the target position in the original list
          const toIdx = Math.min(Math.max(0, fromIdx < index ? index - 1 : index), ordered.length);
          ordered.splice(toIdx, 0, draggedFolder);
          const orderedIds = [...ordered.map((f: any) => f.id), ...unpinned.map((f: any) => f.id)];
          await onReorderFolders(parentId, orderedIds);
        } else {
          // For unpinned folders, adjust index by subtracting pinned count
          const ordered = [...unpinned];
          const fromIdx = ordered.findIndex((f: any) => f.id === id);
          ordered.splice(fromIdx, 1);
          const adjustedIndex = index - pinned.length;
          const toIdx = Math.min(Math.max(0, fromIdx < adjustedIndex ? adjustedIndex - 1 : adjustedIndex), ordered.length);
          ordered.splice(toIdx, 0, draggedFolder);
          const orderedIds = [...pinned.map((f: any) => f.id), ...ordered.map((f: any) => f.id)];
          await onReorderFolders(parentId, orderedIds);
        }
        return;
      }
    }

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

  /**
   * Extra keyboard shortcuts layered on top of react-arborist's defaults.
   *
   * react-arborist only binds Backspace for delete and Enter for rename, so
   * `Delete` and `F2` (the conventional keys on Windows/Linux file managers)
   * are wired up here. The delete branch mirrors arborist's own Backspace
   * handling so focus lands on a sensible neighbour afterwards.
   */
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const tree = treeRef.current;
    if (!tree || tree.isEditing) return;

    // ─── Delete: same behaviour as arborist's Backspace ───
    if (e.key === 'Delete') {
      e.preventDefault();
      e.stopPropagation();

      const selectedIds = Array.from(tree.selectedIds);
      if (selectedIds.length > 1) {
        let nextFocus = tree.mostRecentNode;
        while (nextFocus && nextFocus.isSelected) {
          nextFocus = nextFocus.nextSibling;
        }
        if (!nextFocus) nextFocus = tree.lastNode;
        tree.focus(nextFocus, { scroll: false });
        tree.delete(selectedIds);
        return;
      }

      const node = tree.focusedNode;
      if (!node) return;
      tree.focus(node.nextSibling || node.parent, { scroll: false });
      tree.delete(node);
      return;
    }

    // ─── F2: start renaming the focused node ───
    if (e.key === 'F2') {
      const node = tree.focusedNode;
      if (!node || !node.isEditable) return;

      e.preventDefault();
      e.stopPropagation();
      // Defer so the keyup doesn't land inside the freshly mounted input.
      setTimeout(() => tree.edit(node));
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
    handleKeyDown,
  };
};
