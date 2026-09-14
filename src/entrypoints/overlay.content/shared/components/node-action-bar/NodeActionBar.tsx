import React, { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import type { MenuEntryDef } from './menu-types';
import { renderMenuItems } from './renderMenuItems';

export interface ActionButtonDef {
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

export interface NodeActionBarProps {
  /** Quick action buttons shown directly on the bar (before the three-dot) */
  actions?: ActionButtonDef[];
  /** Menu items for the three-dot dropdown. If empty/undefined, no three-dot button is shown. */
  menuItems?: MenuEntryDef[];
  /** Force the bar to be visible (e.g. when context menu is open) */
  forceVisible?: boolean;
  /** Callback when the dropdown open state changes (so parent can track it) */
  onDropdownOpenChange?: (open: boolean) => void;
}

export const NodeActionBar = ({
  actions,
  menuItems,
  forceVisible,
  onDropdownOpenChange,
}: NodeActionBarProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const hasMenu = !!menuItems && menuItems.length > 0;
  const slotCount = (actions?.length ?? 0) + (hasMenu ? 1 : 0);

  /**
   * Tell the row about the bar: `data-node-actions` marks that a floating bar
   * lives here, and `--node-actions-w` carries its real width.
   *
   * The bar floats over the row, so the title underneath has to be cleared
   * exactly where the buttons begin (see `.node-text-content` in _common.scss).
   * Measuring instead of hard-coding a width keeps that cut correct whether a
   * row carries one button or four, and it survives changes to button size or
   * gap. `visibility: hidden` still produces layout, so the measurement is
   * valid while the bar is idle.
   */
  useLayoutEffect(() => {
    const el = barRef.current;
    const row = el?.parentElement;
    if (!el || !row) return;

    const publish = () => {
      row.style.setProperty('--node-actions-w', `${Math.ceil(el.offsetWidth)}px`);
    };
    publish();
    row.dataset.nodeActions = '';

    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      row.style.removeProperty('--node-actions-w');
      delete row.dataset.nodeActions;
    };
  }, [slotCount]);

  const cancelOpen = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelOpen();
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setIsDropdownOpen(false);
      onDropdownOpenChange?.(false);
    }, 150);
  }, [cancelOpen, cancelClose, onDropdownOpenChange]);

  const handleTriggerEnter = useCallback(() => {
    cancelClose();
    cancelOpen();
    openTimerRef.current = setTimeout(() => {
      setIsDropdownOpen(true);
      onDropdownOpenChange?.(true);
    }, 100);
  }, [cancelClose, cancelOpen, onDropdownOpenChange]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsDropdownOpen(open);
    onDropdownOpenChange?.(open);
  }, [onDropdownOpenChange]);

  // Nothing to show — skip the element entirely so no width gets reserved.
  if (slotCount === 0) return null;

  return (
    <div
      ref={barRef}
      className={cn(
        // `right-2` mirrors the row's own `pr-2`, so the bar's box is exactly
        // the region that has to be cleared from the title. Keep them in sync.
        'invisible group-hover:visible flex items-center gap-1 absolute inset-y-0 right-2',
        'node-action-bar',
        (forceVisible || isDropdownOpen) && 'visible',
      )}
      data-tooltip-suppress
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* Quick action buttons */}
      {actions?.map((action, i) => (
        <SimpleTooltip key={i} content={action.tooltip}>
          <div
            role="button"
            className={cn(
              'h-5 w-5 flex items-center justify-center rounded-sm cursor-pointer transition-colors',
              action.className || 'text-muted-foreground hover:text-foreground',
            )}
            onClick={action.onClick}
          >
            {action.icon}
          </div>
        </SimpleTooltip>
      ))}

      {/* Three-dot dropdown menu */}
      {hasMenu && (
        <DropdownMenu open={isDropdownOpen} onOpenChange={handleOpenChange} modal={false}>
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              className="h-5 w-5 flex items-center justify-center cursor-pointer text-muted-foreground"
              onMouseEnter={handleTriggerEnter}
              onMouseLeave={scheduleClose}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                cancelOpen();
                setIsDropdownOpen((prev) => !prev);
                onDropdownOpenChange?.(!isDropdownOpen);
              }}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-48"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {renderMenuItems(menuItems, 'dropdown', () => handleOpenChange(false))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
