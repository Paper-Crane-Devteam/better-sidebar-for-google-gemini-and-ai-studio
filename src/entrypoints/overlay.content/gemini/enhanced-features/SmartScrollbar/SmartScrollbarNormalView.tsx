import React from 'react';
import { cn } from '@/shared/lib/utils/utils';
import { OverflowTooltip } from '@/shared/components/ui/overflow-tooltip';
import type { ConversationNode } from './types';

const MAX_DOTS = 15;

interface Props {
  nodes: ConversationNode[];
  activeNodeId: string | null;
  scrollToNode: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  activeNodeRef: React.RefObject<HTMLDivElement>;
  visible: boolean;
  /** When true, render minimal dots only (no text). */
  dotsOnly?: boolean;
}

function truncateText(text: string, maxLen: number) {
  return text.length <= maxLen ? text : text.substring(0, maxLen) + '…';
}

/**
 * For dotsOnly mode: filter to only inDom USER nodes, cap at MAX_DOTS,
 * centered around the active node. Model nodes are excluded to keep dots compact.
 */
function getDotsNodes(
  nodes: ConversationNode[],
  activeNodeId: string | null,
): ConversationNode[] {
  const activeNodes = nodes.filter((n) => n.inDom);
  if (activeNodes.length <= MAX_DOTS) return activeNodes;

  const activeIdx = activeNodes.findIndex((n) => n.id === activeNodeId);
  const center = activeIdx >= 0 ? activeIdx : Math.floor(activeNodes.length / 2);

  let start = center - Math.floor(MAX_DOTS / 2);
  let end = start + MAX_DOTS;

  if (start < 0) {
    start = 0;
    end = MAX_DOTS;
  } else if (end > activeNodes.length) {
    end = activeNodes.length;
    start = end - MAX_DOTS;
  }

  return activeNodes.slice(start, end);
}

/**
 * Normal mode view.
 * - dotsOnly=true  → minimal dot indicators for inDom nodes only (max 15, centered on active)
 * - dotsOnly=false → compact text list with overflow tooltips (all nodes)
 */
export const SmartScrollbarNormalView: React.FC<Props> = ({
  nodes,
  activeNodeId,
  scrollToNode,
  containerRef,
  activeNodeRef,
  visible,
  dotsOnly = false,
}) => {
  const userNodes = nodes.filter((n) => n.role === 'user');
  const displayNodes = dotsOnly ? getDotsNodes(userNodes, activeNodeId) : userNodes;

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex-1 overflow-y-auto overflow-x-hidden',
        'border border-r-0 border-t-0 border-border/30',
        'bg-background/80 backdrop-blur-xl',
        'rounded-bl-xl',
        'shadow-lg shadow-black/5',
        'custom-scrollbar',
        !visible && 'hidden',
      )}
    >
      <div
        className={cn(
          'flex flex-col',
          dotsOnly ? 'items-center gap-1 py-2.5' : 'gap-0 py-1',
        )}
      >
        {displayNodes.map((node) => {
          const isActive = node.inDom && node.id === activeNodeId;
          return (
            <div
              key={node.id}
              ref={isActive ? activeNodeRef : null}
              onClick={() => node.inDom && scrollToNode(node.id)}
              className={cn(
                'group relative flex items-center justify-center',
                'transition-all duration-200',
                node.inDom ? 'cursor-pointer' : 'cursor-default opacity-40',
                dotsOnly ? 'p-1.5' : 'w-full px-1.5 py-0',
              )}
            >
              {dotsOnly ? (
                <DotItem node={node} isActive={isActive} />
              ) : (
                <HoveredItem node={node} isActive={isActive} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Hovered state: truncated text with overflow tooltip */
const HoveredItem: React.FC<{
  node: ConversationNode;
  isActive: boolean;
}> = ({ node, isActive }) => (
  <div
    className={cn(
      'flex items-center gap-1.5 w-full rounded-md px-2 py-[3px]',
      'transition-all duration-150',
      node.inDom && 'hover:bg-accent/60',
      isActive ? 'bg-primary/10' : '',
    )}
  >
    <div
      className={cn(
        'h-1.5 w-1.5 rounded-full shrink-0',
        'transition-all duration-200',
        isActive
          ? 'bg-primary scale-125 shadow-sm shadow-primary/40'
          : 'bg-muted-foreground/40 group-hover:bg-muted-foreground/70',
      )}
    />
    <OverflowTooltip
      content={node.content}
      placement="left"
      offset={24}
      className={cn(
        'text-[13px] leading-snug',
        'animate-in fade-in slide-in-from-right-2 duration-200',
        isActive
          ? 'text-primary font-semibold'
          : 'text-muted-foreground group-hover:text-foreground',
      )}
      tooltipClassName="text-sm"
    >
      {truncateText(node.content, 25)}
    </OverflowTooltip>
  </div>
);

/** Default state: minimal dots */
const DotItem: React.FC<{
  node: ConversationNode;
  isActive: boolean;
}> = ({ node, isActive }) => (
  <div className="relative">
    <div
      className={cn(
        'rounded-full transition-all duration-200',
        isActive
          ? 'h-3 w-3 bg-primary shadow-md shadow-primary/30'
          : node.inDom
            ? 'h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60 hover:scale-150'
            : 'h-1.5 w-1.5 bg-muted-foreground/15',
      )}
    />
    {isActive && (
      <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
    )}
  </div>
);
