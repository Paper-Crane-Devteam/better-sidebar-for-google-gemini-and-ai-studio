/**
 * Manual "rebuild everything and reload" for `npm run dev`.
 *
 * WXT's own watcher sometimes misses edits (several files saved in quick
 * succession — see patches/wxt+*.patch for the debounce bug), and even when it
 * does reload, the content scripts already running in open Gemini / AI Studio
 * tabs are orphaned until the tab is reloaded. This gives three ways to force a
 * clean state:
 *
 *   - type `r` + Enter in the terminal running `npm run dev`
 *   - `npm run devtap reload` (what the AI should use)
 *   - `curl -X POST http://localhost:3000/__dev/reload`
 *
 * Each one rebuilds every entrypoint, reloads the extension, then reloads the
 * host tabs through the dev browser's CDP port (9222, see wxt.config.ts).
 *
 * Wired up in wxt.config.ts through `hooks` + a Vite plugin. Needs the patched
 * WXT that exposes `server.forceReload()`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CDP_PORT = 9222;
const HOST_TAB = /^https:\/\/(aistudio|gemini)\.google\.com\//;
const ENDPOINT = '/__dev/reload';
/** Read by `devtap reload` to find the dev server when it is not on :3000. */
const INFO_FILE = path.resolve(process.cwd(), '.wxt/dev-server.json');

/**
 * Kept on globalThis: WXT re-imports wxt.config.ts (and so this file) on every
 * config reload, and the Vite middleware / stdin listener registered by an
 * earlier copy must still see the current server.
 * @type {{ server: any, running: Promise<object> | null, stdin: boolean }}
 */
const state = (globalThis.__bsDevReload ??= { server: null, running: null, stdin: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Send Page.reload to every Gemini / AI Studio tab in the dev browser. */
export async function reloadHostTabs(port = CDP_PORT) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`).catch(() => null);
  if (!res) return { reloaded: 0, note: `no CDP endpoint on :${port}` };
  /** @type {any[]} */
  const targets = await res.json();
  const tabs = targets.filter((t) => t.type === 'page' && HOST_TAB.test(t.url || ''));
  await Promise.all(
    tabs.map(
      (t) =>
        new Promise((resolve) => {
          const ws = new WebSocket(t.webSocketDebuggerUrl);
          const done = () => {
            try {
              ws.close();
            } catch {
              /* already closed */
            }
            resolve(undefined);
          };
          const timer = setTimeout(done, 3000);
          ws.addEventListener('open', () =>
            ws.send(JSON.stringify({ id: 1, method: 'Page.reload', params: {} })),
          );
          ws.addEventListener('message', () => {
            clearTimeout(timer);
            done();
          });
          ws.addEventListener('error', () => {
            clearTimeout(timer);
            done();
          });
        }),
    ),
  );
  return { reloaded: tabs.length };
}

/**
 * Rebuild + reload extension + reload host tabs. Concurrent calls share one run.
 * @param {{ tabs?: boolean }} [opts]
 */
export function reloadAll({ tabs = true } = {}) {
  if (state.running) return state.running;
  state.running = (async () => {
    if (!state.server?.forceReload) {
      throw new Error(
        'server.forceReload is missing — the WXT patch is not applied (run `npx patch-package`) ' +
          'or the initial build has not finished yet.',
      );
    }
    const started = Date.now();
    await state.server.forceReload();
    let tabResult = { reloaded: 0, note: 'skipped' };
    if (tabs) {
      // Give the new service worker a moment to come up so the content scripts
      // that load with the tab can reach it.
      await sleep(1500);
      tabResult = await reloadHostTabs();
    }
    const result = { ok: true, ms: Date.now() - started, tabs: tabResult };
    console.log(`[dev-reload] done in ${result.ms}ms, reloaded ${tabResult.reloaded} tab(s)`);
    return result;
  })().finally(() => {
    state.running = null;
  });
  return state.running;
}

/** `r` + Enter in the dev terminal. WXT's own `o` shortcut keeps working. */
function listenToStdin() {
  if (state.stdin) return;
  state.stdin = true;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (String(chunk).trim() !== 'r') return;
    reloadAll().catch((err) => console.error('[dev-reload] failed:', err?.message ?? err));
  });
  process.stdin.resume();
}

export const devReload = {
  /** WXT hooks. Spread into `hooks` in wxt.config.ts. */
  hooks: {
    /** @param {any} _wxt @param {any} server */
    'server:started': (_wxt, server) => {
      const first = !state.stdin;
      state.server = server;
      try {
        mkdirSync(path.dirname(INFO_FILE), { recursive: true });
        writeFileSync(INFO_FILE, JSON.stringify({ origin: server.origin, endpoint: ENDPOINT }));
      } catch {
        /* devtap falls back to :3000 */
      }
      // `server:started` fires again when WXT restarts itself on a config change.
      listenToStdin();
      if (first) {
        console.log('[dev-reload] type `r` + Enter (or `npm run devtap reload`) to rebuild and reload');
      }
    },
  },

  /** Vite plugin that serves POST /__dev/reload on the dev server. */
  vitePlugin() {
    return {
      name: 'better-sidebar:dev-reload',
      apply: /** @type {'serve'} */ ('serve'),
      /** @param {any} vite */
      configureServer(vite) {
        vite.middlewares.use(ENDPOINT, (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('POST only');
            return;
          }
          const tabs = !/[?&]tabs=0\b/.test(req.url || '');
          reloadAll({ tabs }).then(
            (result) => {
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify(result));
            },
            (err) => {
              res.statusCode = 500;
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
            },
          );
        });
      },
    };
  },
};
