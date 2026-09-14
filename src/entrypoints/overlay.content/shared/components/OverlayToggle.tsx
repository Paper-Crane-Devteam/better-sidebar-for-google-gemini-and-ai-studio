/**
 * Floating dock button shown when the enhanced sidebar is hidden.
 *
 * Lives in `document.body` via a portal, deliberately outside the sidebar's
 * Shadow DOM: the sidebar wrapper is `display: none` while hidden, so anything
 * rendered inside it would disappear along with it. That also puts the button
 * out of reach of the sidebar stylesheet, which is why every rule here is an
 * inline style — inline styles are also what keeps the host page's own `button`
 * rules from bleeding in.
 *
 * Colours are not hard-coded per light/dark: they are read off the themed
 * shadow container (`--background`, `--foreground`, `--border`, …) so the button
 * follows both the native light/dark switch and any custom theme preset. See
 * `readThemeTokens()`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useShadowRoot } from '@/shared/components/ShadowRootContext';
import { useI18n } from '@/shared/hooks/useI18n';

interface OverlayToggleProps {
  onToggle: () => void;
}

const BUTTON_SIZE = 44;
const ICON_SIZE = 24;

/** Extension logo. Served from `public/images`, which is web-accessible. */
const ICON_URL = browser.runtime.getURL('/images/icon.png');

/**
 * Sidebar tokens the button borrows. All of them are RGB channel triples
 * ("25 25 25"), the form Tailwind consumes as `rgb(var(--token) / <alpha>)`.
 */
const THEME_TOKENS = [
  '--background',
  '--card',
  '--foreground',
  '--border',
  '--primary',
  '--muted-foreground',
] as const;

type ThemeTokens = Record<(typeof THEME_TOKENS)[number], string>;

/** Used until the shadow container is available, and if a token is missing. */
const FALLBACK_TOKENS: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    '--background': '255 255 255',
    '--card': '255 255 255',
    '--foreground': '24 24 27',
    '--border': '228 228 231',
    '--primary': '24 24 27',
    '--muted-foreground': '113 113 122',
  },
  dark: {
    '--background': '25 25 25',
    '--card': '39 39 42',
    '--foreground': '244 244 245',
    '--border': '63 63 70',
    '--primary': '244 244 245',
    '--muted-foreground': '140 140 140',
  },
};

/** Relative luminance of a channel triple, 0 (black) to 1 (white). */
function luminanceOf(rgb: string): number {
  const [r = 255, g = 255, b = 255] = rgb
    .split(/[\s,]+/)
    .map((n) => Number.parseFloat(n));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Read the live sidebar theme off the shadow container.
 *
 * `getComputedStyle` resolves custom properties even though the container's
 * wrapper is `display: none` while the sidebar is hidden, so this keeps working
 * in exactly the state the button is shown in.
 */
function readThemeTokens(container: HTMLElement | null): ThemeTokens {
  const prefersDark =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  const fallback = FALLBACK_TOKENS[prefersDark ? 'dark' : 'light'];
  if (!container) return fallback;

  const computed = getComputedStyle(container);
  const tokens = { ...fallback };
  for (const token of THEME_TOKENS) {
    const value = computed.getPropertyValue(token).trim();
    if (value) tokens[token] = value;
  }
  return tokens;
}

export const OverlayToggle = ({ onToggle }: OverlayToggleProps) => {
  const { t } = useI18n();
  const { overlayPosition, setOverlayPosition } = useSettingsStore();
  const container = useShadowRoot();

  const [tokens, setTokens] = useState<ThemeTokens>(() =>
    readThemeTokens(container),
  );
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Follow the theme. Three signals cover every way the palette can change:
  // the container's inline vars (custom theme presets, written by
  // applySidebarTheme), its `dark` class (native mode switch, mirrored from
  // body by the platform Layout), and body's class (the source of that mirror,
  // observed too so the button is not one frame behind).
  useEffect(() => {
    const update = () => setTokens(readThemeTokens(container));
    update();

    const observers: MutationObserver[] = [];
    if (container) {
      const own = new MutationObserver(update);
      own.observe(container, {
        attributes: true,
        attributeFilter: ['style', 'class', 'data-custom-theme'],
      });
      observers.push(own);
    }
    if (document.body) {
      const body = new MutationObserver(update);
      body.observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
      });
      observers.push(body);
    }

    // Only relevant for the no-container fallback, but harmless otherwise.
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', update);

    return () => {
      for (const observer of observers) observer.disconnect();
      media?.removeEventListener('change', update);
    };
  }, [container]);

  // The stored position is clamped against the viewport at render time, so a
  // resize has to trigger one.
  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clamp = useCallback(
    (pos: { x: number; y: number }) => {
      const maxX = viewport.w - BUTTON_SIZE;
      const maxY = viewport.h - BUTTON_SIZE;
      return {
        x: Math.max(0, Math.min(pos.x, maxX)),
        y: Math.max(0, Math.min(pos.y, maxY)),
      };
    },
    [viewport],
  );

  // overlayPosition stores {x, y} as an offset from the left/bottom edges.
  const pos = clamp(overlayPosition);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
        moved: false,
      };
      setIsPressed(true);
    },
    [pos],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.moved = true;
        setIsDragging(true);
      }
      if (dragRef.current.moved) {
        setOverlayPosition(
          clamp({
            x: dragRef.current.origX + dx,
            y: dragRef.current.origY - dy, // y is measured from the bottom
          }),
        );
      }
    },
    [clamp, setOverlayPosition],
  );

  const onPointerUp = useCallback(() => {
    const wasDrag = dragRef.current?.moved ?? false;
    dragRef.current = null;
    setIsPressed(false);
    setIsDragging(false);
    if (!wasDrag) onToggle();
  }, [onToggle]);

  const styles = useMemo(() => {
    const isDark = luminanceOf(tokens['--foreground']) > 0.5;
    const surface = tokens['--card'];
    const border = tokens['--border'];
    const accent = tokens['--primary'];

    // `--border` is authored for lines drawn *inside* the sidebar, against a
    // known surface. In dark themes it is barely lighter than the surface
    // itself (42 42 42 on 25 25 25 for AI Studio), which vanishes once the
    // button floats over arbitrary page content. A translucent foreground rim
    // is the usual glass treatment and stays visible on any backdrop.
    const rim = isDark
      ? `rgb(${tokens['--foreground']} / 0.16)`
      : `rgb(${border})`;

    const ambient = isDark
      ? '0 1px 2px rgb(0 0 0 / 0.5), 0 10px 26px -8px rgb(0 0 0 / 0.7)'
      : '0 1px 2px rgb(0 0 0 / 0.07), 0 10px 24px -8px rgb(0 0 0 / 0.22)';
    const lifted = isDark
      ? '0 2px 4px rgb(0 0 0 / 0.55), 0 16px 34px -10px rgb(0 0 0 / 0.8)'
      : '0 2px 6px rgb(0 0 0 / 0.1), 0 16px 32px -10px rgb(0 0 0 / 0.28)';

    const active = isHovered || isDragging;
    const ring = active ? `, 0 0 0 4px rgb(${accent} / 0.14)` : '';

    const scale = isDragging ? 1.12 : isPressed ? 0.94 : isHovered ? 1.08 : 1;

    const button: React.CSSProperties = {
      position: 'relative',
      boxSizing: 'border-box',
      width: `${BUTTON_SIZE}px`,
      height: `${BUTTON_SIZE}px`,
      margin: 0,
      padding: 0,
      borderRadius: '50%',
      // Translucent + blurred so the button reads as glass sitting on the page
      // rather than an opaque dot; the tint still comes from the theme.
      backgroundColor: `rgb(${surface} / 0.82)`,
      // A top-down highlight only, kept faint on purpose: anything stronger
      // washes the theme's own tint out of the surface.
      backgroundImage: isDark
        ? 'linear-gradient(180deg, rgb(255 255 255 / 0.09), rgb(255 255 255 / 0))'
        : 'linear-gradient(180deg, rgb(255 255 255 / 0.4), rgb(255 255 255 / 0))',
      backdropFilter: 'blur(12px) saturate(160%)',
      WebkitBackdropFilter: 'blur(12px) saturate(160%)',
      border: `1px solid ${rim}`,
      color: `rgb(${tokens['--foreground']})`,
      boxShadow: `${active ? lifted : ambient}${ring}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: isDragging ? 'grabbing' : 'pointer',
      transition: isDragging
        ? 'box-shadow 0.15s ease'
        : 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease',
      transform: `scale(${scale})`,
      outline: 'none',
      touchAction: 'none',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      appearance: 'none',
      overflow: 'visible',
    };

    const icon: React.CSSProperties = {
      width: `${ICON_SIZE}px`,
      height: `${ICON_SIZE}px`,
      display: 'block',
      pointerEvents: 'none',
      // The logo's right-hand bars are mid-grey; a touch of contrast keeps them
      // from muddying into a light surface, and the shadow lifts them off a
      // dark one.
      filter: isDark
        ? 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.45))'
        : 'saturate(1.05) drop-shadow(0 1px 1px rgb(0 0 0 / 0.12))',
      transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      transform: active ? 'rotate(-6deg)' : 'rotate(0deg)',
    };

    // Brand halo, painted as a sibling *behind* the button rather than as a
    // child: the button's backdrop-filter makes it a stacking context, so a
    // negatively stacked child would land on top of its own background instead
    // of underneath it. As a sibling it also feeds into that backdrop-filter,
    // which is what tints the glass on hover.
    const halo: React.CSSProperties = {
      position: 'absolute',
      inset: '-9px',
      borderRadius: '50%',
      background:
        'radial-gradient(circle at 50% 45%, rgb(99 102 241 / 0.5), rgb(168 85 247 / 0.22) 55%, transparent 72%)',
      opacity: active ? 1 : 0,
      transform: `scale(${active ? 1 : 0.8})`,
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      pointerEvents: 'none',
    };

    return { button, icon, halo };
  }, [tokens, isHovered, isPressed, isDragging]);

  const tooltipSide = pos.x > viewport.w / 2 ? 'left' : 'right';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        zIndex: 10000,
        left: `${pos.x}px`,
        bottom: `${pos.y}px`,
        width: `${BUTTON_SIZE}px`,
        height: `${BUTTON_SIZE}px`,
        lineHeight: 0,
      }}
    >
      <span style={styles.halo} aria-hidden="true" />
      <SimpleTooltip
        content={t('overlay.showSidepanel')}
        side={tooltipSide as any}
      >
        <button
          type="button"
          style={styles.button}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
            setIsPressed(false);
            setIsDragging(false);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label={t('overlay.showSidepanel')}
        >
          <img src={ICON_URL} alt="" style={styles.icon} draggable={false} />
        </button>
      </SimpleTooltip>
    </div>,
    document.body,
  );
};
