import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Minus } from 'lucide-react';
import { useConversationNodes } from './useConversationNodes';
import { cn } from '@/shared/lib/utils/utils';

export const SmartScrollbar: React.FC = () => {
  const { nodes, activeNodeId, scrollToNode } = useConversationNodes();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const activeNodeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the sidebar to keep active node visible
  useEffect(() => {
    if (activeNodeRef.current && scrollbarRef.current && !isExpanded) {
      const container = scrollbarRef.current;
      const activeEl = activeNodeRef.current;
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();

      if (
        activeRect.top < containerRect.top ||
        activeRect.bottom > containerRect.bottom
      ) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [activeNodeId, isExpanded]);

  if (nodes.length === 0) return null;

  const truncateText = (text: string, maxLen: number) => {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '…';
  };

  return (
    <div
      className={cn(
        'fixed right-0 top-1/2 -translate-y-1/2 z-[999998]',
        'flex flex-col items-end',
        'transition-all duration-300 ease-out',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Main Container */}
      <div
        className={cn(
          'flex flex-col',
          'transition-all duration-300 ease-out',
          isExpanded
            ? 'w-[280px] max-h-[70vh]'
            : isHovered
              ? 'w-[200px] max-h-[60vh]'
              : 'w-[40px] max-h-[60vh]',
        )}
      >
        {/* Header - Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center gap-2 px-2.5 py-2',
            'rounded-tl-xl rounded-tr-none',
            'border border-r-0 border-border/30',
            'bg-background/80 backdrop-blur-xl',
            'text-muted-foreground hover:text-foreground',
            'transition-all duration-200',
            'hover:bg-accent/50',
            'shadow-lg shadow-black/5',
          )}
          title={isExpanded ? 'Collapse outline' : 'Expand outline'}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          {(isExpanded || isHovered) && (
            <span className="text-[11px] font-semibold truncate flex-1 text-left animate-in fade-in duration-200">
              {isExpanded ? 'Conversation Outline' : `${nodes.length} messages`}
            </span>
          )}
          {(isExpanded || isHovered) &&
            (isExpanded ? (
              <ChevronUp className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ))}
        </button>

        {/* Scrollbar Track / Expanded Outline */}
        <div
          ref={scrollbarRef}
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden',
            'border border-r-0 border-t-0 border-border/30',
            'bg-background/80 backdrop-blur-xl',
            'rounded-bl-xl',
            'shadow-lg shadow-black/5',
            'custom-scrollbar',
            'transition-all duration-300',
          )}
        >
          {isExpanded ? (
            /* Expanded: Full outline view */
            <div className="py-1.5">
              {nodes.map((node, index) => (
                <div
                  key={node.id}
                  ref={node.id === activeNodeId ? activeNodeRef : null}
                  onClick={() => scrollToNode(node.id)}
                  className={cn(
                    'group flex items-start gap-2.5 px-3 py-2 mx-1.5 rounded-lg cursor-pointer',
                    'transition-all duration-150',
                    'hover:bg-accent/60',
                    node.id === activeNodeId
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {/* Index Circle */}
                  <div
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5',
                      'transition-colors duration-150',
                      node.id === activeNodeId
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
                        'text-[12px] leading-relaxed',
                        node.id === activeNodeId
                          ? 'font-semibold'
                          : 'font-medium',
                      )}
                    >
                      {truncateText(node.content, 80)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Collapsed: Mini scrollbar with dots/nodes */
            <div className="flex flex-col items-center py-2 gap-0.5">
              {nodes.map((node, index) => (
                <div
                  key={node.id}
                  ref={node.id === activeNodeId ? activeNodeRef : null}
                  onClick={() => scrollToNode(node.id)}
                  className={cn(
                    'group relative flex items-center justify-center cursor-pointer',
                    'transition-all duration-200',
                    isHovered ? 'w-full px-2 py-1' : 'p-1',
                  )}
                  title={truncateText(node.content, 50)}
                >
                  {isHovered ? (
                    /* Hovered: show truncated text */
                    <div
                      className={cn(
                        'flex items-center gap-2 w-full rounded-md px-2 py-1',
                        'transition-all duration-150',
                        'hover:bg-accent/60',
                        node.id === activeNodeId ? 'bg-primary/10' : '',
                      )}
                    >
                      <div
                        className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          'transition-all duration-200',
                          node.id === activeNodeId
                            ? 'bg-primary scale-125 shadow-sm shadow-primary/40'
                            : 'bg-muted-foreground/40 group-hover:bg-muted-foreground/70',
                        )}
                      />
                      <span
                        className={cn(
                          'text-[10px] truncate',
                          'animate-in fade-in slide-in-from-right-2 duration-200',
                          node.id === activeNodeId
                            ? 'text-primary font-semibold'
                            : 'text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        {truncateText(node.content, 25)}
                      </span>
                    </div>
                  ) : (
                    /* Default: minimal dots */
                    <div className="relative">
                      <div
                        className={cn(
                          'rounded-full transition-all duration-200',
                          node.id === activeNodeId
                            ? 'h-3 w-3 bg-primary shadow-md shadow-primary/30'
                            : 'h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60 hover:scale-150',
                        )}
                      />
                      {/* Active indicator glow */}
                      {node.id === activeNodeId && (
                        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
