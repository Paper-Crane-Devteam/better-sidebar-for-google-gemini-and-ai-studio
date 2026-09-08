/**
 * Reaching into a running extension: SQL, extension messages, storage, state.
 *
 * All of it works without any code inside the extension, by borrowing a context
 * that already has what we need:
 *
 * - **SQL and extension messages** go through a *content script's* isolated
 *   world. The background cannot `sendMessage` to itself, so it is the wrong
 *   place to issue anything that `handleMessage` answers. A Gemini / AI Studio
 *   tab is the right place, and `EXECUTE_SQL` already exists as a message type
 *   (the agent's `execute_sql` tool rides on it).
 * - **storage and browser APIs** go through the background, where `browser.*` is
 *   fully available.
 */

import { attach, evaluate } from './cdp.mjs';

/**
 * Find the execution context id belonging to the extension's content script.
 *
 * `Runtime.enable` replays `executionContextCreated` for contexts that already
 * exist, so this does not require reloading the page. Matching on the
 * `chrome-extension://` origin is what separates the content script's world from
 * the page's own and from other tooling's isolated worlds.
 */
async function findExtensionWorld(session, extId, timeoutMs = 1500) {
  const found = [];
  session.on((msg) => {
    if (msg.method === 'Runtime.executionContextCreated') found.push(msg.params.context);
  });
  await session.send('Runtime.enable');

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = found.find((c) => c.origin === `chrome-extension://${extId}`);
    if (hit) return hit.id;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    'The content script world is not present in this tab. Reload the tab, or check ' +
      'that the platform is enabled in the extension settings.',
  );
}

/** Run `fn(session, contextId)` inside the content script's world. */
export async function inExtensionWorld(pageContext, extId, fn) {
  const session = await attach(pageContext.target);
  try {
    const contextId = await findExtensionWorld(session, extId);
    return await fn(session, contextId);
  } finally {
    session.close();
  }
}

/**
 * Send an extension message and return the reply.
 *
 * `JSON.stringify` on the way back rather than `returnByValue` on the raw reply:
 * CDP's own serialization chokes on anything with a non-plain prototype, and a
 * failure there looks like an empty result rather than an error.
 */
export async function sendExtensionMessage(session, contextId, message) {
  const literal = JSON.stringify(message);
  const raw = await evaluate(
    session,
    `(async () => {
      try {
        const reply = await browser.runtime.sendMessage(${literal});
        return JSON.stringify({ ok: true, reply: reply === undefined ? null : reply });
      } catch (err) {
        return JSON.stringify({ ok: false, error: String(err && err.message || err) });
      }
    })()`,
    { contextId },
  );
  const parsed = JSON.parse(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.reply;
}

const WRITE_STATEMENT =
  /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|PRAGMA|VACUUM|ATTACH|DETACH)\b/i;

export function isWriteSql(sql) {
  return WRITE_STATEMENT.test(sql);
}

export async function runSql(session, contextId, sql) {
  const reply = await sendExtensionMessage(session, contextId, {
    type: 'EXECUTE_SQL',
    payload: { sql },
  });
  if (!reply) throw new Error('No reply from the background (service worker may have died mid-query)');
  if (!reply.success) throw new Error(reply.error || 'EXECUTE_SQL failed');
  return reply.data;
}

/**
 * Facts about the running extension that are not in any log: which database is
 * open, whether the offscreen host is alive, what the persisted settings say.
 *
 * Everything here is read through the background's own `browser.*`, so it
 * reflects reality rather than a page's cached copy.
 */
export const BACKGROUND_PROBE = `(async () => {
  const out = { at: new Date().toISOString() };
  try { out.manifestVersion = browser.runtime.getManifest().version; } catch (e) {}
  try {
    const local = await browser.storage.local.get(null);
    out.storageKeys = Object.keys(local).sort();
    const small = {};
    for (const [k, v] of Object.entries(local)) {
      const s = (() => { try { return JSON.stringify(v); } catch (e) { return '[unserializable]'; } })();
      // Backups and exported database blobs live in here and are megabytes each.
      small[k] = s == null ? null : s.length > 600 ? '[' + s.length + ' chars] ' + s.slice(0, 200) + '…' : JSON.parse(s);
    }
    out.storage = small;
  } catch (e) { out.storageError = String(e.message || e); }
  try {
    const ctxs = await browser.runtime.getContexts({});
    out.contexts = ctxs.map(c => ({ type: c.contextType, url: (c.documentUrl || '').split('/').pop() }));
  } catch (e) { out.contextsError = String(e.message || e); }
  try {
    const alarms = await browser.alarms.getAll();
    out.alarms = alarms.map(a => ({ name: a.name, inMs: a.scheduledTime - Date.now(), period: a.periodInMinutes }));
  } catch (e) {}
  return JSON.stringify(out);
})()`;
