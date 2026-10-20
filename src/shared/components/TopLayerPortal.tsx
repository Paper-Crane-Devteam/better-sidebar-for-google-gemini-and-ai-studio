import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import mainStyles from '@/index.scss?inline';
import { ShadowRootProvider, useShadowRoot } from './ShadowRootContext';
import { createMirroredShadowRoot, keepOnTopLayer } from '@/shared/lib/top-layer';

const roots = new WeakMap<HTMLElement, HTMLElement>();
const topLayerRoots = new WeakSet<HTMLElement>();

function getTopLayerRoot(mainRoot: HTMLElement): HTMLElement {
  // Already rendering inside a top-layer root (nested portal) — reuse it
  if (topLayerRoots.has(mainRoot)) return mainRoot;
  let root = roots.get(mainRoot);
  if (root?.isConnected) return root;
  const host = document.createElement('div');
  host.setAttribute('data-bs-top-layer', '');
  document.body.appendChild(host);
  root = createMirroredShadowRoot(host, mainRoot, mainStyles).root;
  keepOnTopLayer(host);
  roots.set(mainRoot, root);
  topLayerRoots.add(root);
  return root;
}

/**
 * Render floating UI (modals, toasts, popovers) in a host that stays in the
 * browser's top layer, above page overlays such as AI Studio's drawers.
 * See `shared/lib/top-layer`. Outside a shadow-root context it's a no-op.
 */
export const TopLayerPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mainRoot = useShadowRoot();
  const root = useMemo(() => (mainRoot ? getTopLayerRoot(mainRoot) : null), [mainRoot]);
  if (!root) return <>{children}</>;
  if (root === mainRoot) return <>{children}</>;
  return createPortal(<ShadowRootProvider container={root}>{children}</ShadowRootProvider>, root);
};
