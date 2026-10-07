import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
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
import zhCN from './zh-CN.json';
import zhTW from './zh-TW.json';
import en from './en.json';
import ja from './ja.json';
import pt from './pt.json';
import es from './es.json';
import ru from './ru.json';
import ko from './ko.json';
import de from './de.json';
import fr from './fr.json';
import it from './it.json';
import pl from './pl.json';
import tr from './tr.json';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';

// Get language from settings store or browser language
const getInitialLanguage = (): string => {
  // Try to get from settings store synchronously
  try {
    const state = usePegasusStore.getState();
    if (state.language) {
      return state.language;
    }
  } catch {
    // Settings store might not be initialized yet, ignore
  }

  // Fallback to browser language
  const browserLang = navigator.language || navigator.languages?.[0] || 'en';
  if (browserLang.startsWith('zh-TW') || browserLang.startsWith('zh-Hant')) {
    return 'zh-TW';
  }
  if (browserLang.startsWith('zh')) {
    return 'zh-CN';
  }
  if (browserLang.startsWith('ja')) {
    return 'ja';
  }
  if (browserLang.startsWith('ko')) {
    return 'ko';
  }
  if (browserLang.startsWith('de')) {
    return 'de';
  }
  if (browserLang.startsWith('fr')) {
    return 'fr';
  }
  if (browserLang.startsWith('it')) {
    return 'it';
  }
  if (browserLang.startsWith('pl')) {
    return 'pl';
  }
  if (browserLang.startsWith('tr')) {
    return 'tr';
  }
  if (browserLang.startsWith('pt')) {
    return 'pt';
  }
  if (browserLang.startsWith('es')) {
    return 'es';
  }
  if (browserLang.startsWith('ru')) {
    return 'ru';
  }
  return 'en';
};

// Map i18next language codes to dayjs locale codes
const mapLanguageToDayjs = (lang: string): string => {
  switch (lang) {
    case 'zh-CN':
      return 'zh-cn';
    case 'zh-TW':
      return 'zh-tw';
    case 'ja':
      return 'ja';
    case 'pt':
      return 'pt';
    case 'es':
      return 'es';
    case 'ru':
      return 'ru';
    case 'ko':
      return 'ko';
    case 'de':
      return 'de';
    case 'fr':
      return 'fr';
    case 'it':
      return 'it';
    case 'pl':
      return 'pl';
    case 'tr':
      return 'tr';
    default:
      return 'en';
  }
};

// Initialize i18n
const initI18n = () => {
  const lng = getInitialLanguage();

  // Initialize dayjs
  dayjs.extend(localizedFormat);
  dayjs.locale(mapLanguageToDayjs(lng));

  i18n.use(initReactI18next).init({
    resources: {
      'zh-CN': {
        translation: zhCN,
      },
      'zh-TW': {
        translation: zhTW,
      },
      en: {
        translation: en,
      },
      ja: {
        translation: ja,
      },
      pt: {
        translation: pt,
      },
      es: {
        translation: es,
      },
      ru: {
        translation: ru,
      },
      ko: {
        translation: ko,
      },
      de: {
        translation: de,
      },
      fr: {
        translation: fr,
      },
      it: {
        translation: it,
      },
      pl: {
        translation: pl,
      },
      tr: {
        translation: tr,
      },
    },
    lng,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

  // Subscribe to language changes from settings store
  if (globalThis.window !== undefined) {
    let previousLanguage = usePegasusStore.getState().language;
    usePegasusStore.subscribe((state) => {
      const currentLanguage = state.language;
      const supportedLanguages = [
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
      ];
      if (
        currentLanguage !== previousLanguage &&
        supportedLanguages.includes(currentLanguage)
      ) {
        i18n.changeLanguage(currentLanguage);
        dayjs.locale(mapLanguageToDayjs(currentLanguage));
        previousLanguage = currentLanguage;
      }
    });
  }
};

// Initialize immediately
initI18n();

export default i18n;
