/**
 * i18n with every locale inlined into the bundle.
 *
 * Only for the main-world script: it runs in the page's context, has no
 * `browser.runtime.getURL`, so it cannot fetch `/locales/*.json` the way
 * `@/locale/i18n` does. It only needs a handful of strings and its bundle is
 * well below the AMO 5 MB per-file limit.
 */
import i18n from 'i18next';
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
import {
  applyDayjsLocale,
  getInitialLanguage,
  subscribeLanguageChanges,
} from './language';

const lng = getInitialLanguage();
applyDayjsLocale(lng);

i18n.init({
  resources: {
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    en: { translation: en },
    ja: { translation: ja },
    pt: { translation: pt },
    es: { translation: es },
    ru: { translation: ru },
    ko: { translation: ko },
    de: { translation: de },
    fr: { translation: fr },
    it: { translation: it },
    pl: { translation: pl },
    tr: { translation: tr },
  },
  lng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

subscribeLanguageChanges((next) => {
  i18n.changeLanguage(next);
  applyDayjsLocale(next);
});

export default i18n;
