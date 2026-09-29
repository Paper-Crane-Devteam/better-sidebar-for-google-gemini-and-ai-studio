// Temporary: send one BROWSER_AGENT request from the Gemini tab in a given window type.
//   node scripts/.tmp-ba-probe.mjs <normal|popup> '<payload json>'
import { discover } from './devtap/contexts.mjs';
import { sendExtensionMessage } from './devtap/probe.mjs';
import { attach } from './devtap/cdp.mjs';

const [which, payload] = process.argv.slice(2);
const { extId, roots } = await discover(9222);

/** Every extension-origin world in a page; the top frame's content script is one of them. */
async function worlds(page) {
  const session = await attach(page.target);
  const found = [];
  session.on(m => { if (m.method === 'Runtime.executionContextCreated') found.push(m.params.context); });
  await session.send('Runtime.enable');
  await new Promise(r => setTimeout(r, 800));
  return { session, ids: found.filter(c => c.origin === `chrome-extension://${extId}`).map(c => c.id) };
}
for (const page of roots.filter(r => r.ctx === 'page')) {
  const { session, ids } = await worlds(page);
  for (const id of ids) {
    const send = p => sendExtensionMessage(session, id, { type: 'BROWSER_AGENT', payload: p });
    const who = await send({ action: 'read', tool: 'browser_list_tabs', params: { limit: '100', window_id: 'all' } }).catch(() => undefined);
    const legacy = who?.success ? who : await send({ action: 'read', tool: 'browser_list_tabs', params: { limit: '100' } }).catch(() => undefined);
    if (!legacy?.success) continue;
    const self = legacy.data.items.find(t => t.protected);
    const type = self && roots && (await (async () => {
      const bg = await attach(roots.find(r => r.ctx === 'bg').target);
      const { evaluate } = await import('./devtap/cdp.mjs');
      const t = await evaluate(bg, `chrome.windows.get(${self.window_id}).then(w=>w.type)`);
      bg.close();
      return t;
    })());
    if (type !== which) break;
    console.log(JSON.stringify(await send(JSON.parse(payload)), null, 1));
    process.exit(0);
  }
  session.close();
}
throw new Error('host tab not matched');
