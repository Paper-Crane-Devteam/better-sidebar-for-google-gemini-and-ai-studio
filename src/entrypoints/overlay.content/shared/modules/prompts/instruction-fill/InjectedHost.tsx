import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mainStyles from '@/index.scss?inline';
import { applyShadowStyles } from '@/shared/lib/utils';
import { ShadowRootProvider, useShadowRoot } from '@/shared/components/ShadowRootContext';

interface InjectedHostProps {
  /** Find the native element to attach to; null = not on screen */
  find: () => Element | null;
  /** Insert the host element relative to the anchor (append, prepend, before…) */
  place: (anchor: Element, host: HTMLElement) => void;
  /** Inline style for the host element in the native DOM */
  hostStyle?: string;
  /** Extra cleanup when the host is torn down (e.g. undo style tweaks on the anchor) */
  onDetach?: (anchor: Element) => void;
  children: React.ReactNode;
}

/**
 * Renders `children` inside a shadow-DOM host that lives in the *native* page
 * DOM next to `find()`'s element, re-attaching whenever the page re-renders it
 * (Angular routinely destroys and recreates dialogs / panels).
 *
 * Rendering goes through a portal from the enhanced-features tree, so stores
 * and context work as usual. The host root mirrors the enhanced-features root's
 * class/style so platform theme + dark mode carry over without extra wiring.
 */
export const InjectedHost: React.FC<InjectedHostProps> = ({ find, place, hostStyle, onDetach, children }) => {
  const mainRoot = useShadowRoot();
  const [container, setContainer] = useState<HTMLElement | null>(null);

  const findRef = useRef(find);
  findRef.current = find;
  const placeRef = useRef(place);
  placeRef.current = place;
  const onDetachRef = useRef(onDetach);
  onDetachRef.current = onDetach;

  useEffect(() => {
    let anchor: Element | null = null;
    let host: HTMLElement | null = null;
    let themeObserver: MutationObserver | null = null;
    let disposed = false;

    const teardown = () => {
      themeObserver?.disconnect();
      themeObserver = null;
      host?.remove();
      if (anchor) onDetachRef.current?.(anchor);
      host = null;
      anchor = null;
      if (!disposed) setContainer(null);
    };

    const check = () => {
      const next = findRef.current();
      if (next && next === anchor && host?.isConnected) return;
      if (host || anchor) teardown();
      if (!next) return;

      anchor = next;
      host = document.createElement('div');
      host.setAttribute('data-bs-injected-host', '');
      if (hostStyle) host.style.cssText = hostStyle;

      const shadow = host.attachShadow({ mode: 'open' });
      applyShadowStyles(shadow, mainStyles);
      const root = document.createElement('div');
      const syncTheme = () => {
        root.className = mainRoot?.className || 'shadow-body';
        root.style.cssText = mainRoot?.style.cssText || '';
        // The enhanced root is a 0×0 box; ours should size to its content
        root.style.width = 'auto';
        root.style.height = 'auto';
      };
      syncTheme();
      if (mainRoot) {
        themeObserver = new MutationObserver(syncTheme);
        themeObserver.observe(mainRoot, { attributes: true, attributeFilter: ['class', 'style'] });
      }
      shadow.appendChild(root);

      placeRef.current(next, host);
      setContainer(root);
    };

    let scheduled = false;
    const bodyObserver = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        check();
      });
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
    check();

    return () => {
      disposed = true;
      bodyObserver.disconnect();
      teardown();
    };
    // hostStyle is applied once per mount; callers pass a constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainRoot]);

  if (!container) return null;
  return createPortal(
    <ShadowRootProvider container={container}>{children}</ShadowRootProvider>,
    container,
  );
};
