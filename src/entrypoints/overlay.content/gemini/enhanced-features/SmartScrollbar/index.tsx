import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  List,
  PanelRightClose,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useConversationNodes } from './useConversationNodes';
import { SmartScrollbarExpandedView } from './SmartScrollbarExpandedView';
import { SmartScrollbarNormalView } from './SmartScrollbarNormalView';
import { SmartScrollbarMinimizedView } from './SmartScrollbarMinimizedView';
import { useI18n } from '@/shared/hooks/useI18n';

/**
 * 3 parallel modes:
 * - 'normal'    — hover opens a compact panel with nodes; mouse-leave closes
 * - 'maximized' — hover opens a wider panel with full content; mouse-leave closes
 * - 'minimized' — small icon; click shows title + restore button
 *
 * Normal ↔ Maximized are siblings (both hover-to-open).
 * Minimized is a collapsed icon state reachable from either.
 */
type ScrollbarMode = 'normal' | 'maximized' | 'minimized';

export const SmartScrollbar: React.FC = () => {
  const { nodes, activeNodeId, scrollToNode } = useConversationNodes();
  const userCount = nodes.filter((n) => n.role === 'user').length;
  const { t } = useI18n();
  const [mode, setMode] = useState<ScrollbarMode>('normal');
  const [isHovered, setIsHovered] = useState(false);

  const normalRef = useRef<HTMLDivElement>(null!);
  const expandedRef = useRef<HTMLDivElement>(null!);
  const activeNodeRef = useRef<HTMLDivElement>(null!);
  const expandedActiveRef = useRef<HTMLDivElement>(null!);

  const prevHoveredRef = useRef(false);

  // Scroll to active node when hover opens the panel
  useEffect(() => {
    const justHovered = isHovered && !prevHoveredRef.current;
    prevHoveredRef.current = isHovered;

    if (!justHovered) return;

    requestAnimationFrame(() => {
      if (mode === 'maximized') {
        if (expandedActiveRef.current) {
          expandedActiveRef.current.scrollIntoView({ block: 'center' });
        } else if (expandedRef.current) {
          expandedRef.current.scrollTop = expandedRef.current.scrollHeight;
        }
      } else if (mode === 'normal') {
        if (activeNodeRef.current) {
          activeNodeRef.current.scrollIntoView({ block: 'center' });
        } else if (normalRef.current) {
          normalRef.current.scrollTop = normalRef.current.scrollHeight;
        }
      }
    });
  }, [isHovered, mode]);

  // Auto-scroll to keep active node visible when it changes
  useEffect(() => {
    if (!isHovered) return;
    const ref = mode === 'maximized' ? expandedRef : normalRef;
    const activeRef = mode === 'maximized' ? expandedActiveRef : activeNodeRef;
    if (!activeRef.current || !ref.current) return;

    const container = ref.current;
    const activeEl = activeRef.current;
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    if (
      activeRect.top < containerRect.top ||
      activeRect.bottom > containerRect.bottom
    ) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeNodeId, isHovered, mode]);

  const handleTitleClick = () => {
    setIsHovered(false);
  };

  if (nodes.length === 0) return null;

  // Minimized mode renders its own isolated UI
  if (mode === 'minimized') {
    return (
      <SmartScrollbarMinimizedView
        nodeCount={userCount}
        onRestore={() => setMode('normal')}
      />
    );
  }

  const isMaximized = mode === 'maximized';
  const panelOpen = isHovered;

  return (
    <div
      className={cn(
        'fixed right-0 top-1/2 -translate-y-1/2 z-[999998]',
        'flex flex-col items-end',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'flex flex-col max-h-[60vh] overflow-hidden',
          'transition-[width] duration-300 ease-out',
          panelOpen
            ? isMaximized
              ? 'w-[300px]'
              : 'w-[220px]'
            : 'w-[40px]',
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2.5',
            'rounded-tl-xl rounded-tr-none',
            'border border-r-0 border-border/30',
            'bg-background/80 backdrop-blur-xl',
            'text-muted-foreground',
            'shadow-lg shadow-black/5',
            'transition-colors duration-200',
          )}
        >
          <List className="h-4 w-4 shrink-0" />

          {panelOpen && (
            <>
              {/* Title — click to close */}
              <span
                onClick={handleTitleClick}
                className={cn(
                  'text-[16px] font-semibold truncate flex-1 text-left',
                  'animate-in fade-in duration-200',
                  'cursor-pointer hover:text-foreground',
                )}
              >
                {isMaximized
                  ? t('smartScrollbar.conversationOutline')
                  : t('smartScrollbar.messages', { count: userCount })}
              </span>

              {/* Action buttons */}
              <div className="flex items-center gap-0.5 shrink-0">
                {isMaximized ? (
                  <>
                    {/* Restore to normal */}
                    <SimpleTooltip content={t('smartScrollbar.restoreToCompactView')}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMode('normal');
                        }}
                        className={cn(
                          'p-1 rounded-md',
                          'hover:bg-accent/60 hover:text-foreground',
                          'transition-colors duration-150',
                        )}
                      >
                        <ChevronsRight className="h-3.5 w-3.5" />
                      </button>
                    </SimpleTooltip>
                    {/* Minimize to icon */}
                    <SimpleTooltip content={t('smartScrollbar.collapseToIcon')}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMode('minimized');
                        }}
                        className={cn(
                          'p-1 rounded-md',
                          'hover:bg-accent/60 hover:text-foreground',
                          'transition-colors duration-150',
                        )}
                      >
                        <PanelRightClose className="h-3.5 w-3.5" />
                      </button>
                    </SimpleTooltip>
                  </>
                ) : (
                  <>
                    {/* Maximize */}
                    <SimpleTooltip content={t('smartScrollbar.expandToFullOutline')}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMode('maximized');
                        }}
                        className={cn(
                          'p-1 rounded-md',
                          'hover:bg-accent/60 hover:text-foreground',
                          'transition-colors duration-150',
                        )}
                      >
                        <ChevronsLeft className="h-3.5 w-3.5" />
                      </button>
                    </SimpleTooltip>
                    {/* Minimize to icon */}
                    <SimpleTooltip content={t('smartScrollbar.collapseToIcon')}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMode('minimized');
                        }}
                        className={cn(
                          'p-1 rounded-md',
                          'hover:bg-accent/60 hover:text-foreground',
                          'transition-colors duration-150',
                        )}
                      >
                        <PanelRightClose className="h-3.5 w-3.5" />
                      </button>
                    </SimpleTooltip>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Content area — always mounted, visibility controlled by props */}
        {isMaximized ? (
          <>
            <SmartScrollbarExpandedView
              nodes={nodes}
              activeNodeId={activeNodeId}
              scrollToNode={scrollToNode}
              containerRef={expandedRef}
              activeNodeRef={expandedActiveRef}
              visible={panelOpen}
            />
            <SmartScrollbarNormalView
              nodes={nodes}
              activeNodeId={activeNodeId}
              scrollToNode={scrollToNode}
              containerRef={normalRef}
              activeNodeRef={activeNodeRef}
              visible={!panelOpen}
              dotsOnly
            />
          </>
        ) : (
          <SmartScrollbarNormalView
            nodes={nodes}
            activeNodeId={activeNodeId}
            scrollToNode={scrollToNode}
            containerRef={normalRef}
            activeNodeRef={activeNodeRef}
            visible
            dotsOnly={!panelOpen}
          />
        )}
      </div>
    </div>
  );
};
