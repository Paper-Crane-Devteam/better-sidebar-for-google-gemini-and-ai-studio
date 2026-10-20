/**
 * Keep our floating layers above the host page's own overlays.
 *
 * Angular CDK (AI Studio) renders overlays — e.g. the System instructions
 * drawer — as `popover="manual"` elements, which puts them in the browser's
 * top layer. Nothing outside the top layer can paint above it, whatever its
 * z-index, so our popovers/modals/toasts/tooltips ended up hidden underneath.
 *
 * Fix: make our layer hosts manual popovers too, and whenever the page opens
 * a popover of its own, re-show ours so they're last (= topmost) again.
 * The hosts are 0×0, so being on top costs nothing while they're empty.
 */
import { applyShadowStyles } from '@/shared/lib/utils/utils';

/** Promoted hosts → priority (higher = raised later = painted on top) */
const promoted = new Map<HTMLElement, number>();
let listening = false;

function raiseAll() {
  [...promoted.entries()]
    .sort((a, b) => a[1] - b[1])
    .forEach(([el]) => el.isConnected && raise(el));
}

const supportsPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

function raise(el: HTMLElement) {
  try {
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  } catch {
    // Not connected yet, or the page tore it down — nothing to do
  }
}

function onToggle(e: Event) {
  const target = e.target;
  if (!(target instanceof HTMLElement) || promoted.has(target)) return;
  if ((e as Event & { newState?: string }).newState !== 'open') return;
  raiseAll();
}

/**
 * Promote a 0×0 layer host into the top layer and keep it above the page's popovers.
 * `priority` orders our own hosts among themselves (tooltips use a higher one).
 */
export function keepOnTopLayer(el: HTMLElement, priority = 0): void {
  if (!supportsPopover || promoted.has(el)) return;
  el.setAttribute('popover', 'manual');
  // Undo the UA popover styles (centered box, border, padding, background).
  // `display` stays block so a re-raise never un-renders (and blurs) our content.
  Object.assign(el.style, {
    display: 'block',
    position: 'fixed',
    inset: '0 auto auto 0',
    width: '0',
    height: '0',
    margin: '0',
    padding: '0',
    border: '0',
    overflow: 'visible',
    background: 'transparent',
    color: 'inherit',
  });
  promoted.set(el, priority);
  if (el.isConnected) raiseAll();
  if (!listening) {
    listening = true;
    // `toggle` doesn't bubble; capture sees every popover in the document
    document.addEventListener('toggle', onToggle, true);
  }
}

/**
 * Create a shadow root under `host` whose root element mirrors `source`'s
 * class + inline style (theme classes, dark mode, custom-theme CSS variables),
 * so content rendered there looks the same as in `source`'s tree.
 */
export function createMirroredShadowRoot(
  host: HTMLElement,
  source: HTMLElement | null,
  css: string,
): { root: HTMLElement; dispose: () => void } {
  const shadow = host.attachShadow({ mode: 'open' });
  applyShadowStyles(shadow, css);
  const root = document.createElement('div');
  const sync = () => {
    root.className = source?.className || 'shadow-body';
    root.style.cssText = source?.style.cssText || '';
    // Source roots are 0×0 boxes; ours should size to content
    root.style.width = 'auto';
    root.style.height = 'auto';
  };
  sync();
  let observer: MutationObserver | null = null;
  if (source) {
    observer = new MutationObserver(sync);
    observer.observe(source, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  shadow.appendChild(root);
  return { root, dispose: () => observer?.disconnect() };
}
