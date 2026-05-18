/**
 * Gemini platform theme adapter.
 *
 * Subscribes to the settings store and applies/removes custom themes
 * on the Gemini page by injecting CSS variables onto document.body.
 *
 * Call `initGeminiThemeSync()` once from the content script.
 */

import { useSettingsStore } from '@/shared/lib/settings-store';
import { themeRegistry, applyTheme, removeTheme } from '@/themes';

/**
 * Initialize theme sync for Gemini.
 * Reads the current customTheme from store and subscribes to changes.
 * Returns an unsubscribe function.
 */
export function initGeminiThemeSync(): () => void {
  // Apply initial theme if set
  const initialThemeId = useSettingsStore.getState().customTheme;
  if (initialThemeId && themeRegistry[initialThemeId]) {
    applyTheme(themeRegistry[initialThemeId]);
  }

  // Subscribe to changes
  const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      if (state.customTheme && themeRegistry[state.customTheme]) {
        applyTheme(themeRegistry[state.customTheme]);
      } else {
        removeTheme();
      }
    }
  });

  return unsubscribe;
}
