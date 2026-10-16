/**
 * `devtap gsend "<text>"` — type a message into Gemini and send it.
 *
 * For reproducing capture bugs without asking a human to type: pair it with
 * `net start` / `net dump` and `logs --grep 'Captured turn'`. Runs in the page's main
 * world; Gemini's input is a Quill editor inside `<rich-textarea>`, which only notices
 * text that arrives through `execCommand('insertText')` (assigning textContent leaves
 * the send button disabled).
 *
 *   gsend "hello"                send in the current chat
 *   gsend "hello" --new          open a new chat first (navigates to /app, keeps /u/N)
 *   gsend "hello" --wait 60      wait up to N s for the reply to finish (default 90)
 *   --page <substr>              pick the tab, as with eval
 */

import { CTX, discover, filterContexts, openAll } from './contexts.mjs';
import { evaluate } from './cdp.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEND = (text) => `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let editor;
  for (let i = 0; i < 50 && !editor; i++) {
    editor = document.querySelector('rich-textarea .ql-editor, rich-textarea [contenteditable="true"]');
    if (!editor) await sleep(200);
  }
  if (!editor) return { ok: false, error: 'input not found' };
  editor.focus();
  document.execCommand('selectAll', false);
  document.execCommand('insertText', false, ${JSON.stringify(text)});
  // Scope to the input area: the page has other "Send…" buttons (feedback, share).
  let scope = editor;
  for (let i = 0; i < 6 && scope.parentElement; i++) scope = scope.parentElement;
  let btn;
  for (let i = 0; i < 25; i++) {
    btn = scope.querySelector('.send-button button:not([disabled]), button.send-button:not([disabled]), button[aria-label="Send message"]:not([disabled]), button[aria-label*="发送"]:not([disabled])');
    if (btn && btn.getAttribute('aria-disabled') !== 'true') break;
    btn = null;
    await sleep(200);
  }
  if (!btn) return { ok: false, error: 'send button not found or disabled' };
  const before = document.querySelectorAll('model-response').length;
  btn.click();
  return { ok: true, before, url: location.href };
})()`;

const STATUS = `(() => ({
  url: location.href,
  responses: document.querySelectorAll('model-response').length,
  busy: !!document.querySelector('button.send-button.stop, button[aria-label*="Stop" i], button[aria-label*="停止"]'),
}))()`;

const NEW_CHAT = `(() => {
  const m = location.pathname.match(/^\\/u\\/\\d+/);
  const target = (m ? m[0] : '') + '/app';
  const link = document.querySelector('a[href$="' + target + '"], side-nav-action-button[data-test-id="new-chat-button"] a, [data-test-id="new-chat-button"] a, [data-test-id="new-chat-button"] button');
  if (link) { link.click(); return 'clicked new chat'; }
  history.pushState({}, '', target); dispatchEvent(new PopStateEvent('popstate'));
  return 'navigated ' + target;
})()`;

export async function cmdGsend(flags) {
  const text = flags._.slice(1).join(' ');
  if (!text) throw new Error('Usage: devtap gsend "<text>" [--new] [--wait 90] [--page <substr>]');

  const { roots } = await discover(flags.port);
  const opened = await openAll(roots);
  try {
    let nodes = filterContexts(opened.nodes, 'gem').filter((n) => n.ctx === CTX.PAGE);
    if (flags.page) {
      const want = String(flags.page).toLowerCase();
      nodes = nodes.filter((n) => String(n.url ?? '').toLowerCase().includes(want));
    }
    const node = nodes[0];
    if (!node) throw new Error('No Gemini tab' + (flags.page ? ` matching --page ${flags.page}` : ''));

    if (flags.new) {
      process.stdout.write(`${await evaluate(node.session, NEW_CHAT)}\n`);
      await sleep(1500);
    }

    const sent = await evaluate(node.session, SEND(text), { timeoutMs: 20000 });
    process.stdout.write(`send: ${JSON.stringify(sent)}\n`);
    if (!sent?.ok) return;

    const waitMs = Number(flags.wait ?? 90) * 1000;
    const start = Date.now();
    let sawBusy = false;
    let last;
    while (Date.now() - start < waitMs) {
      await sleep(1000);
      last = await evaluate(node.session, STATUS);
      if (last.busy) sawBusy = true;
      // Done when a new response exists and the stop button is gone.
      if (last.responses > sent.before && !last.busy && (sawBusy || Date.now() - start > 4000)) break;
    }
    // Give interceptors a moment to finish writing after the stream closes.
    await sleep(1500);
    process.stdout.write(`done: ${JSON.stringify(last)} after ${Math.round((Date.now() - start) / 1000)}s\n`);
  } finally {
    opened.close();
  }
}
