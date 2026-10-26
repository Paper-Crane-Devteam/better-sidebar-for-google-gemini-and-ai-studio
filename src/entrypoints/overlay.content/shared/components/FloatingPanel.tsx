import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils/utils';
import { getPopupLayerContainer } from '@/shared/lib/popup-layer';
import { useShadowRoot } from '@/shared/components/ShadowRootContext';

export interface FloatingPanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type Mode = 'move' | ResizeDir;

interface FloatingPanelProps {
  /** Header content (title). The whole header row is the drag handle. */
  title: React.ReactNode;
  /** Buttons on the right of the header. Clicking them never starts a drag. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Initial / externally changed geometry. Live drag state is kept internally. */
  rect: FloatingPanelRect;
  /** Called once when a drag or resize ends, with the final geometry. */
  onRectCommit?: (rect: FloatingPanelRect) => void;
  minWidth?: number;
  minHeight?: number;
  ariaLabel?: string;
  className?: string;
  /**
   * Shrink to just the header a moment after the pointer leaves, so the panel
   * stops covering the page. The body disappears and becomes click-through;
   * hovering the header brings it back.
   */
  autoDim?: boolean;
}

/** How much of the panel must stay on screen so it can always be grabbed again. */
const KEEP_VISIBLE = 48;
/** Delay after the pointer leaves before fading out. */
const DIM_DELAY = 2000;
/** Grace period after opening, so the panel doesn't vanish before it's noticed. */
const DIM_INITIAL_DELAY = 4000;

const SURFACE_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--panel-bg, rgb(var(--popover)))',
  boxShadow: 'var(--shadow-panel)',
  backdropFilter: 'var(--panel-blur)',
  WebkitBackdropFilter: 'var(--panel-blur)',
};
const DIMMED_SURFACE_STYLE: React.CSSProperties = {
  backgroundColor: 'transparent',
  boxShadow: 'none',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
};
const HEADER_HEIGHT = 32;

const HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: 'n', className: 'top-[-3px] left-3 right-3 h-[6px] cursor-ns-resize' },
  { dir: 's', className: 'bottom-[-3px] left-3 right-3 h-[6px] cursor-ns-resize' },
  { dir: 'e', className: 'right-[-3px] top-3 bottom-3 w-[6px] cursor-ew-resize' },
  { dir: 'w', className: 'left-[-3px] top-3 bottom-3 w-[6px] cursor-ew-resize' },
  { dir: 'nw', className: 'top-[-4px] left-[-4px] h-3 w-3 cursor-nwse-resize' },
  { dir: 'se', className: 'bottom-[-4px] right-[-4px] h-3 w-3 cursor-nwse-resize' },
  { dir: 'ne', className: 'top-[-4px] right-[-4px] h-3 w-3 cursor-nesw-resize' },
  { dir: 'sw', className: 'bottom-[-4px] left-[-4px] h-3 w-3 cursor-nesw-resize' },
];

/**
 * A private portal node inside the popup layer (topmost shadow DOM, where
 * menus/tooltips also go, so they stack above the panel).
 *
 * We can't portal straight into the popup layer's `.shadow-body`: it is also
 * the container of another React root, and that root's first commit clears its
 * container — on Gemini it commits after the sidebar has already portaled the
 * panel in, silently deleting it while React still thinks it is mounted. So we
 * own a node and put it back whenever it gets removed.
 */
function usePanelLayer(): HTMLElement | null {
  const shadowRoot = useShadowRoot();
  const [node] = useState(() => {
    const el = document.createElement('div');
    el.dataset.floatingPanelLayer = '';
    return el;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const parent = getPopupLayerContainer() ?? shadowRoot;
    if (!parent) return;
    const attach = () => {
      if (node.parentNode !== parent) parent.appendChild(node);
    };
    attach();
    setReady(true);
    const mo = new MutationObserver(attach);
    mo.observe(parent, { childList: true });
    return () => {
      mo.disconnect();
      node.remove();
    };
  }, [node, shadowRoot]);

  return ready ? node : null;
}

/** Keep size within the viewport and enough of the header on screen to grab it. */
function clampRect(r: FloatingPanelRect, minW: number, minH: number): FloatingPanelRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(r.width, minW), vw);
  const height = Math.min(Math.max(r.height, minH), vh);
  const x = Math.min(Math.max(r.x, KEEP_VISIBLE - width), vw - KEEP_VISIBLE);
  const y = Math.min(Math.max(r.y, 0), vh - HEADER_HEIGHT);
  return { x, y, width, height };
}

/**
 * Modeless floating window: draggable by its header, resizable from all edges
 * and corners, no backdrop.
 *
 * Why it stays smooth:
 * - Pointer Events + setPointerCapture: moves keep arriving over iframes and
 *   outside the window, and the cursor stays the handle's cursor.
 * - No React state during interaction. Moves only update a ref; a single rAF
 *   per frame writes `transform` / size straight to the DOM. Children never
 *   re-render while dragging, so heavy content costs nothing.
 * - Position is a composited `translate3d` on a `will-change` layer, and the
 *   backdrop blur (re-sampled every frame otherwise) is suspended while moving.
 * - The parent only hears about the result once, on pointerup.
 */
export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  title,
  actions,
  children,
  rect,
  onRectCommit,
  minWidth = 220,
  minHeight = 160,
  ariaLabel,
  className,
  autoDim = false,
}) => {
  const container = usePanelLayer();

  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<FloatingPanelRect>(clampRect(rect, minWidth, minHeight));
  const rafRef = useRef(0);
  const dragRef = useRef<{
    mode: Mode;
    pointerId: number;
    startX: number;
    startY: number;
    start: FloatingPanelRect;
  } | null>(null);

  // ── Auto-dim ─────────────────────────────────────────────────────
  // Hover/focus live in refs so the timer callback sees current values
  // without re-creating handlers; only `dimmed` itself is React state.
  const [dimmed, setDimmed] = useState(false);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const dimTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const clearDimTimer = () => {
    if (dimTimerRef.current) clearTimeout(dimTimerRef.current);
    dimTimerRef.current = undefined;
  };

  const scheduleDim = useCallback(
    (delay: number) => {
      clearDimTimer();
      if (!autoDim) return;
      dimTimerRef.current = setTimeout(() => {
        dimTimerRef.current = undefined;
        if (hoverRef.current || focusRef.current || dragRef.current) return;
        setDimmed(true);
      }, delay);
    },
    [autoDim],
  );

  const wake = () => {
    clearDimTimer();
    setDimmed(false);
  };

  useEffect(() => {
    if (!autoDim) {
      clearDimTimer();
      setDimmed(false);
    } else if (!hoverRef.current && !focusRef.current) {
      scheduleDim(DIM_INITIAL_DELAY);
    }
    return clearDimTimer;
  }, [autoDim, scheduleDim]);

  const onPointerEnter = () => {
    hoverRef.current = true;
    wake();
  };
  const onPointerLeave = () => {
    hoverRef.current = false;
    if (!dragRef.current && !focusRef.current) scheduleDim(DIM_DELAY);
  };
  const onFocus = (e: React.FocusEvent) => {
    // Only focus that implies the user is working in the panel (keyboard,
    // or typing in an input) holds it open. A mouse click leaves the button
    // focused, which would otherwise block the fade until something else
    // takes focus.
    const el = e.target as HTMLElement;
    focusRef.current = !!el.matches?.(':focus-visible');
    if (focusRef.current) wake();
  };
  const onBlur = (e: React.FocusEvent) => {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    focusRef.current = false;
    if (!hoverRef.current) scheduleDim(DIM_DELAY);
  };

  const applyRect = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = rectRef.current;
    el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  }, []);

  const scheduleApply = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyRect();
    });
  }, [applyRect]);

  // Adopt external geometry changes (e.g. restored from storage) when idle.
  useEffect(() => {
    if (dragRef.current) return;
    rectRef.current = clampRect(rect, minWidth, minHeight);
    applyRect();
  }, [rect, minWidth, minHeight, applyRect]);

  // Pull the panel back on screen when the window shrinks.
  useEffect(() => {
    const onResize = () => {
      rectRef.current = clampRect(rectRef.current, minWidth, minHeight);
      scheduleApply();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [minWidth, minHeight, scheduleApply]);

  const setInteracting = (on: boolean) => {
    const s = surfaceRef.current;
    if (!s) return;
    // Opaque bg + no blur while moving. Restore the exact values from
    // SURFACE_STYLE: assigning '' would delete React's inline style, and React
    // never re-applies it because its props did not change.
    s.style.backdropFilter = on ? 'none' : SURFACE_STYLE.backdropFilter!;
    s.style.setProperty('-webkit-backdrop-filter', on ? 'none' : SURFACE_STYLE.backdropFilter!);
    s.style.backgroundColor = on ? 'rgb(var(--popover))' : SURFACE_STYLE.backgroundColor!;
  };

  const begin = (mode: Mode, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      start: { ...rectRef.current },
    };
    setInteracting(true);
  };

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [data-no-drag]')) return;
    begin('move', e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const s = d.start;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (d.mode === 'move') {
      rectRef.current = clampRect({ ...s, x: s.x + dx, y: s.y + dy }, minWidth, minHeight);
    } else {
      let { x, y, width, height } = s;
      if (d.mode.includes('e')) {
        width = Math.min(Math.max(minWidth, s.width + dx), vw - s.x);
      }
      if (d.mode.includes('w')) {
        width = Math.min(Math.max(minWidth, s.width - dx), s.x + s.width);
        x = s.x + s.width - width;
      }
      if (d.mode.includes('s')) {
        height = Math.min(Math.max(minHeight, s.height + dy), vh - s.y);
      }
      if (d.mode.includes('n')) {
        height = Math.min(Math.max(minHeight, s.height - dy), s.y + s.height);
        y = s.y + s.height - height;
      }
      rectRef.current = { x, y, width, height };
    }
    scheduleApply();
  };

  const end = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    applyRect();
    setInteracting(false);
    onRectCommit?.({ ...rectRef.current });
    // Released outside the panel: pointerleave may have fired mid-drag and
    // been ignored, so start the fade from here.
    if (!hoverRef.current && !focusRef.current) scheduleDim(DIM_DELAY);
  };

  if (!container) return null;

  const r = rectRef.current;

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label={ariaLabel}
      data-tooltip-boundary
      data-dimmed={dimmed || undefined}
      className={cn(
        'fixed left-0 top-0 z-[9000] text-foreground',
        // Collapsed mode is click-through; only the header keeps receiving
        // the pointer, so hovering it wakes the panel.
        dimmed && 'pointer-events-none',
        className,
      )}
      style={{
        transform: `translate3d(${r.x}px, ${r.y}px, 0)`,
        width: r.width,
        height: r.height,
        willChange: 'transform',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div
        ref={surfaceRef}
        className={cn(
          'absolute inset-0 flex flex-col rounded-lg overflow-hidden border',
          'transition-[background-color,box-shadow,border-color] ease-out motion-reduce:transition-none',
          dimmed ? 'border-transparent' : 'border-border/60',
        )}
        // Fade out slowly, come back fast so waking never feels sluggish.
        style={{ ...(dimmed ? DIMMED_SURFACE_STYLE : SURFACE_STYLE), transitionDuration: dimmed ? '300ms' : '120ms' }}
      >
        <div
          className={cn(
            'shrink-0 flex items-center h-8 pl-3 pr-1 gap-1 select-none cursor-grab active:cursor-grabbing',
            'transition-[opacity,border-color,background-color] ease-out motion-reduce:transition-none',
            // Collapsed to a standalone bar: own solid background and border
            // so the title never sits directly on page text.
            dimmed
              ? 'pointer-events-auto opacity-[0.85] rounded-lg border border-border/60 bg-popover'
              : 'border-b border-border/40',
          )}
          style={{ touchAction: 'none', transitionDuration: dimmed ? '300ms' : '120ms' }}
          onPointerDown={onHeaderPointerDown}
        >
          <div className="flex-1 min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          {actions && <div className="flex items-center shrink-0">{actions}</div>}
        </div>
        {/* Hidden, not unmounted: scroll position and expand state survive. */}
        <div
          className={cn(
            'flex-1 min-h-0 overflow-hidden transition-opacity ease-out motion-reduce:transition-none',
            dimmed && 'opacity-0',
          )}
          style={{ transitionDuration: dimmed ? '300ms' : '120ms' }}
        >
          {children}
        </div>
      </div>

      {HANDLES.map(({ dir, className: handleClass }) => (
        <div
          key={dir}
          className={cn('absolute z-10', handleClass)}
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => begin(dir, e)}
        />
      ))}
    </div>,
    container,
  );
};
