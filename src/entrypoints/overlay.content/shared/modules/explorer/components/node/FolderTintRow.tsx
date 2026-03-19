import React from 'react';
import { RowRendererProps, NodeApi } from 'react-arborist';
import { cn } from '@/shared/lib/utils/utils';
import { NodeData } from '../../types';

/**
 * Find the nearest non-timeGroup folder ancestor (or self) for a node.
 * Returns the folder NodeApi, or null if the node is at root level.
 */
function findOwnerFolder<T extends NodeData>(
  node: NodeApi<T>,
): NodeApi<T> | null {
  // If this node IS a folder itself (non-timeGroup), return it
  if (node.data?.type === 'folder' && !node.data?.data?.isTimeGroup) {
    return node;
  }
  // Walk up to find nearest folder ancestor
  let current = node.parent;
  while (current) {
    if (current.data?.type === 'folder' && !current.data?.data?.isTimeGroup) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Custom row renderer that applies a light background tint on the
 * `role="treeitem"` div ONLY when the folder is "active" — i.e. the folder
 * or one of its children is currently selected.
 *
 * - When a folder is selected: the folder row + all its children get the tint
 * - When a child is selected: the parent folder row + all siblings get the tint
 * - Unrelated nodes get no tint
 */
export function FolderTintRow<T extends NodeData>({
  node,
  attrs,
  innerRef,
  children,
}: RowRendererProps<T>) {
  // 1. Get currently selected nodes
  const selectedNodes = node.tree.selectedNodes;

  // 2. Build a set of "active folder IDs" — the folders that are relevant
  //    to the current selection and should show a tint
  const activeFolderIds = new Set<string>();

  for (const sel of selectedNodes) {
    const folder = findOwnerFolder(sel);
    if (folder) {
      activeFolderIds.add(folder.id);
    }
  }

  // 3. Determine if this row's node belongs to any active folder
  let hasActiveTint = false;

  if (activeFolderIds.size > 0) {
    if (activeFolderIds.has(node.id)) {
      hasActiveTint = true;
    } else {
      let current = node.parent;
      while (current) {
        if (activeFolderIds.has(current.id)) {
          hasActiveTint = true;
          break;
        }
        current = current.parent;
      }
    }
  }

  return (
    <div
      {...attrs}
      ref={innerRef}
      className={cn(
        attrs.className,
        hasActiveTint && 'node-folder-child',
      )}
      onFocus={(e) => e.stopPropagation()}
      onClick={node.handleClick}
    >
      {children}
    </div>
  );
}
