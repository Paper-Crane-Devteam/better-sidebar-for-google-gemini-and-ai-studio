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
  /**
   * Manual order for the files of one parent, after a drop *between* rows (a drop
   * onto a folder row carries no position and never reaches this).
   *
   * `orderedIds` is the parent's rendered file rows with the dragged one placed
   * where it was dropped. It can contain rows the consumer injected itself
   * (placeholders), which it should filter out. `crossParent` is true when the
   * row also changed parent — `onMoveItem` has already run by then.
   *
   * Without this callback a same-parent file drop falls back to `onMoveItem`.
   */
  onReorderFiles?: (
    parentId: string | null,
    orderedIds: string[],
    info: { draggedId: string; crossParent: boolean },
  ) => Promise<void>;
}

/**
 * `siblings` with `id` placed at react-arborist's drop `index`.
 *
 * The index is a position in the parent's rendered children *including* the
 * dragged row when it already lives there, so a downward move lands one slot
 * earlier once that row is taken out.
 */
function placeAtDropIndex(siblings: string[], id: string, index: number): string[] {
  const fromIdx = siblings.indexOf(id);
  const rest = siblings.filter((x) => x !== id);
  const at = fromIdx !== -1 && fromIdx < index ? index - 1 : index;
  rest.splice(Math.min(Math.max(0, at), rest.length), 0, id);
  return rest;
}

/**
 * Write `visibleOrder` into the slots `fullOrder` gives to those same ids, leaving
 * everything else where it is.
 *
 * The tree only renders part of a folder's siblings while a search is active or a
 * folder is ignored. Rewriting the whole list from the rendered rows would push
 * the hidden ones to the end; this keeps them in place and only permutes what the
 * user could actually see and drag between.
 */
function mergeIntoSlots(fullOrder: string[], visibleOrder: string[]): string[] {
  const full = new Set(fullOrder);
  const visible = visibleOrder.filter((id) => full.has(id));
  const visibleSet = new Set(visible);
  let i = 0;
  return fullOrder.map((id) => (visibleSet.has(id) ? visible[i++] : id));
}

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

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
    onReorderFiles,
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

  /** Sibling folders of `parentId` in the order they are sorted in the tree. */
  const sortedFolderSiblings = (parentId: string | null): string[] =>
    folders
      .filter((f: any) => (f.parent_id || null) === parentId)
      .sort((a: any, b: any) => {
        const aPinned = a.is_pinned ? 1 : 0;
        const bPinned = b.is_pinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        const aOrder = a.order_index ?? 0;
        const bOrder = b.order_index ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.name || '').localeCompare(b.name || '');
      })
      .map((f: any) => f.id);

  const onMove = async ({
    dragIds,
    dragNodes,
    parentId,
    parentNode,
    index,
  }: {
    dragIds: string[];
    dragNodes: NodeApi<FolderTreeNodeData>[];
    parentId: string | null;
    parentNode: NodeApi<FolderTreeNodeData> | null;
    index: number;
  }) => {
    const tree = treeRef.current;
    // Read before any await: react-arborist reports a drop *onto* a folder row as
    // index 0, and only its dnd state still tells that apart from a drop at the top.
    const droppedOntoFolder = tree?.state.dnd.index === null;

    const id = dragIds[0];
    const folderIds = new Set(folders.map((f: any) => f.id));
    const isFolder = folderIds.has(id);
    const type = isFolder ? 'folder' : 'file';

    const dragParent = dragNodes[0]?.parent;
    const currentParentId = isFolder
      ? folders.find((f: any) => f.id === id)?.parent_id || null
      : !dragParent || dragParent.isRoot
        ? null
        : dragParent.id;
    const crossParent = parentId !== currentParentId;

    // Siblings exactly as the tree is rendering them. Group boundaries (pinned,
    // favourites, folders before files) then fall out of filtering this list by
    // kind, instead of index arithmetic per group — which is what used to throw
    // folder drops off by however many favourite chats sat above the folders.
    const parent = parentNode ?? (parentId === null ? tree?.root : null);
    const rendered = (parent?.children ?? []).map((n) => n.id);
    const positional = !droppedOntoFolder && !!parent;
    const after = positional ? placeAtDropIndex(rendered, id, index) : [];

    if (isFolder) {
      // Trees without manual folder order keep the plain move they always had.
      if (!onReorderFolders) {
        await onMoveItem(id, parentId, type);
        return;
      }
      if (crossParent) await onMoveItem(id, parentId, 'folder');
      if (!positional) return;

      // Cross-parent: `folders` is still the pre-move snapshot, so the moved folder
      // is given a slot of its own; the merge then puts it where it was dropped.
      const fullBefore = crossParent
        ? [...sortedFolderSiblings(parentId).filter((x) => x !== id), id]
        : sortedFolderSiblings(parentId);
      const merged = mergeIntoSlots(
        fullBefore,
        after.filter((x) => folderIds.has(x)),
      );
      if (!crossParent && sameOrder(merged, fullBefore)) return;
      await onReorderFolders(parentId, merged);
      return;
    }

    if (crossParent) {
      await onMoveItem(id, parentId, 'file');
      if (positional && onReorderFiles) {
        await onReorderFiles(parentId, after.filter((x) => !folderIds.has(x)), {
          draggedId: id,
          crossParent: true,
        });
      }
      return;
    }

    if (!onReorderFiles) {
      await onMoveItem(id, parentId, type);
      return;
    }
    if (!positional) return;
    const filesBefore = rendered.filter((x) => !folderIds.has(x));
    const filesAfter = after.filter((x) => !folderIds.has(x));
    if (sameOrder(filesBefore, filesAfter)) return;
    await onReorderFiles(parentId, filesAfter, { draggedId: id, crossParent: false });
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
