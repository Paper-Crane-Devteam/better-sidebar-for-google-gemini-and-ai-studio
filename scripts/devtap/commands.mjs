/** devtap subcommands. Each takes the parsed flags and prints or writes. */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { attach, evaluate } from './cdp.mjs';
import { argToText, clipPart, collect, formatEntry, toNdjson } from './collect.mjs';
import {
  CTX,
  discover,
  filterContexts,
  openAll,
  pickBackground,
  pickMessenger,
  sortForReading,
} from './contexts.mjs';
import { emit, parseDuration } from './args.mjs';
import {
  BACKGROUND_PROBE,
  inExtensionWorld,
  isWriteSql,
  runSql,
  sendExtensionMessage,
} from './probe.mjs';

const DEFAULT_LOG_DIR = '.kiro/devlog';

/** Contexts that exist but are not currently running, and why that is normal. */
function absentNotes(nodes) {
  const notes = [];
  if (!nodes.some((n) => n.ctx === CTX.BG)) {
    notes.push('  bg          asleep — Chrome stops the worker after ~30s idle; reload a tab to wake it');
  }
  if (!nodes.some((n) => n.ctx === CTX.OFF)) {
    notes.push('  off         not created yet — it appears on the first database access');
  }
  if (!nodes.some((n) => n.ctx === CTX.PAGE)) {
    notes.push('  gem / ais   no host tab open — `sql` and `msg` need one');
  }
  return notes;
}

export async function cmdTargets(flags) {
  const { extId, roots } = await discover(flags.port);
  const opened = await openAll(roots);
  try {
    const rows = sortForReading(opened.nodes).map(
      (n) => `  ${n.label.padEnd(11)} ${n.ctx.padEnd(8)} ${n.url}`,
    );
    const notes = absentNotes(opened.nodes);
    emit(
      [
        `extension ${extId}`,
        '',
        ...rows,
        ...(notes.length ? ['', 'not running:', ...notes] : []),
        ...(opened.failures.length ? ['', `unreachable: ${opened.failures.join('; ')}`] : []),
      ].join('\n'),
      { out: flags.out, quiet: flags.quiet, label: 'targets' },
    );
  } finally {
    opened.close();
  }
}

export async function cmdLogs(flags) {
  const { roots } = await discover(flags.port);
  const opened = await openAll(roots);
  try {
    const wanted = sortForReading(filterContexts(opened.nodes, flags.ctx));
    if (!wanted.length) {
      throw new Error(
        `No context matched --ctx "${flags.ctx}". Available: ` +
          opened.nodes.map((n) => n.label).join(', '),
      );
    }

    const result = await collect(wanted, {
      grep: flags.grep,
      minLevel: flags.level,
      since: parseDuration(flags.since),
      limit: Number(flags.limit ?? 300),
      maxValueLen: Number(flags.maxval ?? 400),
      hydrateObjects: !flags.raw,
      includeNoise: !!flags.noise,
      quietMs: Number(flags.quietms ?? 400),
      maxMs: Number(flags.maxms ?? 4000),
    });

    const body = result.entries
      .map((e) => (flags.json ? toNdjson(e) : formatEntry(e, { showStack: !!flags.stack })))
      .join('\n');

    const header = flags.json
      ? ''
      : [
          `# devtap logs  contexts=${wanted.map((n) => n.label).join(',')}` +
            `  shown=${result.entries.length}` +
            (result.dropped ? `  dropped=${result.dropped} older` : ''),
          ...(opened.failures.length ? [`# unreachable: ${opened.failures.join('; ')}`] : []),
          '',
        ].join('\n');

    // `logs` writes to a file by default: a 4000-line dump belongs on disk where
    // it can be grepped. `--out=` (empty) forces stdout.
    const out = flags.out === undefined ? `${DEFAULT_LOG_DIR}/logs.txt` : flags.out || null;
    emit(header + body, { out, quiet: flags.quiet, label: 'logs' });
  } finally {
    opened.close();
  }
}

/**
 * Live stream, appended to a file.
 *
 * Separate from `logs` because it never returns: start it, reproduce the bug,
 * then grep the file. `logs` alone cannot cover this — Chrome's replay buffer is
 * ~1000 entries per target, and the chattier flows here fill that in seconds.
 */
export async function cmdWatch(flags) {
  const { roots } = await discover(flags.port);
  const opened = await openAll(roots);
  const wanted = sortForReading(filterContexts(opened.nodes, flags.ctx));

  const out = resolve(flags.out || `${DEFAULT_LOG_DIR}/watch.txt`);
  mkdirSync(dirname(out), { recursive: true });

  const re = flags.grep ? new RegExp(flags.grep, 'i') : null;
  const write = (line) => {
    if (re && !re.test(line)) return;
    appendFileSync(out, line + '\n', 'utf8');
    if (!flags.quiet) process.stdout.write(line + '\n');
  };

  write(
    `# devtap watch ${new Date().toISOString()} contexts=${wanted.map((n) => n.label).join(',')}`,
  );

  const maxLen = Number(flags.maxval ?? 1200);

  /**
   * `Runtime.enable` replays the console buffer, and here that is noise: `watch`
   * is about what happens next, and `logs` already covers what came before. So
   * the first stretch after enabling is swallowed — long enough for the burst to
   * arrive, short enough not to lose the first thing the user then does.
   */
  const warmupUntil = Date.now() + Number(flags.warmup ?? 1500);

  for (const node of wanted) {
    node.session.on(async (msg) => {
      const isThrow = msg.method === 'Runtime.exceptionThrown';
      if (msg.method !== 'Runtime.consoleAPICalled' && !isThrow) return;
      if (Date.now() < warmupUntil) return;

      const p = msg.params;
      const args = isThrow
        ? [{ value: p.exceptionDetails?.exception?.description || p.exceptionDetails?.text }]
        : p.args;

      const parts = await Promise.all(
        (args || []).map(async (a) => {
          if (!a.objectId) return clipPart(argToText(a), maxLen);
          try {
            const r = await node.session.send('Runtime.callFunctionOn', {
              objectId: a.objectId,
              functionDeclaration:
                'function(n){try{var s=JSON.stringify(this);return s&&s.length>n?s.slice(0,n)+"…":s}catch(e){return String(this)}}',
              arguments: [{ value: maxLen }],
              returnByValue: true,
            });
            const v = r?.result?.value;
            return clipPart(typeof v === 'string' ? v : argToText(a), maxLen);
          } catch {
            return clipPart(argToText(a), maxLen);
          }
        }),
      );

      const lvl = isThrow ? 'ERR' : (p.type || 'log').slice(0, 3).toUpperCase();
      write(
        `${new Date().toISOString().slice(11, 23)} ${node.label.padEnd(10)} ${lvl} ${parts.join(' ')}`,
      );
    });
    node.session.post('Runtime.enable');
    node.session.post('Log.enable');
  }

  process.stdout.write(`watching ${wanted.length} contexts → ${out}\n`);
  await new Promise(() => {});
}

export async function cmdEval(flags) {
  const [, ctxName, ...exprParts] = flags._;
  const expression = exprParts.join(' ');
  if (!ctxName || !expression) throw new Error('Usage: devtap eval <ctx> <expression>');

  const { roots } = await discover(flags.port);
  const opened = await openAll(roots);
  try {
    const node = filterContexts(opened.nodes, ctxName)[0];
    if (!node) {
      throw new Error(
        `No context "${ctxName}". Available: ${opened.nodes.map((n) => n.label).join(', ')}`,
      );
    }
    const value = await evaluate(node.session, expression);
    emit(typeof value === 'string' ? value : JSON.stringify(value, null, 2), {
      out: flags.out,
      quiet: flags.quiet,
      label: 'eval',
    });
  } finally {
    opened.close();
  }
}

export async function cmdSql(flags) {
  const sql = flags._.slice(1).join(' ');
  if (!sql) throw new Error('Usage: devtap sql "<query>"');
  if (isWriteSql(sql) && !flags.write) {
    throw new Error(
      'That statement modifies the database. Re-run with --write if that is really the intent.',
    );
  }

  const { extId, roots } = await discover(flags.port);
  const page = pickMessenger(roots);

  const rows = await inExtensionWorld(page, extId, (session, contextId) =>
    runSql(session, contextId, sql),
  );

  emit(renderRows(rows, Number(flags.limit ?? 50)), {
    out: flags.out,
    quiet: flags.quiet,
    label: 'sql',
  });
}

/**
 * Display width, not character count.
 *
 * Almost every title, folder name and prompt in this project's data is Chinese,
 * and CJK glyphs occupy two terminal columns each. Padding by `length` makes every
 * row after the first one ragged, which is exactly the case the table is for.
 */
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

function displayWidth(s) {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? 2 : 1;
  return w;
}

/** Pad or truncate to an exact display width. */
function fit(s, width) {
  const total = displayWidth(s);
  if (total <= width) return s + ' '.repeat(width - total);

  // Only now is an ellipsis needed, so only now does it cost a column.
  let w = 0;
  let out = '';
  for (const ch of s) {
    const cw = WIDE.test(ch) ? 2 : 1;
    if (w + cw > width - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…' + ' '.repeat(Math.max(0, width - w - 1));
}

/**
 * Rows as an aligned table, because that is how a schema or a row count is
 * actually read. Falls back to JSON for anything that is not a row set.
 */
function renderRows(rows, limit) {
  if (!Array.isArray(rows)) return JSON.stringify(rows, null, 2);
  if (rows.length === 0) return '(0 rows)';

  const shown = rows.slice(0, limit);
  const cols = [...new Set(shown.flatMap((r) => Object.keys(r ?? {})))];
  if (!cols.length) return JSON.stringify(rows, null, 2);

  const cell = (v) =>
    v == null ? 'NULL' : typeof v === 'string' ? v.replace(/\s+/g, ' ') : JSON.stringify(v);

  const widths = cols.map((c) =>
    Math.min(46, Math.max(displayWidth(c), ...shown.map((r) => displayWidth(cell(r?.[c]))))),
  );

  return [
    cols.map((c, i) => fit(c, widths[i])).join('  '),
    widths.map((w) => '─'.repeat(w)).join('  '),
    ...shown.map((r) => cols.map((c, i) => fit(cell(r?.[c]), widths[i])).join('  ')),
    rows.length > shown.length
      ? `… ${rows.length - shown.length} more rows`
      : `(${rows.length} row${rows.length === 1 ? '' : 's'})`,
  ].join('\n');
}

export async function cmdMsg(flags) {
  const [, type, ...rest] = flags._;
  if (!type) throw new Error('Usage: devtap msg <TYPE> [payloadJson]');
  const payload = rest.length ? JSON.parse(rest.join(' ')) : undefined;

  const { extId, roots } = await discover(flags.port);
  const page = pickMessenger(roots);

  const reply = await inExtensionWorld(page, extId, (session, contextId) =>
    sendExtensionMessage(session, contextId, payload === undefined ? { type } : { type, payload }),
  );

  emit(JSON.stringify(reply, null, 2), { out: flags.out, quiet: flags.quiet, label: 'msg' });
}

export async function cmdState(flags) {
  const { roots } = await discover(flags.port);
  const bg = pickBackground(roots);
  const session = await attach(bg.target);
  try {
    const raw = await evaluate(session, BACKGROUND_PROBE);
    emit(JSON.stringify(JSON.parse(raw), null, 2), {
      out: flags.out,
      quiet: flags.quiet,
      label: 'state',
    });
  } finally {
    session.close();
  }
}

/**
 * Everything at once, on disk.
 *
 * The point is one artifact answering "what was the extension doing when this
 * broke": which contexts were alive, what each of them last said, what the
 * database holds, and what the persisted state was.
 */
export async function cmdSnapshot(flags) {
  const out = resolve(flags.out || `${DEFAULT_LOG_DIR}/snapshot.txt`);
  const { extId, roots } = await discover(flags.port);
  const opened = await openAll(roots);
  const sections = [];

  const section = (title, body) => sections.push(`\n===== ${title} =====\n${body}`);

  try {
    section(
      `CONTEXTS (extension ${extId})`,
      [
        ...sortForReading(opened.nodes).map(
          (n) => `${n.label.padEnd(11)} ${n.ctx.padEnd(8)} ${n.url}`,
        ),
        ...absentNotes(opened.nodes),
      ].join('\n'),
    );

    const bg = opened.nodes.find((n) => n.ctx === CTX.BG);
    if (bg) {
      try {
        section(
          'BACKGROUND STATE',
          JSON.stringify(JSON.parse(await evaluate(bg.session, BACKGROUND_PROBE)), null, 2),
        );
      } catch (err) {
        section('BACKGROUND STATE', `failed: ${err.message}`);
      }
    } else {
      section('BACKGROUND STATE', 'service worker asleep');
    }

    const page = roots.find((r) => r.ctx === CTX.PAGE);
    if (page) {
      try {
        const counts = await inExtensionWorld(page, extId, async (session, contextId) => {
          const tables = await runSql(
            session,
            contextId,
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%_fts%' ORDER BY name",
          );
          const lines = [];
          for (const { name } of tables) {
            try {
              const [row] = await runSql(session, contextId, `SELECT COUNT(*) AS n FROM "${name}"`);
              lines.push(`${name.padEnd(22)} ${row.n}`);
            } catch (err) {
              lines.push(`${name.padEnd(22)} ERROR ${err.message}`);
            }
          }
          return lines.join('\n');
        });
        section('DATABASE (row counts)', counts);
      } catch (err) {
        section('DATABASE (row counts)', `failed: ${err.message}`);
      }
    }

    // Drained exactly once. `Runtime.enable` replays the console buffer on the
    // first call only, so a second `collect()` over the same sessions would come
    // back empty — both views have to be derived from one pass.
    const drained = await collect(sortForReading(opened.nodes), {
      limit: Number(flags.limit ?? 400),
    });

    const errLimit = Number(flags.errlimit ?? 80);
    const problems = drained.entries
      .filter((e) => e.level === 'error' || e.level === 'warning' || e.level === 'warn')
      .slice(-errLimit);

    section(
      'WARNINGS & ERRORS',
      problems.map((e) => formatEntry(e, { showStack: true })).join('\n') || '(none)',
    );
    section(
      `RECENT LOGS (last ${drained.entries.length}` +
        `${drained.dropped ? `, dropped ${drained.dropped} older` : ''})`,
      drained.entries.map((e) => formatEntry(e)).join('\n'),
    );

    emit(sections.join('\n'), { out, quiet: flags.quiet, label: 'snapshot' });
  } finally {
    opened.close();
  }
}
