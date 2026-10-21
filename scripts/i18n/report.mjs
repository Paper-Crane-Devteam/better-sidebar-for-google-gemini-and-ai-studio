/**
 * Analysis passes: missing translations, dead keys, source/target drift.
 */
import {
  LOCALES,
  SOURCE_LOCALE,
  flatten,
  placeholderDiff,
  readAllLocales,
} from './core.mjs';
import { scanUsage, usageReason } from './usage.mjs';

/** `{ locale: Map<key, value> }` plus the union of all keys, in en order first. */
export const loadFlat = () => {
  const raw = readAllLocales();
  const flat = Object.fromEntries(
    Object.entries(raw).map(([l, obj]) => [l, flatten(obj)]),
  );
  const keys = [];
  const seen = new Set();
  const push = (k) => {
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  };
  for (const k of flat[SOURCE_LOCALE].keys()) push(k);
  for (const l of LOCALES) for (const k of flat[l].keys()) push(k);
  return { raw, flat, keys };
};

const matchesPrefix = (key, prefixes) =>
  prefixes.length === 0 || prefixes.some((p) => key === p || key.startsWith(`${p}.`));

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const pluralCategoryCache = new Map();
const pluralCategories = (locale) => {
  if (!pluralCategoryCache.has(locale)) {
    // Only categories ordinary counts hit: es/fr/it/pt report `many`, but
    // only for 1e6-style numbers, which never shows up in this UI.
    const rules = new Intl.PluralRules(locale);
    const used = new Set();
    for (let n = 0; n <= 1000; n++) used.add(rules.select(n));
    pluralCategoryCache.set(locale, used);
  }
  return pluralCategoryCache.get(locale);
};

/**
 * i18next plural variants are per-language: ru/pl need `_few`/`_many`, ja/zh
 * only `_other`, en never has `_few`. A plural-suffixed key is only expected in
 * a locale whose plural rules actually use that category.
 *
 * `_zero`/`_two`/`_few`/`_many` may also be skipped on purpose: i18next falls
 * back to the bare key when a variant is missing, so a locale can phrase the
 * bare key count-neutrally ("Kroki: {{count}}") instead of spelling out every
 * form. Only `_one`/`_other` are always required where the language uses them.
 */
const expectedIn = (key, locale, flatLocale) => {
  const m = PLURAL_SUFFIX.exec(key);
  if (!m) return true;
  const cat = m[1];
  if (cat === 'other') return true;
  if (!pluralCategories(locale).has(cat)) return false;
  if (cat === 'one') return true;
  return !flatLocale.has(key.slice(0, m.index));
};

/**
 * Keys that exist in at least one locale but not in all requested ones.
 * Each entry: { key, missing: string[], present: string[], source, sourceLocale }
 */
export const findMissing = ({ locales = LOCALES, prefixes = [] } = {}) => {
  const { flat, keys } = loadFlat();
  const rows = [];
  for (const key of keys) {
    if (!matchesPrefix(key, prefixes)) continue;
    const missing = locales.filter((l) => !flat[l].has(key) && expectedIn(key, l, flat[l]));
    if (missing.length === 0) continue;
    const present = LOCALES.filter((l) => flat[l].has(key));
    const sourceLocale = flat[SOURCE_LOCALE].has(key) ? SOURCE_LOCALE : present[0];
    rows.push({
      key,
      missing,
      present,
      sourceLocale,
      source: sourceLocale ? flat[sourceLocale].get(key) : undefined,
    });
  }
  return rows;
};

/**
 * Keys no source file references.
 * Each entry: { key, locales, source }
 */
export const findUnused = ({ prefixes = [] } = {}) => {
  const { flat, keys } = loadFlat();
  const usage = scanUsage();
  const rows = [];
  for (const key of keys) {
    if (!matchesPrefix(key, prefixes)) continue;
    if (usageReason(key, usage)) continue;
    rows.push({
      key,
      locales: LOCALES.filter((l) => flat[l].has(key)),
      source: flat[SOURCE_LOCALE].get(key),
    });
  }
  return { rows, usage };
};

/**
 * Translations whose {{placeholders}} disagree with the English source, and
 * translations that are byte-identical to English (often forgotten strings).
 */
export const findDrift = ({ locales = LOCALES, prefixes = [] } = {}) => {
  const { flat } = loadFlat();
  const placeholderRows = [];
  const identicalRows = [];
  for (const [key, source] of flat[SOURCE_LOCALE]) {
    if (!matchesPrefix(key, prefixes)) continue;
    for (const locale of locales) {
      if (locale === SOURCE_LOCALE) continue;
      const value = flat[locale].get(key);
      if (value === undefined) continue;
      const diff = placeholderDiff(source, value);
      if (diff.missing.length || diff.extra.length) {
        placeholderRows.push({ key, locale, source, value, ...diff });
      }
      // ASCII-only short labels are legitimately the same everywhere.
      if (value === source && /[^\x00-\x7F]/.test(value) === false && value.length > 12) {
        identicalRows.push({ key, locale, value });
      }
    }
  }
  return { placeholderRows, identicalRows };
};

/** One-line-per-locale overview. */
export const summarize = () => {
  const { flat, keys } = loadFlat();
  const missing = findMissing();
  const { rows: unused, usage } = findUnused();
  return {
    totalKeys: keys.length,
    scannedFiles: usage.fileCount,
    perLocale: LOCALES.map((l) => ({
      locale: l,
      keys: flat[l].size,
      missing: missing.filter((r) => r.missing.includes(l)).length,
    })),
    missingKeys: missing.length,
    unusedKeys: unused.length,
    unusedByLocaleCount: unused.reduce((n, r) => n + r.locales.length, 0),
  };
};
