/**
 * Zero-flash theme boot for standalone extension pages (popup, permission
 * prompts, Browser Agent settings — anything served from `chrome-extension://`).
 *
 * The real theme lives in `storage.local`, which is async, and extension pages
 * cannot use inline scripts (CSP) — so by the time we know whether to render
 * dark, the browser has already painted a light page. Result: a visible flash,
 * plus a second one when a custom theme's variables land.
 *
 * Fix: mirror the resolved theme into `localStorage` (synchronous, same origin
 * as every extension page) and replay it at the top of the bundle, before the
 * first paint. The cache is refreshed on every open, so it only ever misses on
 * the very first launch or right after the theme was changed somewhere else.
 *
 * All extension pages share one origin, so they also share this cache — a page
 * opened for the first time still paints the theme the popup last resolved.
 */

import {
  hydratePegasusStoreFromCache,
  usePegasusStore,
  STORE_NAME,
} from '@/shared/lib/pegasus-store';
import type { ThemePresetId } from '@/themes/types';

/**
 * Kept at the historical popup name on purpose: the snapshot is global, and
 * renaming it would throw away every existing user's warm cache for one flash.
 */
const CACHE_KEY = 'bs:popup-theme-v1';

/** Storage key `@webext-pegasus/store` persists the global store under. */
const STORE_STORAGE_KEY = `pegasus-store/${STORE_NAME}`;

export interface ExtensionPageThemeSnapshot {
  /** Light/dark preference. `system` is resolved against the OS at boot. */
  mode: 'light' | 'dark' | 'system';
  /** CSS custom properties from the active custom theme, as [property, value] */
  vars: Array<[string, string]>;
}

const isDarkMode = (mode: ExtensionPageThemeSnapshot['mode']): boolean =>
  mode === 'dark' ||
  (mode === 'system' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches);

const paint = (snapshot: ExtensionPageThemeSnapshot) => {
  const root = document.documentElement;
  const dark = isDarkMode(snapshot.mode);
  root.classList.add('theme-gemini');
  root.classList.toggle('dark', dark);
  // Drop variables left over from a previously applied theme before reapplying.
  root.removeAttribute('style');
  for (const [property, value] of snapshot.vars ?? []) {
    root.style.setProperty(property, value);
  }
  // Native widgets (checkboxes, scrollbars, focus rings) follow `color-scheme`,
  // not our tokens. Pinning it to the resolved theme keeps them from rendering
  // light-on-light when a custom dark theme is active under a light OS.
  root.style.colorScheme = dark ? 'dark' : 'light';
  // Also switches off the prefers-color-scheme fallback in the page's <head>
  root.classList.add('theme-ready');
};

/**
 * Apply the last known theme synchronously, before the first paint.
 *
 * Call this at module top level, above any `await`, so it lands in the first
 * frame.
 *
 * @returns true when a cached snapshot was applied
 */
export const applyCachedExtensionPageTheme = (): boolean => {
  document.documentElement.classList.add('theme-gemini');
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    paint(JSON.parse(raw) as ExtensionPageThemeSnapshot);
    return true;
  } catch {
    return false;
  }
};

/** Apply a freshly resolved theme and remember it for the next open. */
export const applyExtensionPageTheme = (
  snapshot: ExtensionPageThemeSnapshot,
): void => {
  paint(snapshot);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage unavailable — worst case the page flashes once next time.
  }
};

/**
 * Turn the stored preferences into a paintable snapshot.
 *
 * A custom theme forces its own light/dark mode and contributes the same CSS
 * variables the overlay panel uses; without one we just pass the light/dark
 * preference through.
 */
export const resolveExtensionPageTheme = async (
  mode: ExtensionPageThemeSnapshot['mode'],
  customTheme: ThemePresetId | null,
): Promise<ExtensionPageThemeSnapshot> => {
  if (!customTheme) return { mode, vars: [] };

  try {
    // The theme registry pulls in every preset, so keep it off the critical
    // path and load it only when a custom theme is actually selected.
    const { themeRegistry, refreshThemeRegistry } = await import('@/themes');
    refreshThemeRegistry();
    const preset = themeRegistry[customTheme];
    if (!preset) return { mode, vars: [] };
    return {
      mode: preset.preferredMode === 'dark' ? 'dark' : 'light',
      vars: (preset.sidebarVariables ?? []).map(
        (v) => [v.property, v.value] as [string, string],
      ),
    };
  } catch (err) {
    console.warn('[ExtensionPageTheme] Failed to load theme registry:', err);
    return { mode, vars: [] };
  }
};

/**
 * Resolve and paint the real theme for a page that has no other reason to talk
 * to the global store.
 *
 * Reads `storage.local` directly rather than going through the background RPC
 * bridge — waking an idle MV3 service worker just to learn the theme would cost
 * more than the flash it prevents.
 */
export const syncExtensionPageTheme = async (): Promise<void> => {
  await hydratePegasusStoreFromCache();
  const { theme, customTheme } = usePegasusStore.getState();
  applyExtensionPageTheme(await resolveExtensionPageTheme(theme, customTheme));
};

/**
 * Keep a long-lived page (e.g. the Browser Agent settings window) in sync when
 * the theme is changed elsewhere.
 *
 * @returns an unsubscribe function
 */
export const watchExtensionPageTheme = (): (() => void) => {
  const listener = (
    changes: Record<string, { oldValue?: any; newValue?: any }>,
    areaName: string,
  ) => {
    if (areaName !== 'local' || !(STORE_STORAGE_KEY in changes)) return;
    void syncExtensionPageTheme();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
};
