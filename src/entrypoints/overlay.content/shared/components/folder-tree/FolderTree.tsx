import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import { Tree, NodeRendererProps, RowRendererProps, NodeApi } from 'react-arborist';
import { FolderTreeNodeData, FolderTreeHandle } from './types';
import { useFolderTree, UseFolderTreeOptions } from './useFolderTree';
import { getTreeDndManager } from './dnd-manager';
import { createTreeDragPreview } from './TreeDragPreview';

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
  /** Rows that can't be dragged. Default: every row can. */
  disableDrag?: (data: FolderTreeNodeData) => boolean;
  /** Drop targets to refuse. Default: anywhere except into a row's own subtree. */
  disableDrop?: (args: {
    parentNode: NodeApi<FolderTreeNodeData>;
    dragNodes: NodeApi<FolderTreeNodeData>[];
    index: number;
  }) => boolean;
  /**
   * Rows that can't be renamed. Default: none when `onRenameItem` is set, all
   * otherwise. Needed when only some rows of a tree are renamable.
   */
  disableEdit?: (data: FolderTreeNodeData) => boolean;
}

export const FolderTree = forwardRef<FolderTreeHandle, FolderTreeProps>(
  (
    {
      data,
      onSelect,
      renderNode,
      renderRow,
      rowHeight: rowHeightProp,
      disableDrag,
      disableDrop,
      disableEdit,
      ...hookOptions
    },
    ref,
  ) => {
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

    // Stable component identity: react-arborist renders `renderDragPreview` as a
    // component, so a new function each render would remount it mid-drag.
    const renderDragPreview = useMemo(() => createTreeDragPreview(treeRef), [treeRef]);

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
          // No rename handler means the tree's items cannot be renamed here (gems:
          // names live in Gemini). Without this F2 opens an input that saves nothing.
          disableEdit={!hookOptions.onRenameItem || disableEdit}
          disableDrag={disableDrag}
          disableDrop={disableDrop}
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
          renderDragPreview={renderDragPreview}
        >
          {renderNode}
        </Tree>
      </div>
    );
  },
);
