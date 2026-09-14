/**
 * Open-on-hover behaviour for a header dropdown.
 *
 * The pattern comes from `SidePanelMenu`, which is where the sidebar's three-dot menus
 * established it. Extracted so a second such menu does not have to re-derive the two
 * non-obvious parts:
 *
 * 1. **A close delay.** Trigger and content are separate elements with a gap between them,
 *    so moving the pointer from one to the other fires `pointerleave` first. Closing
 *    immediately makes the menu unreachable.
 *
 * 2. **`relatedTarget` is not always a `Node`.** React's enter/leave plugin sets it to
 *    `window` when the pointer moves onto something React does not manage — routine here,
 *    since the panel lives in a shadow root inside the host page. Passing that to
 *    `contains()` throws, so it has to be type-checked rather than null-checked.
 *
 * `onOpenChange` deliberately ignores requests to open. Radix would otherwise open the menu
 * on click as well, and a menu that is already open on hover would toggle shut on the click
 * that was meant to pick an item.
 */

import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Milliseconds to wait before closing, so the pointer can cross the gap. */
const CLOSE_DELAY = 100;

export interface HoverMenuBinding {
  open: boolean;
  /** Spread onto `DropdownMenu`. */
  rootProps: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    modal: false;
  };
  /** Spread onto the trigger element. */
  triggerProps: {
    onPointerEnter: () => void;
    onPointerLeave: (e: ReactPointerEvent) => void;
  };
  /** Spread onto `DropdownMenuContent`. */
  contentProps: {
    ref: (el: HTMLDivElement | null) => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onPointerDownOutside: () => void;
    onEscapeKeyDown: () => void;
  };
}

export function useHoverMenu(): HoverMenuBinding {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentEl = useRef<HTMLDivElement | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  }, [cancelClose]);

  const handleTriggerLeave = useCallback(
    (e: ReactPointerEvent) => {
      // Moving from the trigger into the content is not a leave.
      const target = e.relatedTarget;
      if (target instanceof Node && contentEl.current?.contains(target)) return;
      scheduleClose();
    },
    [scheduleClose],
  );

  return {
    open,
    rootProps: {
      open,
      // Only honour requests to close. See the note on click-toggling above.
      onOpenChange: (next: boolean) => {
        if (!next) setOpen(false);
      },
      modal: false,
    },
    triggerProps: {
      onPointerEnter: () => {
        cancelClose();
        setOpen(true);
      },
      onPointerLeave: handleTriggerLeave,
    },
    contentProps: {
      ref: (el: HTMLDivElement | null) => {
        contentEl.current = el;
      },
      onPointerEnter: cancelClose,
      onPointerLeave: scheduleClose,
      onPointerDownOutside: () => setOpen(false),
      onEscapeKeyDown: () => setOpen(false),
    },
  };
}
