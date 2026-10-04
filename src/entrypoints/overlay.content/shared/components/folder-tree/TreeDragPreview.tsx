import React, { CSSProperties, RefObject } from 'react';
import { DragPreviewProps, NodeApi, TreeApi } from 'react-arborist';
import { FolderTreeNodeData } from './types';

/**
 * Drag preview for `FolderTree`.
 *
 * react-arborist's default preview renders the dragged node at `opacity: 0.2` with a
 * transparent background and no height, so all that shows is faint text. This one draws
 * the node inside a card (background + border + shadow) at the real row height, so the
 * thing being dragged still looks like an entry. The card is partly transparent, so the
 * drop line and the rows underneath stay visible through it.
 *
 * react-arborist does not export its tree context, so the preview reads the tree through
 * the same ref `FolderTree` passes to `<Tree>`.
 */
export function createTreeDragPreview(
  treeRef: RefObject<TreeApi<FolderTreeNodeData> | null>,
): React.ComponentType<DragPreviewProps> {
  return function TreeDragPreview({ offset, id, dragIds, isDragging }: DragPreviewProps) {
    const tree = treeRef.current;
    // All trees share one dnd manager, so every tree's preview layer sees every drag.
    // Only the tree that owns the dragged node draws anything.
    const node = isDragging && id && tree ? tree.get(id) : null;
    if (!tree || !node || !offset) return null;

    // The drag source is the row content, which already starts after the indent.
    // Match its width so the card lines up with the row it was picked up from.
    // `FolderTree` always passes a measured pixel width, but the prop type also allows strings.
    const treeWidth = typeof tree.width === 'number' ? tree.width : 300;
    const width = Math.max(160, treeWidth - node.level * tree.indent - 8);
    const count = dragIds.length;

    return (
      <div style={LAYER_STYLE}>
        {/* Partly transparent so the drop line and the rows underneath stay visible.
            Applied to the whole card, so the card still reads as a single surface. */}
        <div
          className="relative rounded-md border border-border bg-background shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
          style={{
            width,
            height: tree.rowHeight,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            opacity: 0.7,
          }}
        >
          {/* One surface in the theme's selected color, so the card reads as the
              picked-up row. The row inside drops its own background (see
              `.tree-drag-preview-node` in _common.scss). */}
          <div className="node-item-selected tree-drag-preview-node h-full w-full rounded-[5px]">
            <PreviewNode tree={tree} node={node} />
          </div>
          {count > 1 && (
            <div className="absolute -top-2 -right-2 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center shadow">
              {count}
            </div>
          )}
        </div>
      </div>
    );
  };
}

const LAYER_STYLE: CSSProperties = {
  position: 'fixed',
  pointerEvents: 'none',
  zIndex: 2147483000,
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
};

// Fill the card exactly: no indent, no row margins.
const NODE_STYLE: CSSProperties = { height: '100%', width: '100%', margin: 0, paddingLeft: 0 };

const PreviewNode = ({
  tree,
  node,
}: {
  tree: TreeApi<FolderTreeNodeData>;
  node: NodeApi<FolderTreeNodeData>;
}) => {
  const RenderNode = tree.renderNode;
  return <RenderNode preview node={node} style={NODE_STYLE} tree={tree} />;
};
