/**
 * `devtap net` — capture a host page's own network traffic, with bodies, and decode it.
 *
 * Exists because the question "did Gemini change its API?" keeps coming back and every
 * time it was answered with a one-off probe pasted into `eval`. The things that made
 * those probes hard to get right are solved once here:
 *
 * - **Under ajax-hook.** The extension replaces `window.XMLHttpRequest` with a proxy, so
 *   the probe patches the *native* prototype behind it (`__origin_xhr`). That sees
 *   every XHR, whether or not the extension's own proxy forwards it.
 * - **Aborted streams.** WebChannel (`processSession`) aborts its back channel when a
 *   turn ends, which resets `responseText` to ''. The probe keeps the longest text it
 *   saw during `progress`, so the body survives.
 * - **fetch too.** Since 2026-10 Gemini's `batchexecute` goes through `fetch`, which
 *   ajax-hook never sees. The probe wraps `window.fetch` and clones each response.
 * - **Decoding.** `dump` splits batchexecute frames into `rpcid → inner JSON` and
 *   renders protobuf (base64 WebChannel payloads) as dotted field paths.
 *
 * Lives in the page's main world (`eval gem` lands there). Nothing persists: a reload
 * drops it, which is the point.
 */

import { CTX, discover, filterContexts, openAll } from './contexts.mjs';
import { evaluate } from './cdp.mjs';
import { emit } from './args.mjs';
import { b64ToBuffer, dumpProto } from './proto.mjs';

const PROBE_VERSION = 4;

/** Runs in the page. Idempotent; reinstalling keeps the buffer. */
const INSTALL = String.raw`(() => {
  const V = ${PROBE_VERSION};
  const g = window;
  if (g.__devtapNet && g.__devtapNet.v === V) return 'already installed (' + g.__devtapNet.log.length + ' entries)';
  const net = g.__devtapNet || { log: [], seq: 0 };
  net.v = V;
  net.on = true;
  g.__devtapNet = net;
  const SKIP = /\.(js|css|png|svg|woff2?|jpe?g|webp|gif|ico)(\?|$)|play\.google\.com\/log|google-analytics|doubleclick|googleadservices|googletagmanager|\/measurement\/|\/ccm\/|gstatic\.com|ogads-pa|signaler-pa|waa-pa/;
  const MAX_TEXT = 3_000_000, MAX_LOG = 400;
  const bodyText = (b) => {
    if (b == null) return '';
    if (typeof b === 'string') return b;
    if (b instanceof URLSearchParams) return b.toString();
    if (b instanceof FormData) return '[FormData]';
    if (b instanceof Blob) return '[Blob ' + b.size + 'B]';
    if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return '[binary ' + (b.byteLength) + 'B]';
    return String(b);
  };
  const record = (e) => {
    e.id = ++net.seq; e.t = Date.now();
    net.log.push(e);
    if (net.log.length > MAX_LOG) net.log.splice(0, net.log.length - MAX_LOG);
    return e;
  };

  // XHR: patch the native prototype, beneath ajax-hook's proxy if present.
  const probe = new XMLHttpRequest();
  const nativeXhr = probe.__origin_xhr || probe;
  const P = Object.getPrototypeOf(nativeXhr);
  if (!P.__devtapOpen) { P.__devtapOpen = P.open; P.__devtapSend = P.send; }
  P.open = function (method, url) {
    this.__devtapReq = { method: String(method || 'GET').toUpperCase(), url: String(url) };
    return P.__devtapOpen.apply(this, arguments);
  };
  P.send = function (body) {
    const r = this.__devtapReq;
    if (net.on && r && !SKIP.test(r.url)) {
      const e = record({ kind: 'xhr', method: r.method, url: r.url, req: bodyText(body).slice(0, MAX_TEXT), res: '', status: 0, done: false });
      const grab = () => {
        try {
          if (this.responseType && this.responseType !== 'text') { e.res = '[' + this.responseType + ']'; }
          else { const t = this.responseText; if (t && t.length > e.res.length) e.res = t.slice(0, MAX_TEXT); }
          if (this.status) e.status = this.status;
        } catch (err) { e.err = String(err); }
      };
      this.addEventListener('progress', grab);
      this.addEventListener('readystatechange', grab);
      this.addEventListener('loadend', () => { grab(); e.done = true; });
      this.addEventListener('abort', () => { e.aborted = true; });
    }
    return P.__devtapSend.apply(this, arguments);
  };

  // fetch: wrap whatever is installed now (the extension's wrapper included).
  if (!g.__devtapFetch) g.__devtapFetch = g.fetch;
  const inner = g.__devtapFetch;
  g.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input && input.url) || '';
    const watch = net.on && !SKIP.test(url);
    // Gemini passes a Request object, so the body is on the input, not init. Clone it
    // before fetch consumes it.
    let reqClone = null;
    if (watch && !(init && init.body != null) && typeof Request !== 'undefined' && input instanceof Request) {
      try { reqClone = input.clone(); } catch {}
    }
    const p = inner.apply(this, arguments);
    if (watch) {
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const e = record({ kind: 'fetch', method, url, req: bodyText(init && init.body).slice(0, MAX_TEXT), res: '', status: 0, done: false });
      if (reqClone) reqClone.text().then((t) => { e.req = t.slice(0, MAX_TEXT); }).catch(() => {});
      p.then((res) => { e.status = res.status; return res.clone().text(); })
        .then((t) => { e.res = t.slice(0, MAX_TEXT); e.done = true; })
        .catch((err) => { e.err = String(err); e.done = true; });
    }
    return p;
  };
  return 'installed v' + V;
})()`;

const STOP = `(() => {
  const g = window, net = g.__devtapNet;
  if (!net) return 'not installed';
  net.on = false;
  return 'paused (' + net.log.length + ' entries kept; "net start" resumes, "net clear" empties)';
})()`;

const CLEAR = `(() => { const n = window.__devtapNet; if (!n) return 'not installed'; const k = n.log.length; n.log = []; return 'cleared ' + k; })()`;

const READ = (sinceId) =>
  `JSON.stringify((window.__devtapNet?.log || []).filter(e => e.id > ${Number(sinceId) || 0}))`;

/** One page context, honouring `--page` like `eval` does. */
async function withPage(flags, ctxName, fn) {
  const { roots } = await discover(flags.port);
  const opened = await openAll(roots);
  try {
    let nodes = filterContexts(opened.nodes, ctxName || 'gem').filter((n) => n.ctx === CTX.PAGE);
    if (flags.page) {
      const want = String(flags.page).toLowerCase();
      nodes = nodes.filter(
        (n) =>
          String(n.url ?? '').toLowerCase().includes(want) ||
          String(n.target?.targetId ?? n.target?.id ?? '').toLowerCase().startsWith(want),
      );
    }
    if (!nodes.length) throw new Error(`No page context "${ctxName || 'gem'}"${flags.page ? ` matching --page ${flags.page}` : ''}`);
    if (nodes.length > 1 && !flags.page && !flags.all) {
      process.stderr.write(
        `devtap: ${nodes.length} matching tabs, using ${nodes[0].url}. Pass --page <substr> to choose, --all for every tab.\n`,
      );
    }
    const targets = flags.all ? nodes : [nodes[0]];
    const results = [];
    for (const node of targets) results.push(await fn(node));
    return results;
  } finally {
    opened.close();
  }
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    const rpc = u.searchParams.get('rpcids');
    const rid = u.searchParams.get('RID');
    return `${u.host}${u.pathname}${rpc ? ` rpcids=${rpc}` : ''}${rid ? ` RID=${rid}` : ''}`;
  } catch {
    return url.slice(0, 160);
  }
}

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

function clip(s, n) {
  return s.length > n ? `${s.slice(0, n)}…(+${s.length - n})` : s;
}

/** Splits a `)]}'` + length-prefixed body into its top-level JSON frames by bracket depth. */
export function splitFrames(text) {
  const frames = [];
  let depth = 0, inStr = false, esc = false, start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') { if (depth === 0) start = i; depth++; }
    else if (ch === ']' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        try { frames.push(JSON.parse(text.slice(start, i + 1))); } catch { /* partial */ }
        start = -1;
      }
    }
  }
  return frames;
}

function decodeBatchRequest(body, maxval) {
  const lines = [];
  try {
    const params = new URLSearchParams(body);
    const freq = params.get('f.req');
    if (!freq) return [`  req ${clip(body, maxval)}`];
    const outer = JSON.parse(freq);
    for (const call of outer?.[0] ?? []) {
      let inner = call?.[1];
      try { inner = JSON.stringify(JSON.parse(inner)); } catch { /* keep */ }
      lines.push(`  → ${call?.[0]} ${clip(String(inner), maxval)}`);
    }
  } catch {
    lines.push(`  req ${clip(body, maxval)}`);
  }
  return lines;
}

function decodeBatchResponse(text, maxval) {
  const lines = [];
  for (const frame of splitFrames(text)) {
    for (const row of Array.isArray(frame) ? frame : []) {
      if (!Array.isArray(row)) continue;
      if (row[0] === 'wrb.fr') {
        let inner = row[2];
        if (typeof inner === 'string') {
          try { inner = JSON.stringify(JSON.parse(inner)); } catch { /* keep */ }
        }
        lines.push(`  ← ${row[1]} ${inner == null ? `(null; ${JSON.stringify(row.slice(3))})` : clip(String(inner), maxval)}`);
      } else if (row[0] === 'er') {
        lines.push(`  ← ERROR ${JSON.stringify(row)}`);
      }
    }
  }
  return lines.length ? lines : [`  res ${clip(text, maxval)}`];
}

function decodeWebChannelUp(body, maxStr) {
  const lines = [];
  const params = new URLSearchParams(body);
  for (const [k, v] of params) {
    if (!/^req\d+___data__$/.test(k)) continue;
    lines.push(`  → ${k}`);
    lines.push(...dumpProto(b64ToBuffer(v), { maxStr, indent: '      ' }));
  }
  return lines.length ? lines : [`  req ${clip(body, 400)}`];
}

function decodeWebChannelDown(text, maxStr) {
  const lines = [];
  for (const frame of splitFrames(text)) {
    for (const row of Array.isArray(frame) ? frame : []) {
      const payload = Array.isArray(row) && Array.isArray(row[1]) ? row[1][0] : undefined;
      if (typeof payload === 'string' && payload.length > 4 && /^[A-Za-z0-9+/=_-]+$/.test(payload)) {
        lines.push(`  ← frame ${row[0]} (${payload.length} b64)`);
        lines.push(...dumpProto(b64ToBuffer(payload), { maxStr, indent: '      ' }));
      } else {
        lines.push(`  ← ${clip(JSON.stringify(row), 200)}`);
      }
    }
  }
  return lines;
}

function decodeEntry(e, { maxval, maxStr }) {
  const head = `#${e.id} ${new Date(e.t).toISOString().slice(11, 23)} ${e.kind} ${e.method} ${e.status || '-'}` +
    `${e.aborted ? ' aborted' : ''}${e.done ? '' : ' pending'} ${shortUrl(e.url)}  req=${e.req.length} res=${e.res.length}`;
  const lines = [head, `  url ${e.url}`];
  if (/batchexecute/.test(e.url)) {
    if (e.req) lines.push(...decodeBatchRequest(e.req, maxval));
    if (e.res) lines.push(...decodeBatchResponse(e.res, maxval));
  } else if (/processSession/.test(e.url)) {
    if (e.req && e.req.includes('___data__')) lines.push(...decodeWebChannelUp(e.req, maxStr));
    else if (e.req) lines.push(`  req ${clip(e.req, 200)}`);
    if (/RID=rpc/.test(e.url)) lines.push(...decodeWebChannelDown(e.res, maxStr));
    else if (e.res) lines.push(`  res ${clip(e.res.replace(/\n/g, ' '), 200)}`);
  } else {
    if (e.req) lines.push(`  req ${clip(e.req, maxval)}`);
    if (e.res) lines.push(`  res ${clip(e.res, maxval)}`);
  }
  if (e.err) lines.push(`  err ${e.err}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 *   net start [ctx]          install / resume capture (default ctx gem)
 *   net reload [ctx]         reload the tab with the probe in place from the first byte
 *                            (page-load traffic)  --wait 10
 *   net stop  [ctx]          pause (buffer kept)
 *   net clear [ctx]          empty the buffer
 *   net list  [ctx]          one line per request  (--grep on url)
 *   net dump  [ctx]          decoded bodies → .kiro/devlog/net.txt
 *                            --grep <re> (url)  --id <n[,m]>  --since-id <n>  --maxval 1500
 */
export async function cmdNet(flags) {
  const [, sub = 'list', ctxName] = flags._;
  const run = (expr) => withPage(flags, ctxName, (node) => evaluate(node.session, expr));

  if (sub === 'start') return void process.stdout.write((await run(INSTALL)).join('\n') + '\n');

  // Page-load traffic happens before `start` could ever run, so register the probe for
  // the next document, reload, and stay attached while it loads: the registration lives
  // only as long as this CDP session. The buffer then survives for list / dump.
  if (sub === 'reload') {
    const waitMs = Number(flags.wait ?? 10) * 1000;
    const out = await withPage(flags, ctxName, async (node) => {
      await node.session.send('Page.enable');
      const { identifier } = await node.session.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTALL });
      await node.session.send('Page.reload', {});
      await new Promise((r) => setTimeout(r, waitMs));
      await node.session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
      return evaluate(node.session, `(window.__devtapNet?.log.length ?? 0) + ' requests captured since load'`);
    });
    process.stdout.write(out.join('\n') + '\n');
    return;
  }
  if (sub === 'stop') return void process.stdout.write((await run(STOP)).join('\n') + '\n');
  if (sub === 'clear') return void process.stdout.write((await run(CLEAR)).join('\n') + '\n');

  if (sub !== 'list' && sub !== 'dump') throw new Error(`Unknown "net ${sub}". Use start | reload | stop | clear | list | dump.`);

  const raw = await run(READ(flags['since-id']));
  let entries = raw.flatMap((r) => JSON.parse(r || '[]'));
  if (flags.grep) {
    const re = new RegExp(flags.grep, 'i');
    entries = entries.filter((e) => re.test(e.url));
  }
  if (flags.id) {
    const ids = new Set(String(flags.id).split(',').map(Number));
    entries = entries.filter((e) => ids.has(e.id));
  }
  if (!entries.length) {
    process.stdout.write('(no captured requests — did you run `net start` before reproducing?)\n');
    return;
  }

  if (sub === 'list') {
    const limit = Number(flags.limit ?? 200);
    const text = entries.slice(-limit).map((e) =>
      `#${String(e.id).padEnd(4)} ${new Date(e.t).toISOString().slice(11, 19)} ${e.kind.padEnd(5)} ${e.method.padEnd(4)} ${String(e.status || '-').padEnd(3)}` +
      `${e.aborted ? ' ab' : '   '} req=${String(e.req.length).padEnd(6)} res=${String(e.res.length).padEnd(7)} ${shortUrl(e.url)}`,
    ).join('\n');
    emit(text, { out: flags.out, quiet: flags.quiet, label: 'net' });
    return;
  }

  const opts = { maxval: Number(flags.maxval ?? 1500), maxStr: Number(flags.maxstr ?? 300) };
  const text = entries.map((e) => decodeEntry(e, opts)).join('\n\n');
  const out = flags.out === undefined ? '.kiro/devlog/net.txt' : flags.out || null;
  emit(text, { out, quiet: flags.quiet, label: 'net dump' });
}
