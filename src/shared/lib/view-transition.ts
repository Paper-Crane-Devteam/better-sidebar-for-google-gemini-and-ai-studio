/**
 * Theme transition utility — circular clip-path expansion animation
 * from the click point, revealing the new theme inside the expanding circle
 * while the old theme remains visible outside.
 *
 * Uses the View Transition API when available. Falls back to instant switch.
 *
 * The key insight: we animate clip-path on ::view-transition-new(root)
 * which is the NEW theme layer. The OLD theme layer sits beneath at full size.
 * As the circle expands, more of the new theme is revealed.
 *
 * For this to work correctly, the theme DOM changes MUST happen synchronously
 * within the startViewTransition callback.
 *
 * One exception: typography. Font rules match most of the page and depend on a
 * webfont that may still be downloading, so they are held back until the reveal
 * is over (see setTypographyGate / applyThemeFontCss). Keeping them out of the
 * animation window is what stops the circle from stalling halfway.
 */

import { setTypographyGate } from '@/themes';
import { themeRegistry } from '@/themes';
import { applyGeminiPreset, removeGeminiPreset } from '@/themes/platforms/gemini';
import {
  applyAiStudioPreset,
  removeAiStudioPreset,
} from '@/themes/platforms/aistudio';
import { detectPlatform, Platform } from '@/shared/types/platform';

/** ID for the injected style element on the host page */
const VIEW_TRANSITION_STYLE_ID = 'better-sidebar-view-transition-css';

/** Marker class on <html>, present only while OUR theme transition is running */
const VT_ACTIVE_CLASS = 'bs-theme-transition';

/**
 * Ensure the view-transition CSS rules are present in the HOST document (not Shadow DOM).
 * This is required because ::view-transition-* pseudo-elements live on the document level.
 */
function ensureViewTransitionStyles(): void {
  if (document.getElementById(VIEW_TRANSITION_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = VIEW_TRANSITION_STYLE_ID;
  // Everything is scoped to the marker class so a view transition started by
  // the host page (Gemini/AI Studio use them for their own navigation) keeps
  // its default behaviour.
  style.textContent = `
:root.${VT_ACTIVE_CLASS}::view-transition-old(root),
:root.${VT_ACTIVE_CLASS}::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}
:root.${VT_ACTIVE_CLASS}::view-transition-old(root) {
  z-index: 1;
}
:root.${VT_ACTIVE_CLASS}::view-transition-new(root) {
  z-index: 9999;
  /* Start fully clipped. The WAAPI animation takes over from here; without
     this the new theme would show at full size on any frame that renders
     before the animation is attached. */
  clip-path: circle(0px at var(--bs-vt-x, 50%) var(--bs-vt-y, 50%));
}
`;
  document.head.appendChild(style);
}

/**
 * Immediately apply a custom theme (or revert to default) in a synchronous
 * manner, so the browser captures the correct "new" snapshot for the transition.
 *
 * This delegates to the platform adapters rather than driving the engine
 * directly. It used to do the latter, calling applyTheme() with the raw preset,
 * which had two consequences: on Gemini it dropped every derived token (the
 * avatar orb, the composer glow, the state layers) because those are filled in
 * by the adapter, and on AI Studio it injected Gemini's token namespace, which
 * that page does not read at all. Both were invisible until the next reload,
 * when the adapters ran on their own.
 */
function applyThemeSync(
  themeId: string | null,
  lightDarkTheme: 'light' | 'dark' | 'system',
): void {
  const platform = detectPlatform();
  const preset = themeId ? themeRegistry[themeId] : undefined;

  if (preset) {
    if (platform === Platform.GEMINI) applyGeminiPreset(preset);
    else if (platform === Platform.AI_STUDIO) applyAiStudioPreset(preset);
    return;
  }

  if (platform === Platform.GEMINI) removeGeminiPreset(lightDarkTheme);
  else if (platform === Platform.AI_STUDIO) removeAiStudioPreset(lightDarkTheme);
}

/**
 * Perform a theme change with circular clip-path expansion animation
 * originating from the mouse click position.
 *
 * @param event - The mouse event from clicking the theme button
 * @param updateCallback - The function that performs the store state update
 * @param themeId - The new theme preset ID (null = default/no custom theme)
 * @param lightDarkTheme - The light/dark/system setting for fallback
 * @param duration - Animation duration in ms (default 300)
 */
export function startViewTransition(
  event: React.MouseEvent | MouseEvent,
  updateCallback: () => void,
  themeId?: string | null,
  lightDarkTheme?: 'light' | 'dark' | 'system',
  duration = 300,
): void {
  // Fallback: just apply the change immediately
  if (!document.startViewTransition) {
    updateCallback();
    return;
  }

  const x = event.clientX;
  const y = event.clientY;

  // Inject CSS rules into host document (not Shadow DOM)
  ensureViewTransitionStyles();

  // Compute the radius needed to cover the entire viewport
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  // Feed the click point to the CSS fallback clip (see ensureViewTransitionStyles)
  const root = document.documentElement;
  root.style.setProperty('--bs-vt-x', `${x}px`);
  root.style.setProperty('--bs-vt-y', `${y}px`);
  root.classList.add(VT_ACTIVE_CLASS);

  // Hold typography (webfonts + the font rules that match most of the page)
  // until the reveal is over, so nothing heavy lands mid-animation. The gate
  // must be armed before the update callback runs, because the store
  // subscribers that request typography fire inside it.
  let openGate = () => {};
  setTypographyGate(
    new Promise<void>((resolve) => {
      openGate = resolve;
    }),
  );
  // Safety net: never leave typography waiting if the transition never settles.
  const gateTimer = setTimeout(() => openGate(), duration + 2000);
  const releaseGate = () => {
    clearTimeout(gateTimer);
    openGate();
  };

  const transition = document.startViewTransition(() => {
    // 1. Update store state (this triggers subscriber which also calls applyTheme,
    //    but since applyTheme is idempotent with removeTheme() first, it's fine)
    updateCallback();

    // 2. Force synchronous DOM changes so the browser captures the new state
    if (themeId !== undefined) {
      applyThemeSync(themeId ?? null, lightDarkTheme ?? 'system');
    }
  });

  let reveal: Animation | undefined;

  transition.ready
    .then(() => {
      // Must stay synchronous inside this callback: the browser ends the
      // transition once no animations are attached to the pseudo-elements,
      // so deferring this (rAF/timeout) can drop the animation entirely.
      reveal = document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          // Hold the end state so the CSS fallback clip (circle(0)) doesn't
          // snap back before the transition tears down.
          fill: 'both',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {
      // Transition was skipped (e.g. another one started) — nothing to animate.
    });

  // Once the transition is over (or was skipped): drop the marker class so
  // host-page view transitions are never affected, and let typography land.
  transition.finished.finally(() => {
    root.classList.remove(VT_ACTIVE_CLASS);
    releaseGate();
    // The pseudo-element is gone by now; cancelling detaches the filling
    // animation from the timeline instead of leaving one behind per switch.
    reveal?.cancel();
    reveal = undefined;
  });
}
