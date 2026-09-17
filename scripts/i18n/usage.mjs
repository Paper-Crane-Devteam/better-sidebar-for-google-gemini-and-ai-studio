/**
 * Static scan of the source tree to decide which locale keys are actually used.
 *
 * Three signals are collected:
 *  1. `t('a.b.c')` / `i18n.t("a.b.c")` -> exact keys.
 *  2. any quoted string that looks like a dotted key (`const K = 'a.b.c'`,
 *     `{ i18nKey: 'a.b.c' }`, arrays of keys, ...) -> exact keys.
 *  3. `t(`a.b.${x}`)` -> a wildcard pattern, so dynamically composed keys are
 *     not reported as dead.
 *
 * A key counts as used when it (or one of its ancestors, for
 * `returnObjects`-style lookups) is an exact hit, or when it matches a
 * wildcard pattern. The bias is deliberately towards "used": a false "unused"
 * would delete a live string.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './core.mjs';

const SCAN_DIRS = ['src'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.output', '.wxt', 'locale']);

/** Dotted identifier, e.g. `agent.browser.color` (no spaces, no slashes). */
const KEY_LIKE = /^[A-Za-z][\w-]*(?:\.[\w-]+)+$/;

const walk = (dir, files = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, files);
    } else if (SCAN_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
};

export const sourceFiles = () =>
  SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

/**
 * Given `content[i] === '$'` (followed by `{`), return the index just past the
 * matching `}`.
 */
const skipInterpolation = (content, i) => {
  let depth = 0;
  for (let j = i + 1; j < content.length; j++) {
    if (content[j] === '{') depth++;
    else if (content[j] === '}') {
      depth--;
      if (depth === 0) return j + 1;
    }
  }
  return content.length;
};

/**
 * Turn a template literal body into a matcher.
 * Static chunks are kept verbatim, `${...}` becomes `[^`]+`.
 * Returns null when there is not enough static text to be meaningful
 * (a fully dynamic key would match everything).
 */
const templateToPattern = (body) => {
  const parts = [];
  let staticChars = 0;
  let buf = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '$' && body[i + 1] === '{') {
      parts.push({ static: buf });
      staticChars += buf.length;
      buf = '';
      i = skipInterpolation(body, i) - 1;
      parts.push({ dynamic: true });
    } else {
      buf += body[i];
    }
  }
  parts.push({ static: buf });
  staticChars += buf.length;
  if (!parts.some((p) => p.dynamic)) return { exact: body };
  if (staticChars < 2 || !/[A-Za-z]/.test(parts.map((p) => p.static ?? '').join(''))) {
    return null;
  }
  const src = parts
    .map((p) => (p.dynamic ? '[^\\n]+' : p.static.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return { pattern: new RegExp(`^${src}$`), source: body };
};

const T_CALL = /(?:^|[^\w$.])(?:i18n\s*\.\s*)?t\(\s*(['"`])/g;

/** Read the literal that starts at `content[start]` (the quote char). */
const readLiteral = (content, start) => {
  const quote = content[start];
  let out = '';
  for (let i = start + 1; i < content.length; i++) {
    const ch = content[i];
    if (ch === '\\') {
      out += content[i + 1] ?? '';
      i++;
    } else if (ch === quote) {
      return { body: out, end: i };
    } else if (quote === '`' && ch === '$' && content[i + 1] === '{') {
      const end = skipInterpolation(content, i);
      out += content.slice(i, end);
      i = end - 1;
    } else if (quote !== '`' && ch === '\n') {
      return null;
    } else {
      out += ch;
    }
  }
  return null;
};

export const scanUsage = () => {
  const exact = new Set();
  const patterns = [];
  const files = sourceFiles();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    // 1 + 3: everything passed to a t(...) call.
    T_CALL.lastIndex = 0;
    let m;
    while ((m = T_CALL.exec(content))) {
      const quoteIdx = m.index + m[0].length - 1;
      const lit = readLiteral(content, quoteIdx);
      if (!lit) continue;
      if (m[1] === '`') {
        const p = templateToPattern(lit.body);
        if (!p) continue;
        if (p.exact) exact.add(p.exact);
        else patterns.push(p);
      } else {
        exact.add(lit.body);
      }
    }

    // 2: any dotted-looking quoted string anywhere in the file.
    for (const lm of content.matchAll(/'([^'\n\\]+)'|"([^"\n\\]+)"/g)) {
      const value = lm[1] ?? lm[2];
      if (KEY_LIKE.test(value)) exact.add(value);
    }
  }

  return { exact, patterns, fileCount: files.length };
};

/**
 * i18next appends a plural category to the key at runtime, so `x_one` /
 * `x_other` are live as long as `x` is referenced.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Why a key is considered used, or null when nothing references it. */
export const usageReason = (key, usage) => {
  if (usage.exact.has(key)) return 'exact';
  if (PLURAL_SUFFIX.test(key)) {
    const base = key.replace(PLURAL_SUFFIX, '');
    const reason = usageReason(base, usage);
    if (reason) return `plural:${base}`;
  }
  const segs = key.split('.');
  for (let i = segs.length - 1; i >= 2; i--) {
    if (usage.exact.has(segs.slice(0, i).join('.'))) {
      return `parent:${segs.slice(0, i).join('.')}`;
    }
  }
  for (const p of usage.patterns) {
    if (p.pattern.test(key)) return `pattern:${p.source}`;
  }
  return null;
};
