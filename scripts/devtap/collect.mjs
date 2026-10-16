/**
 * Console collection across every extension context, merged into one timeline.
 *
 * Three things make this more than "print console.log":
 *
 * 1. **History comes for free.** Chrome buffers roughly the last 1000 console
 *    messages per target and replays them when `Runtime.enable` arrives. So a
 *    one-shot attach sees what happened *before* the script ran — which is the
 *    whole point, since the interesting failure has usually already happened.
 *
 * 2. **Object arguments are recoverable.** `consoleAPICalled` hands objects over
 *    as bare `objectId` handles with no preview, so `console.log('[DB Query]',
 *    sql, bind)` arrives as `Array(2)` and the bind values are lost.
 *    `callFunctionOn` against that handle gets them back, and it works on
 *    replayed history too as long as the execution context is still alive.
 *
 * 3. **Page logs get a world.** The content script, the overlay UI and the
 *    main-world interceptors all log into the same tab. `executionContextId`
 *    separates them, which is the difference between `gem/ext` and `gem/main`.
 */

import { CTX } from './contexts.mjs';

const LEVEL_RANK = {
  debug: 10,
  verbose: 10,
  log: 20,
  info: 20,
  warning: 30,
  warn: 30,
  error: 40,
};

const LEVEL_TAG = {
  debug: 'DBG',
  verbose: 'DBG',
  log: 'LOG',
  info: 'INF',
  warning: 'WRN',
  warn: 'WRN',
  error: 'ERR',
};

/** Serializer injected into the target to flatten one object argument. */
const STRINGIFY_FN = `function (maxLen) {
  var seen = new WeakSet();
  try {
    var out = JSON.stringify(this, function (k, v) {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      if (typeof v === 'bigint') return String(v) + 'n';
      if (typeof v === 'function') return '[fn ' + (v.name || 'anonymous') + ']';
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      return v;
    });
    if (out === undefined) return String(this);
    return out.length > maxLen ? out.slice(0, maxLen) + '\u2026(+' + (out.length - maxLen) + ')' : out;
  } catch (e) {
    try { return String(this); } catch (_) { return '[unserializable]'; }
  }
}`;

export function argToText(arg) {
  if (arg == null) return 'undefined';
  if ('value' in arg) return typeof arg.value === 'string' ? arg.value : JSON.stringify(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  if (arg.type === 'undefined') return 'undefined';
  return arg.description || arg.type;
}

/**
 * One entry, one line, bounded length.
 *
 * The bound applies to plain string arguments as well as hydrated objects, which
 * is not fussiness: this codebase logs whole agent tool-call payloads and whole
 * file bodies, and a single one of those is tens of thousands of characters. Left
 * unclipped, one log line buries the fifty around it that give it meaning.
 */
export function clipPart(value, maxValueLen) {
  const s = typeof value === 'string' ? value : String(value);
  // Newlines would break the one-line-per-entry contract the output relies on,
  // and multi-line SQL is logged constantly here.
  const flat = s.replace(/\s*\n\s*/g, ' ⏎ ');
  return flat.length > maxValueLen
    ? `${flat.slice(0, maxValueLen)}…(+${flat.length - maxValueLen})`
    : flat;
}

function clipParts(entry, maxValueLen) {
  entry.parts = (entry.parts || []).map((p) => clipPart(p, maxValueLen));
}

function worldOf(execContext) {
  if (execContext.origin?.startsWith('chrome-extension://')) return 'ext';
  if (execContext.auxData?.isDefault) return 'main';
  // Our own CDP tooling injects a world of its own; it never says anything useful.
  if (execContext.name?.includes('puppeteer')) return null;
  return 'iso';
}

/**
 * Browser-generated log entries worth keeping by default.
 *
 * `Log.entryAdded` is a mixed bag. Failed requests and CSP violations belong in a
 * debugging timeline; Google's own preload and deprecation warnings on the host
 * page do not, and there are enough of them to bury everything else. `worker` is
 * excluded outright — those are the SQLite worker's own console lines, which the
 * worker's session already reports, so keeping them would print each one twice.
 */
// `security` is Gemini's own CSP violations: dozens per page load, never ours.
const NOISY_LOG_SOURCES = new Set(['worker', 'javascript', 'rendering', 'deprecation', 'other', 'security']);

function keepBrowserLog(entry, includeNoise) {
  if (entry.source === 'worker') return false;
  if (includeNoise) return true;
  if (entry.level === 'error') return true;
  return !NOISY_LOG_SOURCES.has(entry.source);
}

/**
 * Subscribe one node and start its console flowing.
 *
 * Returns a `drain(quietMs, maxMs)` that resolves once the replay burst has gone
 * quiet — a better stopping rule than a fixed wait, since history arrives all at
 * once and an idle context would otherwise cost the full budget.
 */
function tap(node, sink, { includeNoise = false } = {}) {
  const worlds = new Map();
  let lastEvent = Date.now();
  const touch = () => {
    lastEvent = Date.now();
  };

  node.session.on((msg) => {
    switch (msg.method) {
      case 'Runtime.executionContextCreated': {
        const world = worldOf(msg.params.context);
        if (world) worlds.set(msg.params.context.id, world);
        return;
      }
      case 'Runtime.consoleAPICalled': {
        touch();
        const p = msg.params;
        sink({
          ts: p.timestamp,
          level: p.type,
          ctxId: p.executionContextId,
          args: p.args,
          stack: p.stackTrace,
          node,
          worlds,
        });
        return;
      }
      // Uncaught throws and unhandled rejections. Currently invisible: nothing in
      // the codebase logs them, and the service worker has no window to surface
      // them on.
      case 'Runtime.exceptionThrown': {
        touch();
        const d = msg.params.exceptionDetails;
        sink({
          ts: msg.params.timestamp,
          level: 'error',
          ctxId: d.executionContextId,
          pre: 'UNCAUGHT',
          args: [{ value: d.exception?.description || d.text || 'unknown exception' }],
          stack: d.stackTrace,
          node,
          worlds,
        });
        return;
      }
      // Network, security and deprecation entries the console shows but the
      // console API never produced — a failed request to Google's endpoints, for
      // instance.
      case 'Log.entryAdded': {
        const e = msg.params.entry;
        if (!keepBrowserLog(e, includeNoise)) return;
        touch();
        sink({
          ts: e.timestamp,
          level: e.level,
          pre: e.source?.toUpperCase(),
          args: [{ value: e.text }, ...(e.url ? [{ value: e.url }] : [])],
          node,
          worlds,
        });
        return;
      }
      default:
    }
  });

  node.session.post('Runtime.enable');
  node.session.post('Log.enable');

  return (quietMs, maxMs) => {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (Date.now() - lastEvent >= quietMs || Date.now() - startedAt >= maxMs) {
          clearInterval(timer);
          resolve();
        }
      }, 60);
    });
  };
}

/**
 * Fetch the real values behind object handles.
 *
 * Bounded twice over — a cap on how many handles get resolved and a cap on how
 * long each result may be — because one round trip per argument against a chatty
 * context is exactly the cost this tool exists to avoid paying.
 */
async function hydrate(entries, maxValueLen, budget) {
  let spent = 0;
  const jobs = [];

  for (const e of entries) {
    e.parts = [];
    for (const arg of e.args || []) {
      if (!arg.objectId || spent >= budget) {
        e.parts.push(argToText(arg));
        continue;
      }
      spent++;
      const slot = e.parts.length;
      e.parts.push(arg.description || arg.type);
      jobs.push(
        e.node.session
          .send('Runtime.callFunctionOn', {
            objectId: arg.objectId,
            functionDeclaration: STRINGIFY_FN,
            arguments: [{ value: maxValueLen }],
            returnByValue: true,
          })
          .then((r) => {
            const v = r?.result?.value;
            if (typeof v === 'string') e.parts[slot] = v;
          })
          // A released handle or a torn-down context is normal for old history;
          // the description already in the slot stays.
          .catch(() => {}),
      );
    }
  }

  await Promise.all(jobs);
  return spent;
}

/**
 * Drain every node's console into one timeline sorted by wall clock.
 *
 * Filtering happens *before* hydration on purpose: a `--grep` that keeps 12 of
 * 4000 entries should cost 12 round trips, not 4000.
 */
export async function collect(nodes, opts = {}) {
  const {
    quietMs = 400,
    maxMs = 4000,
    minLevel = null,
    grep = null,
    since = null,
    limit = 300,
    maxValueLen = 400,
    hydrateBudget = 600,
    hydrateObjects = true,
    includeNoise = false,
  } = opts;

  let all = [];
  const drains = nodes.map((n) => tap(n, (entry) => all.push(entry), { includeNoise }));
  await Promise.all(drains.map((drain) => drain(quietMs, maxMs)));

  all.sort((a, b) => a.ts - b.ts);

  if (since != null) {
    const cutoff = Date.now() - since;
    all = all.filter((e) => e.ts >= cutoff);
  }

  if (minLevel) {
    const floor = LEVEL_RANK[minLevel] ?? 0;
    all = all.filter((e) => (LEVEL_RANK[e.level] ?? 20) >= floor);
  }

  // Matched against unhydrated text: enough for `[DB Query]` or `AgentLoop`, and
  // it is what makes the cheap-filter-then-hydrate order possible.
  if (grep) {
    const re = new RegExp(grep, 'i');
    all = all.filter(
      (e) => re.test((e.args || []).map(argToText).join(' ')) || re.test(e.node.label),
    );
  }

  // Newest wins when truncating: the tail is what you are looking at.
  const dropped = Math.max(0, all.length - limit);
  if (dropped) all = all.slice(-limit);

  let hydrated = 0;
  if (hydrateObjects) hydrated = await hydrate(all, maxValueLen, hydrateBudget);
  else for (const e of all) e.parts = (e.args || []).map(argToText);

  for (const e of all) clipParts(e, maxValueLen);

  return { entries: all, dropped, hydrated };
}

const pad = (s, n) => String(s).padEnd(n);

/**
 * Where a line came from, e.g. `gem/main` or `bg`.
 *
 * The world suffix is only added for host pages, because they are the only
 * context that has more than one: the content script, the overlay UI and the
 * main-world interceptors all log into the same tab, and telling them apart is
 * often the whole question. Everywhere else there is exactly one world and the
 * suffix would just be noise.
 */
export function locate(entry) {
  if (entry.node.ctx !== CTX.PAGE) return entry.node.label;
  const world = entry.ctxId != null ? entry.worlds?.get(entry.ctxId) : undefined;
  return world ? `${entry.node.label}/${world}` : entry.node.label;
}

export function formatEntry(e, { showStack = false } = {}) {
  const t = new Date(e.ts).toISOString().slice(11, 23);
  const lvl = LEVEL_TAG[e.level] || e.level.slice(0, 3).toUpperCase();
  const body = [e.pre ? `<${e.pre}>` : null, ...(e.parts || [])].filter(Boolean).join(' ');
  let line = `${t} ${pad(locate(e), 10)} ${lvl} ${body}`;

  if (showStack && e.stack?.callFrames?.length) {
    line +=
      '\n' +
      e.stack.callFrames
        .slice(0, 4)
        .map(
          (f) =>
            `      at ${f.functionName || '<anon>'} (${(f.url || '').split('/').pop()}:${f.lineNumber + 1})`,
        )
        .join('\n');
  }
  return line;
}

export function toNdjson(e) {
  return JSON.stringify({
    ts: new Date(e.ts).toISOString(),
    ctx: locate(e),
    level: e.level,
    text: (e.parts || []).join(' '),
  });
}
