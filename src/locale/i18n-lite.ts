/**
 * Lightweight i18n init for extension pages (popup / onboarding).
 *
 * `@/locale/i18n` eagerly imports all 7 locale files (~450KB of raw JSON) plus
 * every dayjs locale. That is fine for the content script, which is long-lived,
 * but for the popup it means parsing ~700KB of JS before the first paint — the
 * main reason the popup felt dead on the first click.
 *
 * Here each locale is a separate lazily-fetched chunk, so a page only pays for
 * the language it actually renders (plus `en` as the fallback bundle).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { usePegasusStore } from '@/shared/lib/pegasus-store';

export type SupportedLanguage =
  | 'zh-CN'
  | 'zh-TW'
  | 'en'
  | 'ja'
  | 'pt'
  | 'es'
  | 'ru'
  | 'ko'
  | 'de'
  | 'fr'
  | 'it'
  | 'pl'
  | 'tr';

const LOCALE_LOADERS: Record<
  SupportedLanguage,
  () => Promise<{ default: Record<string, unknown> }>
> = {
  'zh-CN': () => import('./zh-CN.json'),
  'zh-TW': () => import('./zh-TW.json'),
  en: () => import('./en.json'),
  ja: () => import('./ja.json'),
  pt: () => import('./pt.json'),
  es: () => import('./es.json'),
  ru: () => import('./ru.json'),
  ko: () => import('./ko.json'),
  de: () => import('./de.json'),
  fr: () => import('./fr.json'),
  it: () => import('./it.json'),
  pl: () => import('./pl.json'),
  tr: () => import('./tr.json'),
};

const isSupported = (lng: string): lng is SupportedLanguage =>
  lng in LOCALE_LOADERS;

const loaded = new Set<string>();

/** Load a locale bundle into i18next once. */
const loadBundle = async (lng: SupportedLanguage) => {
  if (loaded.has(lng)) return;
  const { default: translation } = await LOCALE_LOADERS[lng]();
  i18n.addResourceBundle(lng, 'translation', translation, true, true);
  loaded.add(lng);
};

/**
 * Initialize i18next with a single language (plus `en` as fallback).
 * Safe to call once per page, before rendering.
 */
export const initI18nLite = async (language?: string) => {
  const lng = language && isSupported(language) ? language : 'en';

  const [primary, fallback] = await Promise.all([
    LOCALE_LOADERS[lng](),
    lng === 'en' ? null : LOCALE_LOADERS.en(),
  ]);

  const resources: Record<string, { translation: Record<string, unknown> }> = {
    [lng]: { translation: primary.default },
  };
  if (fallback) {
    resources.en = { translation: fallback.default };
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    interpolation: {
      // React already escapes values
      escapeValue: false,
    },
  });
  loaded.add(lng);
  loaded.add('en');

  // Follow language changes coming from the shared store (e.g. changed in the
  // sidebar while the popup is open).
  let previous = usePegasusStore.getState().language;
  usePegasusStore.subscribe((state) => {
    const next = state.language;
    if (next === previous || !isSupported(next)) return;
    previous = next;
    loadBundle(next)
      .then(() => i18n.changeLanguage(next))
      .catch((err) => console.warn('[i18n] locale switch failed:', err));
  });
};

export default i18n;
