/**
 * i18n for extension contexts (overlay / content scripts / background).
 *
 * Only `en` (the fallback) is bundled. Every other locale is fetched at runtime
 * from `/locales/<lng>.json`, copied there by viteStaticCopy (see
 * wxt.config.ts). Inlining all 13 locales pushed content-scripts/overlay.js
 * past the 5 MB per-file limit that addons-linter enforces on AMO uploads.
 *
 * Until the active locale arrives, `t()` falls back to English. Entry points
 * that render UI should `await i18nReady()` before mounting.
 *
 * The main-world script cannot fetch extension URLs; it uses
 * `@/locale/i18n-bundled` instead.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import {
  applyDayjsLocale,
  getInitialLanguage,
  subscribeLanguageChanges,
  type SupportedLanguage,
} from './language';

const loaded = new Set<string>(['en']);
const inflight = new Map<string, Promise<void>>();

/** Fetch a locale bundle into i18next once. Failures leave English in place. */
const loadBundle = (lng: SupportedLanguage): Promise<void> => {
  if (loaded.has(lng)) return Promise.resolve();
  const existing = inflight.get(lng);
  if (existing) return existing;

  const task = (async () => {
    try {
      const res = await fetch(browser.runtime.getURL(`/locales/${lng}.json`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const translation = (await res.json()) as Record<string, unknown>;
      i18n.addResourceBundle(lng, 'translation', translation, true, true);
      loaded.add(lng);
    } catch (err) {
      console.warn(`[i18n] failed to load locale "${lng}":`, err);
    } finally {
      inflight.delete(lng);
    }
  })();
  inflight.set(lng, task);
  return task;
};

let pending: Promise<void> = Promise.resolve();

/** Switch to `lng`, loading its bundle first. Last call wins. */
const switchLanguage = (lng: SupportedLanguage) => {
  const task = loadBundle(lng).then(async () => {
    if (pending !== task) return; // superseded by a newer switch
    applyDayjsLocale(lng);
    await i18n.changeLanguage(lng);
  });
  pending = task;
  return task;
};

/** Resolves once the most recently requested language is loaded and active. */
export const i18nReady = (): Promise<void> => pending;

const lng = getInitialLanguage();

// `lng` is set right away so `i18n.language` is correct from the start; until
// its bundle lands, lookups fall through to `en`.
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    // Re-render translated components when a fetched bundle is added.
    bindI18nStore: 'added',
  },
});
applyDayjsLocale(lng); // dayjs locales are bundled, no need to wait
if (lng !== 'en') switchLanguage(lng);

subscribeLanguageChanges((next) => {
  switchLanguage(next);
});

export default i18n;
