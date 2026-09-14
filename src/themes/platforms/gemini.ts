/**
 * Gemini platform theme adapter.
 *
 * Subscribes to the settings store and applies/removes custom themes
 * on the Gemini page by injecting CSS variables onto document.body.
 * Also syncs theme to the tooltip container.
 * Forces the page to the theme's preferred light/dark mode.
 *
 * Call `initGeminiThemeSync()` once from the content script.
 */

import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { themeRegistry, applyTheme, removeTheme, applySidebarTheme, refreshThemeRegistry, onUserThemeStoreHydrated, applyThemeFontCss } from '@/themes';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { syncGeminiTheme } from '@/shared/lib/utils/utils';
import { withGeminiDerivedTokens } from './gemini-derived';
import type { ThemePreset } from '../types';

/**
 * Apply a preset to the Gemini page: colours now, typography once the switch
 * animation is over and the webfonts have arrived.
 *
 * Tokens presets do not declare — the avatar orb, the wordmark gradient, the
 * skeleton shimmer, and ~70 interaction state layers — are derived from the
 * palette they do declare. See gemini-derived.ts.
 *
 * Exported because the theme-switch animation has to apply the theme
 * synchronously inside its own callback (see startViewTransition). That used to
 * be a second, hand-rolled copy of these four steps, which silently dropped the
 * derived tokens on every switch until the next page load. One entry point is
 * what keeps the two paths from drifting again.
 */
export function applyGeminiPreset(preset: ThemePreset): void {
  applyTheme(withGeminiDerivedTokens(preset));
  TooltipHelper.getInstance().setCustomThemeVariables(preset.sidebarVariables ?? null);
  syncGeminiTheme(preset.preferredMode);
  void applyThemeFontCss(preset);
}

/**
 * Initialize theme sync for Gemini.
 * Reads the current customTheme from store and subscribes to changes.
 * Returns an unsubscribe function.
 */
export function initGeminiThemeSync(): () => void {
  // Ensure user themes are loaded into registry
  refreshThemeRegistry();

  // On init: if a premium theme is persisted but user has no license, revert to default.
  // Preview only lives within a single session — refresh = reset.
  const initialThemeId = usePegasusStore.getState().customTheme;
  if (initialThemeId && themeRegistry[initialThemeId]?.isPremium) {
    const licenseState = useLicenseStore.getState();
    if (!isLicenseValid(licenseState)) {
      usePegasusStore.getState().setCustomTheme(null);
      useLicenseStore.getState().endPreview();
      // Don't apply the premium theme — fall through to no-theme state
    } else {
      applyGeminiPreset(themeRegistry[initialThemeId]);
    }
  } else if (initialThemeId && themeRegistry[initialThemeId]) {
    applyGeminiPreset(themeRegistry[initialThemeId]);
  } else if (initialThemeId && !themeRegistry[initialThemeId]) {
    // Theme ID set but not in registry — likely a user theme not yet hydrated
    onUserThemeStoreHydrated(() => {
      refreshThemeRegistry();
      const id = usePegasusStore.getState().customTheme;
      if (id && themeRegistry[id]) {
        applyGeminiPreset(themeRegistry[id]);
      }
    });
  }

  // Subscribe to changes
  const unsubscribe = usePegasusStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      if (state.customTheme && themeRegistry[state.customTheme]) {
        applyGeminiPreset(themeRegistry[state.customTheme]);
      } else {
        removeGeminiPreset(state.theme);
      }
    }
  });

  return unsubscribe;
}

/**
 * Drop the custom theme from the Gemini page and hand the page back to the
 * user's own light/dark choice. Counterpart to applyGeminiPreset(), and shared
 * with the switch animation for the same reason.
 */
export function removeGeminiPreset(
  fallbackTheme: 'light' | 'dark' | 'system',
): void {
  // keepFonts: typography is handed over to applyThemeFontCss(null) so it
  // reverts after the animation instead of mid-way through it.
  removeTheme({ keepFonts: true });
  TooltipHelper.getInstance().setCustomThemeVariables(null);
  void applyThemeFontCss(null);
  syncGeminiTheme(fallbackTheme);
}

/**
 * Bind a Shadow DOM root container to the custom theme system.
 * Applies the current theme immediately and subscribes to future changes.
 * Returns an unsubscribe function for cleanup.
 *
 * Use this for any Shadow DOM container that should reflect the custom theme
 * (sidebar, enhanced features, tooltips, etc.)
 */
export function bindShadowRootToTheme(container: HTMLElement): () => void {
  // Ensure user themes are in registry
  refreshThemeRegistry();

  // Apply current theme
  const currentThemeId = usePegasusStore.getState().customTheme;
  if (currentThemeId && themeRegistry[currentThemeId]) {
    applySidebarTheme(container, themeRegistry[currentThemeId]);
  } else if (currentThemeId && !themeRegistry[currentThemeId]) {
    // Theme ID is set but not in registry yet — wait for user theme store hydration
    onUserThemeStoreHydrated(() => {
      refreshThemeRegistry();
      const id = usePegasusStore.getState().customTheme;
      if (id && themeRegistry[id]) {
        applySidebarTheme(container, themeRegistry[id]);
      }
    });
  }

  // Subscribe to changes
  const unsubscribe = usePegasusStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      // Refresh registry in case a new user theme was just imported
      refreshThemeRegistry();
      const preset = state.customTheme ? themeRegistry[state.customTheme] : null;
      applySidebarTheme(container, preset);
    }
  });

  return unsubscribe;
}
