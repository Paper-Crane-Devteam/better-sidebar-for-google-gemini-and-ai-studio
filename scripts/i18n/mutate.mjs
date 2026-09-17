/**
 * Batch writes: upsert translations and delete keys, without ever asking the
 * caller to know a line number.
 */
import {
  LOCALES,
  SOURCE_LOCALE,
  deletePath,
  flatten,
  getPath,
  placeholderDiff,
  readAllLocales,
  reorderLike,
  setPathOrdered,
  writeLocale,
} from './core.mjs';

/** Align every locale's key order with the English file. Returns changed files. */
export const sortLocales = ({ dryRun = false } = {}) => {
  const raw = readAllLocales();
  const changed = [];
  for (const locale of LOCALES) {
    if (locale === SOURCE_LOCALE) continue;
    const before = JSON.stringify(raw[locale]);
    const sorted = reorderLike(raw[locale], raw[SOURCE_LOCALE]);
    if (JSON.stringify(sorted) === before) continue;
    changed.push(locale);
    if (!dryRun) writeLocale(locale, sorted);
  }
  return { changed, dryRun };
};

/**
 * Accepts either payload shape and returns `{ locale: { key: value } }`.
 *
 * locale-major:  { "en": { "a.b": "Hi", "c": { "d": "Yo" } }, "ja": { ... } }
 * key-major:     { "a.b": { "en": "Hi", "ja": "..." }, ... }
 */
export const normalizePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('payload must be a JSON object');
  }
  const topKeys = Object.keys(payload);
  if (topKeys.length === 0) return {};

  const localeMajor = topKeys.every((k) => LOCALES.includes(k));
  const out = Object.fromEntries(LOCALES.map((l) => [l, {}]));

  if (localeMajor) {
    for (const [locale, tree] of Object.entries(payload)) {
      if (!tree || typeof tree !== 'object') {
        throw new Error(`payload["${locale}"] must be an object`);
      }
      for (const [key, value] of flatten(tree)) {
        assertString(locale, key, value);
        out[locale][key] = value;
      }
    }
    return out;
  }

  for (const [key, byLocale] of Object.entries(payload)) {
    if (!byLocale || typeof byLocale !== 'object' || Array.isArray(byLocale)) {
      throw new Error(
        `"${key}" must map to { locale: text } — or make the payload locale-major`,
      );
    }
    const unknown = Object.keys(byLocale).filter((l) => !LOCALES.includes(l));
    if (unknown.length) {
      throw new Error(`"${key}" has unknown locale(s): ${unknown.join(', ')}`);
    }
    for (const [locale, value] of Object.entries(byLocale)) {
      assertString(locale, key, value);
      out[locale][key] = value;
    }
  }
  return out;
};

const assertString = (locale, key, value) => {
  if (typeof value !== 'string') {
    throw new Error(`${locale}.${key}: value must be a string`);
  }
};

/**
 * Upsert translations.
 *
 * @param payload      normalized or raw payload (both shapes accepted)
 * @param onlyMissing  skip keys that already have a value
 * @param dryRun       report only, touch no files
 * @returns { changes, warnings, errors, files }
 */
export const applyTranslations = (
  payload,
  { onlyMissing = false, dryRun = false } = {},
) => {
  const byLocale = normalizePayload(payload);
  const raw = readAllLocales();
  const enFlat = flatten(raw[SOURCE_LOCALE]);
  const changes = [];
  const warnings = [];
  const errors = [];
  const touched = new Set();

  for (const locale of LOCALES) {
    const entries = Object.entries(byLocale[locale] ?? {});
    if (entries.length === 0) continue;
    for (const [key, value] of entries) {
      const existing = getPath(raw[locale], key);
      if (onlyMissing && existing !== undefined) {
        changes.push({ locale, key, action: 'skipped' });
        continue;
      }
      const source = byLocale[SOURCE_LOCALE]?.[key] ?? enFlat.get(key);
      if (locale !== SOURCE_LOCALE && source !== undefined) {
        const diff = placeholderDiff(source, value);
        if (diff.missing.length || diff.extra.length) {
          warnings.push({
            locale,
            key,
            message: `placeholder mismatch (missing: ${diff.missing.join(',') || '-'}, extra: ${diff.extra.join(',') || '-'})`,
          });
        }
      }
      try {
        const action = setPathOrdered(
          raw[locale],
          key,
          value,
          raw[SOURCE_LOCALE],
        );
        changes.push({ locale, key, action });
        if (action !== 'unchanged') touched.add(locale);
      } catch (err) {
        errors.push({ locale, key, message: err.message });
      }
    }
  }

  if (errors.length === 0 && !dryRun) {
    for (const locale of touched) writeLocale(locale, raw[locale]);
  }

  return { changes, warnings, errors, files: [...touched] };
};

/**
 * Delete keys (and their emptied parents) from the given locales.
 * `keys` may end with `.*` to remove a whole subtree.
 */
export const removeKeys = (
  keys,
  { locales = LOCALES, dryRun = true } = {},
) => {
  const raw = readAllLocales();
  const removed = [];
  const notFound = [];
  const touched = new Set();

  for (const locale of locales) {
    const flat = flatten(raw[locale]);
    for (const pattern of keys) {
      const isSubtree = pattern.endsWith('.*');
      const base = isSubtree ? pattern.slice(0, -2) : pattern;
      const targets = isSubtree
        ? [...flat.keys()].filter((k) => k === base || k.startsWith(`${base}.`))
        : flat.has(base)
          ? [base]
          : [];
      if (targets.length === 0) {
        notFound.push({ locale, key: pattern });
        continue;
      }
      for (const key of targets) {
        if (deletePath(raw[locale], key)) {
          removed.push({ locale, key });
          touched.add(locale);
        }
      }
    }
  }

  if (!dryRun) for (const locale of touched) writeLocale(locale, raw[locale]);

  return { removed, notFound, files: [...touched], dryRun };
};
