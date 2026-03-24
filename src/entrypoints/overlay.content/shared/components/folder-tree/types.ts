import { NodeRendererProps, NodeApi, TreeApi, RowRendererProps } from 'react-arborist';

/**
 * Generic node data structure for folder trees.
 * Both explorer and prompts modules use this shape.
 */
export interface FolderTreeNodeData {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: FolderTreeNodeData[];
  data?: any;
}

/**
 * Imperative handle exposed by FolderTree via ref.
 */
export interface FolderTreeHandle {
  collapseAll: () => void;
  edit: (id: string) => void;
  select: (id: string) => void;
  selectAll?: () => void;
  open: (id: string) => void;
}

/**
 * Props for the generic node renderer, extending react-arborist's NodeRendererProps.
 */
export type FolderTreeNodeProps<T extends FolderTreeNodeData = FolderTreeNodeData> =
  NodeRendererProps<T>;

/**
 * Re-export useful react-arborist types for convenience.
 */
export type { NodeApi, TreeApi, RowRendererProps, NodeRendererProps };
