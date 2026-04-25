import React, { forwardRef, useImperativeHandle } from 'react';
import { Tree, NodeRendererProps, RowRendererProps } from 'react-arborist';
import { FolderTreeNodeData, FolderTreeHandle } from './types';
import { useFolderTree, UseFolderTreeOptions } from './useFolderTree';
import { useSettingsStore } from '@/shared/lib/settings-store';

export interface FolderTreeProps extends UseFolderTreeOptions {
  /** Tree data (already transformed into hierarchy) */
  data: FolderTreeNodeData[];
  /** Called when node selection changes */
  onSelect?: (nodes: any[]) => void;
  /** Custom node renderer */
  renderNode: (props: NodeRendererProps<FolderTreeNodeData>) => React.ReactElement;
  /** Custom row renderer (optional, e.g. FolderTintRow) */
  renderRow?: (props: RowRendererProps<FolderTreeNodeData>) => React.ReactElement;
  /** Override row height (defaults to density-based) */
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
    } = useFolderTree(hookOptions);

    const layoutDensity = useSettingsStore((s) => s.layoutDensity);
    const rowHeight = rowHeightProp ?? (layoutDensity === 'compact' ? 32 : 38);

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
      <div ref={containerRef} className="h-full w-full">
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
          searchTerm={searchTerm}
          searchMatch={(node, term) =>
            node.data.name.toLowerCase().includes(term.toLowerCase())
          }
          renderRow={renderRow}
        >
          {renderNode}
        </Tree>
      </div>
    );
  },
);
