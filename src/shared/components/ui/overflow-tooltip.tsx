import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils/utils';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';

export type OverflowTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface OverflowTooltipProps {
  /** The text content to display. Tooltip shown only when this overflows. */
  children: React.ReactNode;
  /** Full content to display in the tooltip (defaults to children if not provided) */
  content?: React.ReactNode;
  /** Placement of the tooltip relative to the trigger element */
  placement?: OverflowTooltipPlacement;
  /** Gap between the tooltip and the trigger element in pixels */
  offset?: number;
  /** Additional class name for the trigger wrapper */
  className?: string;
  /** Additional class name for the tooltip content */
  tooltipClassName?: string;
  /** Delay in ms before showing the tooltip */
  showDelay?: number;
  /** Optional external ref for hover detection (overflow check still uses the inner text element) */
  hoverRef?: React.RefObject<HTMLElement | null>;
}

/**
 * A tooltip component that only appears when text content overflows its container.
 * Unlike the Radix-based SimpleTooltip (designed for icons), this component:
 * - Detects text overflow automatically
 * - Supports configurable placement (top/bottom/left/right)
 * - Supports configurable offset distance
 * - Calculates position dynamically and portals into the TooltipHelper container
 */
export const OverflowTooltip: React.FC<OverflowTooltipProps> = ({
  children,
  content,
  placement = 'right',
  offset = 8,
  className,
  tooltipClassName,
  showDelay = 300,
  hoverRef,
}) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // Check if the trigger element's content overflows
  const checkOverflow = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const overflows =
      el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
    setIsOverflowing(overflows);
  }, []);

  // Re-check overflow when children change
  useEffect(() => {
    checkOverflow();
  }, [children, checkOverflow]);

  // Also watch for resize
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [checkOverflow]);

  // Calculate tooltip position based on placement — returns coords instead of setting state
  const calculatePosition = useCallback((): { top: number; left: number } | null => {
    const triggerEl = triggerRef.current;
    const tooltipEl = tooltipRef.current;
    if (!triggerEl || !tooltipEl) return null;

    const triggerRect = triggerEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.right + offset;
        break;
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
        left = triggerRect.left - tooltipRect.width - offset;
        break;
      case 'top':
        top = triggerRect.top - tooltipRect.height - offset;
        left =
          triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
        top = triggerRect.bottom + offset;
        left =
          triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
        break;
    }

    // Viewport clamping
    const margin = 8;
    if (top < margin) top = margin;
    if (top + tooltipRect.height > viewportHeight - margin)
      top = viewportHeight - margin - tooltipRect.height;
    if (left < margin) left = margin;
    if (left + tooltipRect.width > viewportWidth - margin)
      left = viewportWidth - margin - tooltipRect.width;

    return { top, left };
  }, [placement, offset]);

  // Recalculate position when tooltip becomes visible
  useEffect(() => {
    if (isVisible) {
      setIsPositioned(false);
      // Double rAF: first frame renders the invisible tooltip so we can measure,
      // second frame applies position directly to DOM and reveals.
      requestAnimationFrame(() => {
        const pos = calculatePosition();
        if (pos) {
          setPosition(pos);
        }
        requestAnimationFrame(() => {
          setIsPositioned(true);
        });
      });
    }
  }, [isVisible, calculatePosition]);

  const handleMouseEnter = () => {
    if (!isOverflowing) return;

    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, showDelay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // When an external hoverRef is provided, attach hover listeners to it.
  // We also need to dismiss the tooltip when the pointer moves over the
  // node-action-bar (or any element marked with data-tooltip-suppress) so
  // that hovering the action buttons doesn't trigger the underlying tooltip.
  useEffect(() => {
    const el = hoverRef?.current;
    if (!el) return;

    const onEnter = (e: MouseEvent) => {
      // If the pointer entered from a tooltip-suppressed child (e.g. action bar),
      // the relatedTarget will be inside that child — ignore.
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest?.('[data-tooltip-suppress]')) return;
      handleMouseEnter();
    };

    const onLeave = (e: MouseEvent) => {
      // If the pointer is moving into a tooltip-suppressed child, hide tooltip.
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest?.('[data-tooltip-suppress]')) {
        handleMouseLeave();
        return;
      }
      handleMouseLeave();
    };

    const onMove = (e: MouseEvent) => {
      // While visible, if the pointer moves over a suppressed region, dismiss.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-tooltip-suppress]')) {
        handleMouseLeave();
      }
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('mousemove', onMove);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mousemove', onMove);
    };
  }, [hoverRef, isOverflowing]); // re-attach when overflow state changes

  const portalContainer = TooltipHelper.getInstance().getContainer();

  return (
    <>
      <div
        ref={triggerRef}
        className={cn('truncate', className)}
        onMouseEnter={hoverRef ? undefined : handleMouseEnter}
        onMouseLeave={hoverRef ? undefined : handleMouseLeave}
      >
        {children}
      </div>

      {isVisible &&
        isOverflowing &&
        createPortal(
          <div
            ref={tooltipRef}
            className={cn(
              'fixed z-[2147483647] pointer-events-none',
              'px-3 py-1.5 rounded-md text-xs',
              'bg-foreground text-background dark:bg-foreground dark:text-background',
              'shadow-sm shadow-black/10 dark:shadow-black/20',
              'max-w-[320px] break-words',
              isPositioned
                ? 'animate-in fade-in-0 duration-100'
                : 'opacity-0',
              tooltipClassName,
            )}
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {content ?? children}
          </div>,
          portalContainer,
        )}
    </>
  );
};
