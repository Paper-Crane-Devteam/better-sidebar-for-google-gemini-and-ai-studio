import React, { forwardRef, useImperativeHandle } from 'react';
import { Tree, NodeRendererProps, RowRendererProps } from 'react-arborist';
import { FolderTreeNodeData, FolderTreeHandle } from './types';
import { useFolderTree, UseFolderTreeOptions } from './useFolderTree';
import { getTreeDndManager } from './dnd-manager';

export interface FolderTreeProps extends UseFolderTreeOptions {
  /** Tree data (already transformed into hierarchy) */
  data: FolderTreeNodeData[];
  /** Called when node selection changes */
  onSelect?: (nodes: any[]) => void;
  /** Custom node renderer */
  renderNode: (props: NodeRendererProps<FolderTreeNodeData>) => React.ReactElement;
  /** Custom row renderer (optional, e.g. FolderTintRow) */
  renderRow?: (props: RowRendererProps<FolderTreeNodeData>) => React.ReactElement;
  /** Override row height (defaults to 32) */
  rowHeight?: number;
}

export const FolderTree = forwardRef<FolderTreeHandle, FolderTreeProps>(
  ({ data, onSelect, renderNode, renderRow, rowHeight: rowHeightProp, ...hookOptions }, ref) => {
    const {
      treeRef,
      containerRef,
      dimensions,
      searchTerm,
      initialOpenState,
      onMove,
      onRename,
      onDelete,
      handleToggle,
      handleKeyDown,
    } = useFolderTree(hookOptions);

    const rowHeight = rowHeightProp ?? 32;

    useImperativeHandle(ref, () => ({
      collapseAll: () => {
        treeRef.current?.closeAll();
        localStorage.removeItem(hookOptions.storageKey);
      },
      edit: (id: string) => {
        treeRef.current?.edit(id);
      },
      select: (id: string) => {
        treeRef.current?.select(id);
      },
      open: (id: string) => {
        treeRef.current?.open(id);
      },
    }));

    return (
      <div
        ref={containerRef}
        className="h-full w-full pl-1"
        // Capture phase so Delete/F2 are claimed before react-arborist's own
        // container handler feeds them into its type-ahead search buffer.
        onKeyDownCapture={handleKeyDown}
      >
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
          // Our own manager, so react-dnd never falls back to its `window`-cached
          // singleton. That cache is released on a ref count that does not track the
          // HTML5 backend's teardown, and a tree mounting into the gap between the two
          // throws "Cannot have two HTML5 backends at the same time." See `dnd-manager`.
          dndManager={getTreeDndManager()}

          renderRow={renderRow}
        >
          {renderNode}
        </Tree>
      </div>
    );
  },
);
