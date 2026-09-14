/**
 * Clicking native page controls that the enhanced sidebar has hidden.
 *
 * The sidebar replaces each platform's own navigation, and hides the original
 * either by parking it offscreen (`position: absolute; left: -9999px;
 * visibility: hidden`, Gemini desktop) or by dropping it out of the render tree
 * entirely (`display: none`, AI Studio's `ms-navbar` and Gemini mobile).
 *
 * `HTMLElement.click()` still reaches a handler on such an element — synthetic
 * dispatch skips hit testing — so re-triggering a native action generally just
 * works. What does not work is anything the handler *positions*: a menu is
 * anchored to its trigger's box, so a menu opened from an offscreen avatar opens
 * offscreen too, and one opened from a `display: none` avatar is anchored to
 * nothing at all.
 *
 * `clickHiddenNativeElement` closes that gap in three steps:
 *
 *  1. Hidden ancestors get a layout box again — invisible, out of flow — so the
 *     trigger has geometry at all.
 *  2. The trigger is pinned over `getAnchorRect()`, the rect of the sidebar
 *     button standing in for it, and *stays* pinned for as long as the popup is
 *     open. Holding it matters as much as setting it: Angular's CDK re-runs its
 *     positioning on scroll, on resize, and whenever a menu's contents finish
 *     loading, and if it finds the trigger back at -9999px by then it drags the
 *     menu up there with it.
 *  3. Whatever the page opened is nudged back inside the viewport if it hangs
 *     off an edge. A popup positioned relative to the *native* chip carries
 *     hard-coded offsets tuned to where that chip sits (AI Studio's account
 *     panel shifts itself 66px left of its trigger, for one), and those offsets
 *     do not survive being re-anchored to a 56px icon rail.
 */

import { queryFirst } from './dom-selectors';

/**
 * How long to wait for a popup to show up before assuming the click did not
 * open one — a plain toggle, or a link that simply navigates.
 */
const POPUP_GRACE_MS = 1500;

/** Backstop so a popup left open forever cannot leak a rAF loop. */
const MAX_SESSION_MS = 5 * 60 * 1000;

/** Gap kept between a nudged popup and the viewport edge. */
const VIEWPORT_MARGIN = 8;

/**
 * One in-flight delegated click: the styles owed back to the page, and whether
 * the loop watching over them is still the current one.
 */
interface ClickSession {
  cancelled: boolean;
  borrowed: { el: HTMLElement; cssText: string }[];
  /** Element carrying our corrective translate, if we applied one. */
  nudged: HTMLElement | null;
}

/**
 * The session in progress, if any. A second click ends the first one rather
 * than interleaving with it — two sessions borrowing the same element would
 * let the later one capture the earlier one's borrowed styles as originals and
 * leave the native chip permanently invisible.
 */
let activeSession: ClickSession | null = null;

export interface NativeClickOptions {
  /**
   * Live rect of the sidebar control standing in for the native one. Read every
   * frame rather than once, so the pinned trigger follows our button through
   * window resizes and sidebar collapse.
   *
   * Omit for controls that only toggle state and position nothing.
   */
  getAnchorRect?: () => DOMRect | null;
  /**
   * Selectors identifying the popup this click opens, most specific first.
   * While one of them matches, the borrowed geometry is held and the popup is
   * kept on screen.
   *
   * Omit when the click opens nothing, or when the popup's selector is unknown;
   * the geometry is then returned after POPUP_GRACE_MS.
   */
  popupSelectors?: readonly string[];
}

/** Write inline styles at `!important`, the only priority that can beat the
 * `!important` rules the sidebar uses to hide native chrome. */
function forceStyles(el: HTMLElement, styles: Record<string, string>): void {
  for (const [prop, value] of Object.entries(styles)) {
    el.style.setProperty(prop, value, 'important');
  }
}

/**
 * Give an ancestor that was removed from the render tree a layout box again,
 * without letting it be seen or take part in the page layout.
 */
function relayoutHiddenAncestor(el: HTMLElement): void {
  forceStyles(el, {
    display: 'block',
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    visibility: 'hidden',
    'pointer-events': 'none',
  });
}

/**
 * Park `el` exactly over `rect`, transparent and non-interactive: `click()` is
 * dispatched directly, so the element needs neither paint nor hit testing, and
 * `pointer-events: none` keeps it from swallowing the user's next real click.
 */
function pinOver(el: HTMLElement, rect: DOMRect): void {
  forceStyles(el, {
    display: 'block',
    position: 'fixed',
    margin: '0',
    left: '0',
    top: '0',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    visibility: 'visible',
    opacity: '0',
    'pointer-events': 'none',
  });

  // `position: fixed` resolves against the viewport only until some ancestor
  // carries a transform/filter/containment, at which point it resolves against
  // that ancestor instead. Rather than hunt for such an ancestor, measure where
  // the element landed at (0, 0) and correct by the delta — right either way.
  const placed = el.getBoundingClientRect();
  forceStyles(el, {
    left: `${rect.left - placed.left}px`,
    top: `${rect.top - placed.top}px`,
  });
}

/**
 * Translate `carrier` so that `popup` sits inside the viewport, and return the
 * total translation now applied.
 *
 * The translation goes on the CDK pane rather than on the popup itself for two
 * reasons: the page's own open/close animation owns the popup's `transform`,
 * and the pane is the element CDK writes `top`/`left` to, so a `transform`
 * there composes with CDK's positioning instead of fighting it. CDK does clear
 * the pane's transform when it re-applies a position, which is why the caller
 * re-runs this every frame.
 *
 * An axis is left alone when the popup is too large to fit it — correcting one
 * edge would only push the other one off, one frame at a time, forever.
 */
function nudgeIntoViewport(
  popup: HTMLElement,
  carrier: HTMLElement,
  applied: { x: number; y: number },
): { x: number; y: number } {
  const rect = popup.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  let dx = 0;
  if (rect.width + VIEWPORT_MARGIN * 2 <= vw) {
    if (rect.left < VIEWPORT_MARGIN) dx = VIEWPORT_MARGIN - rect.left;
    else if (rect.right > vw - VIEWPORT_MARGIN)
      dx = vw - VIEWPORT_MARGIN - rect.right;
  }

  let dy = 0;
  if (rect.height + VIEWPORT_MARGIN * 2 <= vh) {
    if (rect.top < VIEWPORT_MARGIN) dy = VIEWPORT_MARGIN - rect.top;
    else if (rect.bottom > vh - VIEWPORT_MARGIN)
      dy = vh - VIEWPORT_MARGIN - rect.bottom;
  }

  // Sub-pixel drift is not worth a style write, and writing every frame would
  // keep invalidating layout for nothing.
  const next =
    Math.abs(dx) < 1 && Math.abs(dy) < 1
      ? applied
      : { x: applied.x + dx, y: applied.y + dy };

  // Re-assert even when unchanged: CDK may have wiped it since the last frame.
  carrier.style.setProperty(
    'transform',
    `translate(${next.x}px, ${next.y}px)`,
    'important',
  );
  return next;
}

function endSession(session: ClickSession): void {
  for (const { el, cssText } of session.borrowed) el.style.cssText = cssText;
  session.borrowed.length = 0;
  // Only our own property comes off — the rest of the pane's inline style is
  // CDK's, and may have been rewritten since we first touched it.
  session.nudged?.style.removeProperty('transform');
  session.nudged = null;
  session.cancelled = true;
  if (activeSession === session) activeSession = null;
}

/**
 * Click a native control, lending it the geometry of the sidebar button that
 * stands in for it so any popup the page opens lands next to that button.
 */
export function clickHiddenNativeElement(
  target: HTMLElement,
  options: NativeClickOptions = {},
): void {
  const { getAnchorRect, popupSelectors } = options;

  if (activeSession) endSession(activeSession);

  const session: ClickSession = {
    cancelled: false,
    borrowed: [],
    nudged: null,
  };
  activeSession = session;

  const borrow = (el: HTMLElement) =>
    session.borrowed.push({ el, cssText: el.style.cssText });

  try {
    // Anything between the target and the body that was taken out of the render
    // tree has to be laid out again, or the target has no box to position by.
    for (
      let node = target.parentElement;
      node && node !== document.body && node !== document.documentElement;
      node = node.parentElement
    ) {
      if (getComputedStyle(node).display !== 'none') continue;
      borrow(node);
      relayoutHiddenAncestor(node);
    }

    borrow(target);
    const initialRect = getAnchorRect?.() ?? null;
    if (initialRect) pinOver(target, initialRect);

    target.click();
  } catch (e) {
    console.warn('Better Sidebar: native click failed', e);
    endSession(session);
    return;
  }

  // ── Hold the borrowed geometry for as long as the popup lives ──────────────

  const startedAt = performance.now();
  let anchorKey = '';
  let popupSize = '';
  let nudge = { x: 0, y: 0 };

  const frame = () => {
    if (session.cancelled) return;
    const elapsed = performance.now() - startedAt;

    const rect = getAnchorRect?.() ?? null;
    if (rect) {
      // Re-pinning costs a forced layout, so only do it when our button has
      // actually moved.
      const key = `${rect.left},${rect.top},${rect.width},${rect.height}`;
      if (key !== anchorKey) {
        anchorKey = key;
        pinOver(target, rect);
      }
    }

    const popup = popupSelectors ? queryFirst(popupSelectors) : null;
    if (popup) {
      // A `position: fixed` popup would be *re-anchored* by a transform on its
      // pane — a transformed ancestor becomes the containing block for fixed
      // descendants — so in that case the popup carries the translate itself.
      const carrier =
        getComputedStyle(popup).position === 'fixed'
          ? popup
          : ((popup.closest('.cdk-overlay-pane') as HTMLElement | null) ??
            popup);
      session.nudged = carrier;

      const box = popup.getBoundingClientRect();
      const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
      // Correcting a box that is still growing through its open animation makes
      // the popup visibly drift, so wait for two frames at the same size.
      if (size === popupSize) nudge = nudgeIntoViewport(popup, carrier, nudge);
      popupSize = size;
    }

    const noPopupComing = elapsed > POPUP_GRACE_MS && !popup;
    if (noPopupComing || elapsed > MAX_SESSION_MS) {
      endSession(session);
      return;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
