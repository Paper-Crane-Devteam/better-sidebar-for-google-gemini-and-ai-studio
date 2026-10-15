/**
 * Language helpers shared by `i18n.ts` (fetches locale bundles at runtime) and
 * `i18n-bundled.ts` (inlines every locale, for the main-world script).
 */
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import 'dayjs/locale/zh-cn';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/ja';
import 'dayjs/locale/pt';
import 'dayjs/locale/es';
import 'dayjs/locale/ru';
import 'dayjs/locale/ko';
import 'dayjs/locale/de';
import 'dayjs/locale/fr';
import 'dayjs/locale/it';
import 'dayjs/locale/pl';
import 'dayjs/locale/tr';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
// Kept from the original i18n.ts in case anything relies on its module side effects.
import '@/shared/lib/settings-store';

export const SUPPORTED_LANGUAGES = [
  'zh-CN',
  'zh-TW',
  'en',
  'ja',
  'pt',
  'es',
  'ru',
  'ko',
  'de',
  'fr',
  'it',
  'pl',
  'tr',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const isSupportedLanguage = (lng: unknown): lng is SupportedLanguage =>
  typeof lng === 'string' &&
  (SUPPORTED_LANGUAGES as readonly string[]).includes(lng);

/** Language from the settings store, falling back to the browser language. */
export const getInitialLanguage = (): SupportedLanguage => {
  try {
    const { language } = usePegasusStore.getState();
    if (isSupportedLanguage(language)) return language;
  } catch {
    // Store might not be initialized yet, ignore
  }

  const browserLang = navigator.language || navigator.languages?.[0] || 'en';
  if (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-Hant')) {
    return 'zh-TW';
  }
  if (browserLang.startsWith('zh')) return 'zh-CN';
  const prefixes = ['ja', 'ko', 'de', 'fr', 'it', 'pl', 'tr', 'pt', 'es', 'ru'] as const;
  return prefixes.find((p) => browserLang.startsWith(p)) ?? 'en';
};

/** Map i18next language codes to dayjs locale codes. */
const mapLanguageToDayjs = (lang: string): string => {
  if (lang === 'zh-CN') return 'zh-cn';
  if (lang === 'zh-TW') return 'zh-tw';
  return isSupportedLanguage(lang) ? lang : 'en';
};

let dayjsReady = false;
export const applyDayjsLocale = (lang: string) => {
  if (!dayjsReady) {
    dayjs.extend(localizedFormat);
    dayjsReady = true;
  }
  dayjs.locale(mapLanguageToDayjs(lang));
};

/**
 * Call `onChange` whenever the language in the settings store changes to a
 * supported one. Only in window contexts (not the background service worker),
 * matching the previous behavior.
 */
export const subscribeLanguageChanges = (
  onChange: (lng: SupportedLanguage) => void,
) => {
  if (globalThis.window === undefined) return;
  let previous = usePegasusStore.getState().language;
  usePegasusStore.subscribe((state) => {
    const current = state.language;
    if (current === previous || !isSupportedLanguage(current)) return;
    previous = current;
    onChange(current);
  });
};
