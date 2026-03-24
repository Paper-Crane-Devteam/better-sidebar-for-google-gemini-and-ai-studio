import React from 'react';
import { RowRendererProps, NodeApi } from 'react-arborist';
import { cn } from '@/shared/lib/utils/utils';
import { FolderTreeNodeData } from './types';

/**
 * Find the nearest non-timeGroup folder ancestor (or self) for a node.
 */
function findOwnerFolder<T extends FolderTreeNodeData>(
  node: NodeApi<T>,
): NodeApi<T> | null {
  if (node.data?.type === 'folder' && !node.data?.data?.isTimeGroup) {
    return node;
  }
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
 * Custom row renderer that applies a light background tint
 * when the folder or one of its children is selected.
 */
export function FolderTintRow<T extends FolderTreeNodeData>({
  node,
  attrs,
  innerRef,
  children,
}: RowRendererProps<T>) {
  const selectedNodes = node.tree.selectedNodes;

  const activeFolderIds = new Set<string>();
  for (const sel of selectedNodes) {
    const folder = findOwnerFolder(sel);
    if (folder) {
      activeFolderIds.add(folder.id);
    }
  }

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
      className={cn(attrs.className, hasActiveTint && 'node-folder-child')}
      onFocus={(e) => e.stopPropagation()}
      onClick={node.handleClick}
    >
      {children}
    </div>
  );
}
