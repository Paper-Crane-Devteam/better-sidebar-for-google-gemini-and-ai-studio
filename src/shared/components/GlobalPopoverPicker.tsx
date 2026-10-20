import { useRef, useEffect, useState, useCallback } from 'react';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { cn } from '@/shared/lib/utils/utils';

/**
 * A transparent-background popover that positions itself to the right of
 * the anchor element (like a tooltip). No overlay, no confirm/cancel buttons.
 * Closes when clicking outside or pressing Escape.
 *
 * Mounted inside the enhanced-features shadow DOM alongside GlobalModal.
 */
export const GlobalPopoverPicker = () => {
  const { isOpen, anchorRect, content, width, placement, close } = usePopoverPickerStore();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);

  // Calculate position: to the right of the anchor, vertically centered
  const calculatePosition = useCallback(() => {
    if (!anchorRect || !popoverRef.current) return;

    const popoverRect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8; // 8px gap between anchor and popover

    if (placement === 'bottom-end') {
      // Dropdown: below the anchor, right edges aligned; flip above when it doesn't fit
      let top = anchorRect.bottom + 4;
      if (top + popoverRect.height > viewportHeight - 8 && anchorRect.top - 4 - popoverRect.height >= 8) {
        top = anchorRect.top - 4 - popoverRect.height;
      }
      top = Math.max(8, Math.min(top, viewportHeight - 8 - popoverRect.height));
      const left = Math.max(8, Math.min(anchorRect.right - popoverRect.width, viewportWidth - 8 - popoverRect.width));
      setPosition({ top, left });
      return;
    }

    let top = anchorRect.top + anchorRect.height / 2 - popoverRect.height / 2;
    let left = anchorRect.right + gap;

    // If overflows right, try positioning to the left
    if (left + popoverRect.width > viewportWidth - 8) {
      left = anchorRect.left - popoverRect.width - gap;
    }

    // If overflows left, fall back to right but clamp
    if (left < 8) {
      left = 8;
    }

    // Vertical clamping
    if (top < 8) top = 8;
    if (top + popoverRect.height > viewportHeight - 8) {
      top = viewportHeight - 8 - popoverRect.height;
    }

    setPosition({ top, left });
  }, [anchorRect, placement]);

  // Dropdown content can change height (e.g. switching to an inline form); keep it in view
  useEffect(() => {
    if (!isOpen || placement !== 'bottom-end' || !popoverRef.current) return;
    const ro = new ResizeObserver(() => calculatePosition());
    ro.observe(popoverRef.current);
    return () => ro.disconnect();
  }, [isOpen, placement, calculatePosition]);

  // Position on open
  useEffect(() => {
    if (!isOpen) {
      setIsPositioned(false);
      return;
    }

    // Double rAF to let the popover render invisibly first, then measure & position
    requestAnimationFrame(() => {
      calculatePosition();
      requestAnimationFrame(() => {
        setIsPositioned(true);
      });
    });
  }, [isOpen, calculatePosition]);

  // Close on outside click — use composedPath() to handle shadow DOM boundaries
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (!popoverRef.current) return;

      // composedPath() crosses shadow DOM boundaries, so we can correctly
      // detect clicks inside the popover even though it's in a shadow root.
      const path = e.composedPath();
      if (path.includes(popoverRef.current)) return;
      // Radix popper content (e.g. a Select's option list) opened from inside the
      // popover is portaled elsewhere; clicking it is still "inside".
      const inPortaledPopper = path.some(
        (n) => n instanceof Element && n.hasAttribute('data-radix-popper-content-wrapper'),
      );
      if (!inPortaledPopper) close();
    };

    // Use setTimeout to avoid immediately closing from the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown, true);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [isOpen, close]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen || !anchorRect) return null;

  return (
    <div
      ref={popoverRef}
      className={cn(
        'fixed z-[10002] rounded-lg shadow-[shadow:var(--shadow-popover)] overflow-hidden',
        'bg-popover',
        isPositioned
          ? cn(
              'animate-in fade-in-0 zoom-in-95 duration-150',
              placement === 'bottom-end' ? 'slide-in-from-top-1' : 'slide-in-from-left-1',
            )
          : 'opacity-0',
      )}
      style={{
        top: position.top,
        left: position.left,
        width: width ?? 280,
      }}
    >
      {/* Wrapper with padding matching GlobalModal's content area (px-6 py-4)
          so that PickerContent's negative margins (-mx-6 -my-4) cancel out correctly */}
      <div className="px-6 py-4">
        {content}
      </div>
    </div>
  );
};
