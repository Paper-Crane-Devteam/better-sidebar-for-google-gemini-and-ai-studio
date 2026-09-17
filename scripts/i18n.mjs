#!/usr/bin/env node
/**
 * i18n maintenance CLI — built for an AI agent to drive.
 *
 *   node scripts/i18n.mjs check
 *   node scripts/i18n.mjs missing [--locale ja,ru] [--prefix agent] [--json] [--limit 50]
 *   node scripts/i18n.mjs todo    [--locale ja] [--limit 80]      # ready-to-fill skeleton
 *   node scripts/i18n.mjs unused  [--flat] [--json] [--why]
 *   node scripts/i18n.mjs drift   [--locale ja]
 *   node scripts/i18n.mjs get <key|prefix.*> ...
 *   node scripts/i18n.mjs apply <file.json | -> [--only-missing] [--dry-run]
 *   node scripts/i18n.mjs rm <key|prefix.*> ... [--from file] [--unused] [--yes]
 *   node scripts/i18n.mjs sort    [--dry-run]                    # align key order with en
 *
 * `apply` takes either payload shape:
 *   { "ja": { "agent.foo.bar": "テキスト" }, "ru": { ... } }
 *   { "agent.foo.bar": { "ja": "テキスト", "ru": "..." } }
 * Nested objects work too, so a payload can be pasted straight from en.json.
 */
import fs from 'node:fs';
import {
  LOCALES,
  SOURCE_LOCALE,
  flatten,
  parseArgs,
  readAllLocales,
  readStdin,
  resolveLocales,
  listFlag,
} from './i18n/core.mjs';
import {
  findDrift,
  findMissing,
  findUnused,
  loadFlat,
  summarize,
} from './i18n/report.mjs';
import { applyTranslations, removeKeys, sortLocales } from './i18n/mutate.mjs';

const { flags, positional } = parseArgs(process.argv.slice(2));
const command = positional.shift() ?? 'check';
const prefixes = listFlag(flags.prefix);
const asJson = flags.json === true || flags.json === 'true';
const limit = flags.limit ? Number(flags.limit) : Infinity;

const out = (data, text) => {
  if (asJson) console.log(JSON.stringify(data, null, flags.compact ? 0 : 2));
  else text();
};

/** Collapse a key list into `parent.* (n)` lines when a whole subtree is listed. */
const collapse = (keys) => {
  const set = new Set(keys);
  const groups = new Map();
  for (const key of keys) {
    const parent = key.split('.').slice(0, -1).join('.');
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(key);
  }
  const enFlat = flatten(readAllLocales()[SOURCE_LOCALE]);
  const lines = [];
  const consumed = new Set();
  for (const [parent, members] of groups) {
    if (!parent) continue;
    const siblings = [...enFlat.keys()].filter(
      (k) => k.startsWith(`${parent}.`) && k.split('.').length === parent.split('.').length + 1,
    );
    if (siblings.length > 1 && siblings.every((s) => set.has(s))) {
      lines.push(`${parent}.*  # ${members.length} keys`);
      members.forEach((m) => consumed.add(m));
    }
  }
  for (const key of keys) if (!consumed.has(key)) lines.push(key);
  return lines;
};

const commands = {
  check() {
    const s = summarize();
    out(s, () => {
      console.log(
        `${s.totalKeys} keys · ${s.scannedFiles} source files scanned\n`,
      );
      for (const row of s.perLocale) {
        const tag = row.missing === 0 ? 'complete' : `${row.missing} missing`;
        console.log(`  ${row.locale.padEnd(6)} ${String(row.keys).padStart(5)} keys   ${tag}`);
      }
      console.log(
        `\n  ${s.missingKeys} key(s) incomplete in at least one locale  ->  i18n.mjs missing`,
      );
      console.log(
        `  ${s.unusedKeys} key(s) referenced nowhere in src/          ->  i18n.mjs unused`,
      );
    });
  },

  missing() {
    const locales = resolveLocales(flags);
    const rows = findMissing({ locales, prefixes });
    const shown = rows.slice(0, limit);
    out({ total: rows.length, shown: shown.length, rows: shown }, () => {
      if (rows.length === 0) return console.log('nothing missing');
      const buckets = new Map();
      for (const row of shown) {
        const tag = row.missing.join(',');
        if (!buckets.has(tag)) buckets.set(tag, []);
        buckets.get(tag).push(row);
      }
      for (const [tag, group] of buckets) {
        console.log(`\n# missing in ${tag} (${group.length})`);
        for (const row of group) {
          const src = row.source === undefined ? '(no source text)' : JSON.stringify(row.source);
          console.log(`  ${row.key}  [${row.sourceLocale ?? '?'}] ${src}`);
        }
      }
      if (rows.length > shown.length) {
        console.log(`\n... ${rows.length - shown.length} more (raise --limit)`);
      }
    });
  },

  /** Skeleton payload for `apply`: source text in, translations to be filled. */
  todo() {
    const locales = resolveLocales(flags);
    const rows = findMissing({ locales, prefixes }).slice(0, limit);
    const payload = {};
    for (const row of rows) {
      payload[row.key] = Object.fromEntries([
        [`_source(${row.sourceLocale ?? '?'})`, row.source ?? ''],
        ...row.missing.map((l) => [l, '']),
      ]);
    }
    console.log(JSON.stringify(payload, null, 2));
    if (!asJson) {
      console.error(
        `\n${rows.length} key(s). Fill the empty strings, drop the _source lines, ` +
          `then: node scripts/i18n.mjs apply payload.json`,
      );
    }
  },

  unused() {
    const { rows, usage } = findUnused({ prefixes });
    const withWhy = flags.why === true;
    out(
      {
        total: rows.length,
        scannedFiles: usage.fileCount,
        rows: rows.slice(0, limit),
      },
      () => {
        if (rows.length === 0) return console.log('no dead keys');
        console.log(`# ${rows.length} key(s) not referenced in src/ (${usage.fileCount} files scanned)`);
        const keys = rows.map((r) => r.key);
        const lines = flags.flat ? keys : collapse(keys);
        for (const line of lines.slice(0, limit)) {
          const row = rows.find((r) => r.key === line);
          const text = row?.source !== undefined && withWhy ? `  ${JSON.stringify(row.source)}` : '';
          console.log(`  ${line}${text}`);
        }
        console.log(
          '\nremove with: node scripts/i18n.mjs rm <key> ["prefix.*"] --yes' +
            '   (all listed: node scripts/i18n.mjs rm --unused --yes)',
        );
      },
    );
  },

  drift() {
    const locales = resolveLocales(flags);
    const { placeholderRows, identicalRows } = findDrift({ locales, prefixes });
    out({ placeholderRows, identicalRows }, () => {
      console.log(`# placeholder mismatches (${placeholderRows.length})`);
      for (const r of placeholderRows.slice(0, limit)) {
        console.log(
          `  ${r.locale} ${r.key}  missing:[${r.missing.join(',')}] extra:[${r.extra.join(',')}]`,
        );
      }
      console.log(`\n# identical to ${SOURCE_LOCALE} (${identicalRows.length})`);
      for (const r of identicalRows.slice(0, limit)) {
        console.log(`  ${r.locale} ${r.key}  ${JSON.stringify(r.value)}`);
      }
    });
  },

  get() {
    if (positional.length === 0) throw new Error('get needs at least one key');
    const { flat, keys: allKeys } = loadFlat();
    const result = {};
    for (const pattern of positional) {
      const isSubtree = pattern.endsWith('.*');
      const base = isSubtree ? pattern.slice(0, -2) : pattern;
      const keys = isSubtree
        ? allKeys.filter((k) => k === base || k.startsWith(`${base}.`))
        : [base];
      for (const key of keys) {
        result[key] = Object.fromEntries(
          LOCALES.filter((l) => flat[l].has(key)).map((l) => [l, flat[l].get(key)]),
        );
      }
    }
    out(result, () => {
      for (const [key, values] of Object.entries(result)) {
        console.log(`\n${key}`);
        if (Object.keys(values).length === 0) console.log('  (not found)');
        for (const [l, v] of Object.entries(values)) {
          console.log(`  ${l.padEnd(6)} ${JSON.stringify(v)}`);
        }
      }
    });
  },

  async apply() {
    const src = positional[0] ?? (flags.data ? null : '-');
    const text = flags.data
      ? String(flags.data)
      : src === '-'
        ? await readStdin()
        : fs.readFileSync(src, 'utf8');
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw new Error(`invalid JSON payload: ${err.message}`);
    }
    // Tolerate `todo` output that still carries the _source annotations.
    for (const value of Object.values(payload)) {
      if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) {
          if (k.startsWith('_source') || value[k] === '') delete value[k];
        }
      }
    }
    for (const [k, v] of Object.entries(payload)) {
      if (v && typeof v === 'object' && Object.keys(v).length === 0) delete payload[k];
    }

    const result = applyTranslations(payload, {
      onlyMissing: flags['only-missing'] === true,
      dryRun: flags['dry-run'] === true,
    });
    const counts = result.changes.reduce((acc, c) => {
      acc[c.action] = (acc[c.action] ?? 0) + 1;
      return acc;
    }, {});
    const dry = flags['dry-run'] === true;
    out({ ...result, counts, dryRun: dry }, () => {
      for (const w of result.warnings) console.log(`warn  ${w.locale} ${w.key}: ${w.message}`);
      for (const e of result.errors) console.log(`error ${e.locale} ${e.key}: ${e.message}`);
      const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing';
      const files = result.files.join(', ');
      console.log(
        dry
          ? `[dry-run] ${summary}${files ? ` · would write ${files}` : ''}`
          : `${summary}${files ? ` · wrote ${files}` : ''}`,
      );
    });
    if (result.errors.length) process.exitCode = 1;
  },

  rm() {
    let keys = [...positional];
    if (flags.from) {
      const text = fs.readFileSync(String(flags.from), 'utf8').trim();
      keys.push(
        ...(text.startsWith('[')
          ? JSON.parse(text)
          : text.split('\n').map((l) => l.trim()).filter(Boolean)),
      );
    }
    if (flags.unused === true) {
      keys.push(...findUnused({ prefixes }).rows.map((r) => r.key));
    }
    if (keys.length === 0) throw new Error('rm needs keys, --from <file> or --unused');
    const result = removeKeys(keys, {
      locales: resolveLocales(flags),
      dryRun: flags.yes !== true,
    });
    out(result, () => {
      const byKey = new Map();
      for (const r of result.removed) {
        if (!byKey.has(r.key)) byKey.set(r.key, []);
        byKey.get(r.key).push(r.locale);
      }
      for (const [key, locales] of byKey) console.log(`  - ${key}  [${locales.join(',')}]`);
      console.log(
        `${result.dryRun ? '[dry-run] would remove' : 'removed'} ${byKey.size} key(s)` +
          (result.dryRun ? ' — rerun with --yes' : ` · wrote ${result.files.join(', ')}`),
      );
    });
  },

  /** Optional cleanup: make every locale follow en.json's key order. */
  sort() {
    const result = sortLocales({ dryRun: flags['dry-run'] === true });
    out(result, () => {
      console.log(
        result.changed.length === 0
          ? 'already aligned with en.json'
          : `${result.dryRun ? '[dry-run] would reorder' : 'reordered'} ${result.changed.join(', ')}`,
      );
    });
  },

  help() {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  },
};

const run = commands[command] ?? commands.help;
try {
  await run();
} catch (err) {
  console.error(`i18n: ${err.message}`);
  process.exitCode = 1;
}
