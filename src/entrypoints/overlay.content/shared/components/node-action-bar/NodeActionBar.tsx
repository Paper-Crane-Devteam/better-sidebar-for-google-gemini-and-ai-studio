import React, { useState, useCallback, useRef } from 'react';
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
  /** Custom inline style for the bar background (colored folders) */
  barStyle?: React.CSSProperties;
  /** Custom inline style for the gradient mask (colored folders) */
  gradientStyle?: React.CSSProperties;
  /** Callback when the dropdown open state changes (so parent can track it) */
  onDropdownOpenChange?: (open: boolean) => void;
}

export const NodeActionBar = ({
  actions,
  menuItems,
  forceVisible,
  barStyle,
  gradientStyle,
  onDropdownOpenChange,
}: NodeActionBarProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const hasMenu = menuItems && menuItems.length > 0;

  return (
    <div
      className={cn(
        'invisible group-hover:visible flex items-center gap-1 absolute right-0 pr-2 top-0 bottom-0',
        'node-action-bar',
        (forceVisible || isDropdownOpen) && 'visible',
      )}
      style={barStyle}
      data-tooltip-suppress
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* Gradient fade mask */}
      <div
        className="absolute inset-y-0 -left-6 w-6 pointer-events-none [background:inherit] [mask-image:linear-gradient(to_right,transparent,black)]"
        style={gradientStyle}
      />

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
            {renderMenuItems(menuItems, 'dropdown')}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
