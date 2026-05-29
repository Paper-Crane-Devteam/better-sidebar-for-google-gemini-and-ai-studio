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

import { useSettingsStore } from '@/shared/lib/settings-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { themeRegistry, applyTheme, removeTheme, applySidebarTheme } from '@/themes';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { syncGeminiTheme } from '@/shared/lib/utils/utils';

/**
 * Initialize theme sync for Gemini.
 * Reads the current customTheme from store and subscribes to changes.
 * Returns an unsubscribe function.
 */
export function initGeminiThemeSync(): () => void {
  // On init: if a premium theme is persisted but user has no license, revert to default.
  // Preview only lives within a single session — refresh = reset.
  const initialThemeId = useSettingsStore.getState().customTheme;
  if (initialThemeId && themeRegistry[initialThemeId]?.isPremium) {
    const licenseState = useLicenseStore.getState();
    if (!isLicenseValid(licenseState)) {
      useSettingsStore.getState().setCustomTheme(null);
      useLicenseStore.getState().endPreview();
      // Don't apply the premium theme — fall through to no-theme state
    } else {
      applyTheme(themeRegistry[initialThemeId]);
      const preset = themeRegistry[initialThemeId];
      TooltipHelper.getInstance().setCustomThemeVariables(preset.sidebarVariables ?? null);
      syncGeminiTheme(preset.preferredMode);
    }
  } else if (initialThemeId && themeRegistry[initialThemeId]) {
    applyTheme(themeRegistry[initialThemeId]);
    const preset = themeRegistry[initialThemeId];
    TooltipHelper.getInstance().setCustomThemeVariables(preset.sidebarVariables ?? null);
    syncGeminiTheme(preset.preferredMode);
  }

  // Subscribe to changes
  const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      if (state.customTheme && themeRegistry[state.customTheme]) {
        applyTheme(themeRegistry[state.customTheme]);
        const preset = themeRegistry[state.customTheme];
        TooltipHelper.getInstance().setCustomThemeVariables(preset.sidebarVariables ?? null);
        // Force page to the theme's preferred mode
        syncGeminiTheme(preset.preferredMode);
      } else {
        removeTheme();
        TooltipHelper.getInstance().setCustomThemeVariables(null);
        // Restore user's chosen theme setting
        syncGeminiTheme(state.theme);
      }
    }
  });

  return unsubscribe;
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
  // Apply current theme
  const currentThemeId = useSettingsStore.getState().customTheme;
  if (currentThemeId && themeRegistry[currentThemeId]) {
    applySidebarTheme(container, themeRegistry[currentThemeId]);
  }

  // Subscribe to changes
  const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      const preset = state.customTheme ? themeRegistry[state.customTheme] : null;
      applySidebarTheme(container, preset);
    }
  });

  return unsubscribe;
}
