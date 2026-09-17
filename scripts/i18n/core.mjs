/**
 * Shared helpers for the i18n tooling (scripts/i18n.mjs).
 *
 * Locale files live in src/locale/<locale>.json and are plain nested objects of
 * strings, serialized with 2-space indent + trailing newline.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const LOCALE_DIR = path.join(ROOT, 'src', 'locale');

/** Primary language: every other locale is expected to mirror it. */
export const SOURCE_LOCALE = 'en';

/** Discovered from disk so adding a new language needs no code change. */
export const LOCALES = fs
  .readdirSync(LOCALE_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -'.json'.length))
  .sort((a, b) => (a === SOURCE_LOCALE ? -1 : b === SOURCE_LOCALE ? 1 : a.localeCompare(b)));

export const localePath = (locale) => path.join(LOCALE_DIR, `${locale}.json`);

export const readLocale = (locale) =>
  JSON.parse(fs.readFileSync(localePath(locale), 'utf8'));

export const readAllLocales = () =>
  Object.fromEntries(LOCALES.map((l) => [l, readLocale(l)]));

export const writeLocale = (locale, obj) => {
  fs.writeFileSync(localePath(locale), `${JSON.stringify(obj, null, 2)}\n`);
};

/* ------------------------------------------------------------------ paths */

/** `{a:{b:'x'}}` -> `Map { 'a.b' => 'x' }` (leaf strings only). */
export const flatten = (obj, prefix = '', out = new Map()) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
};

export const getPath = (obj, key) => {
  let cur = obj;
  for (const seg of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
};

/**
 * Insert `key` into `obj` (mutating it in place, reference preserved) at the
 * position it occupies in `sourceParent`, relative to the siblings that already
 * exist. Untouched siblings keep their order, so the diff is a single line
 * instead of a reshuffled file.
 */
const insertOrdered = (obj, key, value, sourceParent) => {
  const order =
    sourceParent && typeof sourceParent === 'object' ? Object.keys(sourceParent) : [];
  const target = order.indexOf(key);
  const existing = Object.keys(obj);
  let at = existing.length;
  if (target !== -1) {
    for (let i = 0; i < existing.length; i++) {
      const pos = order.indexOf(existing[i]);
      if (pos !== -1 && pos > target) {
        at = i;
        break;
      }
    }
  }
  const entries = existing.map((k) => [k, obj[k]]);
  entries.splice(at, 0, [key, value]);
  for (const k of existing) delete obj[k];
  for (const [k, v] of entries) obj[k] = v;
};

/**
 * Write `value` at the dotted `key`, creating intermediate groups as needed.
 * New keys (and new groups) are placed where `source` — normally the English
 * tree — puts them. Returns 'added' | 'updated' | 'unchanged', and throws on a
 * shape conflict (e.g. writing `a.b.c` when `a.b` is already a string).
 */
export const setPathOrdered = (obj, key, value, source) => {
  const segs = key.split('.');
  let cur = obj;
  let src = source;
  const walked = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    walked.push(seg);
    const srcChild = src && typeof src === 'object' ? src[seg] : undefined;
    const isLeaf = i === segs.length - 1;

    if (isLeaf) {
      const prev = cur[seg];
      if (prev !== undefined && typeof prev === 'object') {
        throw new Error(`cannot set "${key}": it is a group, not a leaf`);
      }
      if (prev === undefined) {
        insertOrdered(cur, seg, value, src);
        return 'added';
      }
      cur[seg] = value;
      return prev === value ? 'unchanged' : 'updated';
    }

    if (cur[seg] === undefined) {
      insertOrdered(cur, seg, {}, src);
    } else if (typeof cur[seg] !== 'object' || Array.isArray(cur[seg])) {
      throw new Error(
        `cannot set "${key}": "${walked.join('.')}" is already a value`,
      );
    }
    cur = cur[seg];
    src = srcChild;
  }
  throw new Error(`cannot set "${key}"`);
};

/** Delete a dotted key and prune parents that became empty. Returns boolean. */
export const deletePath = (obj, key) => {
  const segs = key.split('.');
  const chain = [obj];
  let cur = obj;
  for (const seg of segs.slice(0, -1)) {
    cur = cur?.[seg];
    if (!cur || typeof cur !== 'object') return false;
    chain.push(cur);
  }
  const leaf = segs[segs.length - 1];
  if (!(leaf in cur)) return false;
  delete cur[leaf];
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length > 0) break;
    delete chain[i - 1][segs[i - 1]];
  }
  return true;
};

/**
 * Reorder `target`'s keys to follow `source`'s order, recursively.
 * Keys that only exist in `target` keep their relative order and are appended
 * after the shared ones, so new entries land next to their English siblings and
 * diffs stay small.
 */
export const reorderLike = (target, source) => {
  if (!source || typeof source !== 'object') return target;
  const out = {};
  for (const k of Object.keys(source)) {
    if (!(k in target)) continue;
    const tv = target[k];
    out[k] =
      tv && typeof tv === 'object' ? reorderLike(tv, source[k]) : tv;
  }
  for (const [k, tv] of Object.entries(target)) {
    if (k in out) continue;
    out[k] = tv && typeof tv === 'object' ? reorderLike(tv, source[k]) : tv;
  }
  return out;
};

/* ------------------------------------------------------- placeholder check */

const PLACEHOLDER = /\{\{\s*([\w.]+)[^}]*\}\}/g;

export const placeholders = (str) =>
  typeof str === 'string'
    ? [...str.matchAll(PLACEHOLDER)].map((m) => m[1]).sort()
    : [];

/** Placeholders present in `source` but absent from `translated` (and vice versa). */
export const placeholderDiff = (source, translated) => {
  const a = new Set(placeholders(source));
  const b = new Set(placeholders(translated));
  return {
    missing: [...a].filter((p) => !b.has(p)),
    extra: [...b].filter((p) => !a.has(p)),
  };
};

/* -------------------------------------------------------------- cli utils */

/** Minimal flag parser: `--key value`, `--key=value`, `--flag`, positionals. */
export const parseArgs = (argv) => {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) flags[name] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[name] = argv[++i];
    else flags[name] = true;
  }
  return { flags, positional };
};

export const listFlag = (value) =>
  typeof value === 'string'
    ? value.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

export const resolveLocales = (flags) => {
  const wanted = listFlag(flags.locale ?? flags.locales);
  if (wanted.length === 0) return LOCALES;
  const bad = wanted.filter((l) => !LOCALES.includes(l));
  if (bad.length) throw new Error(`unknown locale(s): ${bad.join(', ')}`);
  return wanted;
};

export const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};
