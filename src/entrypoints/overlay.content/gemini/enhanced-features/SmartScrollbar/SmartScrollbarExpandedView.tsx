import React from 'react';
import { cn } from '@/shared/lib/utils/utils';
import type { ConversationNode } from './types';

interface Props {
  nodes: ConversationNode[];
  activeNodeId: string | null;
  scrollToNode: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  activeNodeRef: React.RefObject<HTMLDivElement>;
  visible: boolean;
}

function truncateText(text: string, maxLen: number) {
  return text.length <= maxLen ? text : text.substring(0, maxLen) + '…';
}

export const SmartScrollbarExpandedView: React.FC<Props> = ({
  nodes,
  activeNodeId,
  scrollToNode,
  containerRef,
  activeNodeRef,
  visible,
}) => (
  <div
    ref={containerRef}
    className={cn(
      'flex-1 overflow-y-auto overflow-x-hidden',
      'border border-r-0 border-t-0 border-border/30',
      'bg-background/80 backdrop-blur-xl',
      'rounded-bl-xl',
      'shadow-lg shadow-black/5',
      'custom-scrollbar',
      'transition-all duration-300',
      !visible && 'hidden',
    )}
  >
    <div className="py-2.5">
      {nodes.map((node, index) => {
        const isActive = node.inDom && node.id === activeNodeId;
        return (
          <div
            key={node.id}
            ref={isActive ? activeNodeRef : null}
            onClick={() => node.inDom && scrollToNode(node.id)}
            className={cn(
              'group flex items-start gap-3 px-3.5 py-2.5 mx-1.5 rounded-lg',
              'transition-all duration-150',
              node.inDom
                ? 'cursor-pointer hover:bg-accent/60'
                : 'cursor-default opacity-40',
              isActive
                ? 'bg-primary/10 text-primary'
                : node.inDom
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground',
            )}
          >
            {/* Index Circle */}
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold mt-0.5',
                'transition-colors duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                  : 'bg-muted/60 text-muted-foreground group-hover:bg-muted',
              )}
            >
              {index + 1}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'text-sm leading-relaxed',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {truncateText(node.content, 80)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
