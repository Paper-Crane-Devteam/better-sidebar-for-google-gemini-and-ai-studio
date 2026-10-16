/** Argument parsing and shared output helpers for devtap. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/;
const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

export function parseDuration(v) {
  if (v == null) return null;
  const m = DURATION.exec(String(v).trim());
  if (!m) throw new Error(`Bad duration "${v}". Use e.g. 500ms, 30s, 5m, 1h.`);
  return Number(m[1]) * UNIT_MS[m[2]];
}

const FLAG_ALIASES = { n: 'limit', o: 'out', g: 'grep', c: 'ctx', h: 'help' };
const BOOLEAN_FLAGS = new Set([
  'help',
  'json',
  'raw',
  'stack',
  'quiet',
  'noise',
  'write',
  'no-tabs',
  'all',
  'new',
]);

/**
 * `devtap logs --ctx bg -n 50 --grep 'DB Query'` → { _: ['logs'], ctx, limit, grep }
 *
 * Hand-rolled rather than pulled from npm: this script has to run before
 * `node_modules` is guaranteed to be in any particular state.
 */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      out._.push(a);
      continue;
    }
    let key = a.replace(/^--?/, '');
    let value = null;
    const eq = key.indexOf('=');
    if (eq !== -1) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    key = FLAG_ALIASES[key] || key;
    // `--chrome` alone or `--chrome=<user-data-dir>`; never eats the next arg.
    if (key === 'chrome') {
      out.chrome = value ?? true;
      continue;
    }
    if (BOOLEAN_FLAGS.has(key)) {
      out[key] = value == null ? true : value !== 'false';
      continue;
    }
    if (value == null) {
      value = argv[i + 1];
      i++;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Write somewhere, and say where.
 *
 * The default destination is a file rather than stdout because the caller is
 * usually an agent with a context budget: a 4000-line dump belongs on disk where
 * it can be grepped, not in a transcript.
 */
export function emit(text, { out, quiet = false, label = 'output' } = {}) {
  if (!out) {
    process.stdout.write(text.endsWith('\n') ? text : text + '\n');
    return null;
  }
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith('\n') ? text : text + '\n', 'utf8');
  if (!quiet) {
    const lines = text ? text.split('\n').length : 0;
    process.stdout.write(`${label}: ${lines} lines → ${path}\n`);
  }
  return path;
}

export function die(message) {
  process.stderr.write(`devtap: ${message}\n`);
  process.exit(1);
}
