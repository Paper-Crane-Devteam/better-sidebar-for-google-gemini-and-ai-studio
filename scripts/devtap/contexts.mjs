/**
 * Turning CDP targets into the six places this extension actually runs.
 *
 * The names Chrome reports are not the names the codebase uses: the background
 * service worker is a `service_worker`, the offscreen document is a
 * `background_page`, and the SQLite worker is not offered as a usable target at
 * all — `/json/list` shows a `worker` entry with an empty url that accepts CDP
 * messages and answers none of them. The workers are reachable only by
 * auto-attaching from the offscreen document that owns them, which is why opening
 * sessions lives here rather than at each call site.
 */

import { attach, listTargets } from './cdp.mjs';

/** Short labels used throughout the output, so `--ctx bg,off` is typeable. */
export const CTX = {
  BG: 'bg', // background service worker
  OFF: 'off', // offscreen document
  DBW: 'dbw', // SQLite worker (child of off)
  DOCW: 'docw', // document parsing worker (child of off)
  WORKER: 'worker', // any other extension worker
  PAGE: 'page', // aistudio / gemini tab
  EXTPAGE: 'extpage', // popup / onboarding / permissions
};

const PAGE_ALIASES = {
  'gemini.google.com': 'gem',
  'aistudio.google.com': 'ais',
};

/** Reading order: the page first, then inward toward storage. */
const READING_ORDER = [
  CTX.PAGE,
  CTX.EXTPAGE,
  CTX.BG,
  CTX.OFF,
  CTX.DBW,
  CTX.DOCW,
  CTX.WORKER,
];

export function sortForReading(nodes) {
  return [...nodes].sort(
    (a, b) => READING_ORDER.indexOf(a.ctx) - READING_ORDER.indexOf(b.ctx),
  );
}

/**
 * Discover the extension id from the targets themselves.
 *
 * Hardcoding it would rot: `wxt.config.ts` pins a `key` so the id is stable for
 * this project, but the same script should work in a checkout that dropped it.
 */
function findExtensionId(targets) {
  for (const t of targets) {
    const m = /^chrome-extension:\/\/([a-p]{32})\//.exec(t.url || '');
    if (m) return m[1];
  }
  return null;
}

function pageLabel(url) {
  try {
    const host = new URL(url).hostname;
    return PAGE_ALIASES[host] || host.replace(/^www\./, '');
  } catch {
    return 'page';
  }
}

function labelWorker(url) {
  const file = (url.split('/').pop() || '').replace(/\.js$/, '');
  if (file.includes('db-worker')) return { ctx: CTX.DBW, label: CTX.DBW };
  if (file.includes('doc')) return { ctx: CTX.DOCW, label: CTX.DOCW };
  return { ctx: CTX.WORKER, label: file || CTX.WORKER };
}

/**
 * Root targets belonging to this extension, plus the host pages it runs in.
 *
 * Nameless `worker` targets are deliberately ignored: they are unusable, and the
 * real workers arrive later via {@link openAll}.
 */
export async function discover(port) {
  const targets = await listTargets(port);
  const extId = findExtensionId(targets);
  if (!extId) {
    throw new Error(
      'No chrome-extension:// target found. Is the extension loaded in the dev browser?',
    );
  }

  const roots = [];
  for (const t of targets) {
    const url = t.url || '';

    if (t.type === 'service_worker' && url.includes(extId)) {
      roots.push({ ctx: CTX.BG, label: CTX.BG, target: t, url });
    } else if (t.type === 'background_page' && url.includes(extId)) {
      // Offscreen documents report as `background_page`. Chrome allows exactly
      // one, and it hosts both the SQLite worker and the document engine.
      roots.push({ ctx: CTX.OFF, label: CTX.OFF, target: t, url });
    } else if (t.type === 'page' && url.startsWith(`chrome-extension://${extId}/`)) {
      const file = url.split('/').pop()?.replace(/\.html.*$/, '') || 'extpage';
      roots.push({ ctx: CTX.EXTPAGE, label: file, target: t, url });
    } else if (t.type === 'page' && /^https:\/\/(aistudio|gemini)\.google\.com\//.test(url)) {
      // Host pages carry the content script, the overlay UI and the main-world
      // interceptors — three worlds, one target.
      roots.push({ ctx: CTX.PAGE, label: pageLabel(url), target: t, url });
    }
  }

  return { extId, roots };
}

/**
 * Open a session per context, expanding the offscreen document into its workers.
 *
 * Returns nodes that each carry a live `session`; call the returned `close()` when
 * done. The background shows up as a child of the offscreen document too (Chrome
 * reports every extension target under it), so children are deduped against the
 * roots by url.
 */
export async function openAll(roots, { includeWorkers = true } = {}) {
  const nodes = [];
  const failures = [];
  const closers = [];

  const settled = await Promise.allSettled(
    roots.map(async (r) => ({ root: r, session: await attach(r.target) })),
  );

  for (const [i, res] of settled.entries()) {
    if (res.status === 'rejected') {
      failures.push(`${roots[i].label}: ${res.reason?.message ?? res.reason}`);
      continue;
    }
    const { root, session } = res.value;
    nodes.push({ ...root, session });
    closers.push(() => session.close());
  }

  if (includeWorkers) {
    const off = nodes.find((n) => n.ctx === CTX.OFF);
    if (off) {
      const seen = new Set(nodes.map((n) => n.url));
      for (const child of await off.session.children()) {
        const url = child.info?.url || '';
        if (child.info?.type !== 'worker' || seen.has(url)) continue;
        seen.add(url);
        nodes.push({ ...labelWorker(url), url, session: child, parent: CTX.OFF });
      }
    }
  }

  return {
    nodes,
    failures,
    close: () => closers.forEach((fn) => fn()),
  };
}

/** `--ctx bg,gem` → keep only those. Matches the ctx kind or the label. */
export function filterContexts(nodes, spec) {
  if (!spec) return nodes;
  const wanted = spec
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return nodes.filter(
    (n) => wanted.includes(n.ctx) || wanted.includes(String(n.label).toLowerCase()),
  );
}

export function pickBackground(roots) {
  const bg = roots.find((r) => r.ctx === CTX.BG);
  if (!bg) {
    throw new Error(
      'Background service worker is not running (Chrome stops it after ~30s idle). ' +
        'Open or reload a Gemini / AI Studio tab to wake it, then retry.',
    );
  }
  return bg;
}

/**
 * A context that can talk to the extension's message bus.
 *
 * The background cannot `sendMessage` to itself, so anything that goes through
 * `handleMessage` (SQL, for instance) has to be issued from a content script's
 * isolated world instead.
 */
export function pickMessenger(roots) {
  const page =
    roots.find((r) => r.ctx === CTX.PAGE) || roots.find((r) => r.ctx === CTX.EXTPAGE);
  if (!page) {
    throw new Error(
      'No Gemini / AI Studio tab open. Extension messages have to be sent from a ' +
        'context that has the content script, so open one and retry.',
    );
  }
  return page;
}
