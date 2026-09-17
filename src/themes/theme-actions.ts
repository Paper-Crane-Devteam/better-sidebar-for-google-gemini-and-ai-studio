/**
 * Selecting a theme, without a click behind it.
 *
 * The theme picker in Settings used to own this whole decision: whether the theme is
 * premium, whether the licence covers it, whether this is therefore a preview, and the
 * timer that takes an unlicensed preview away again. All of it lived in module scope
 * inside `ThemeSettings.tsx`, which was fine while the picker was the only way to change
 * a theme.
 *
 * It is not any more — the agent's `apply_theme` tool changes themes too, and the same
 * rules have to hold there. A second copy would have drifted immediately: the obvious way
 * to write the tool is `setCustomTheme(id)`, which applies a premium theme permanently to
 * a free account and never starts the timer that reverts it.
 *
 * So the rules live here, and both callers ask the same question. What stays with the
 * caller is presentation: the picker wraps this in a view transition so the new theme
 * sweeps out from the cursor, and the agent reports the outcome in words.
 */

import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { themeRegistry, refreshThemeRegistry } from './index';

/** How long an unlicensed preview of a premium theme lasts. */
export const THEME_PREVIEW_DURATION_MS = 5 * 60 * 1000;

export type ThemeSelection =
  /** The theme is now in effect and stays that way. `themeId` null means the default. */
  | { status: 'applied'; themeId: string | null }
  /** Premium theme, no valid licence: in effect, but only for `durationMs`. */
  | { status: 'preview'; themeId: string; durationMs: number }
  /** No theme with that id, built-in or user-created. Nothing changed. */
  | { status: 'unknown'; themeId: string };

/**
 * The preview timer, at module scope on purpose.
 *
 * It has to outlive whatever started it: closing the settings panel unmounts the picker,
 * and a preview that stopped expiring when the panel closed is a premium theme kept for
 * free. Same reason it cannot live in the agent tool — that call returns immediately.
 */
let previewTimer: ReturnType<typeof setTimeout> | null = null;

export function clearThemePreviewTimer(): void {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
}

function startPreviewTimer(): void {
  clearThemePreviewTimer();
  previewTimer = setTimeout(() => {
    previewTimer = null;
    useLicenseStore.getState().endPreview();
    usePegasusStore.getState().setCustomTheme(null);
  }, THEME_PREVIEW_DURATION_MS);
}

/** End a preview that is running, so the next selection is not mistaken for one. */
function endActivePreview(): void {
  clearThemePreviewTimer();
  if (useLicenseStore.getState().isPreviewActive) {
    useLicenseStore.getState().endPreview();
  }
}

/**
 * Make a theme current, or revert to the platform's own look with `null`.
 *
 * Applying is a single store write — the platform adapters subscribe to `customTheme` and
 * do the actual injection (see `platforms/gemini.ts`), so nothing here touches the DOM.
 *
 * ⚠️ Call this inside the view-transition callback if you want the animation. The adapters
 * run synchronously off the store write, which is exactly what the View Transition API
 * needs, and doing it after the callback returns loses the reveal.
 */
export function selectTheme(themeId: string | null): ThemeSelection {
  const { setCustomTheme } = usePegasusStore.getState();

  if (themeId === null) {
    endActivePreview();
    setCustomTheme(null);
    return { status: 'applied', themeId: null };
  }

  /*
   * A theme created seconds ago is in the store but not yet in the registry — the merge
   * is explicit (`refreshThemeRegistry`), not reactive. Refreshing before giving up means
   * "create, then apply" works in one go instead of needing a reload.
   */
  if (!themeRegistry[themeId]) {
    refreshThemeRegistry();
    if (!themeRegistry[themeId]) return { status: 'unknown', themeId };
  }

  const preset = themeRegistry[themeId];

  if (preset.isPremium && !isLicenseValid(useLicenseStore.getState())) {
    setCustomTheme(themeId);
    useLicenseStore.getState().startPreview(themeId);
    startPreviewTimer();
    return { status: 'preview', themeId, durationMs: THEME_PREVIEW_DURATION_MS };
  }

  endActivePreview();
  setCustomTheme(themeId);
  return { status: 'applied', themeId };
}
