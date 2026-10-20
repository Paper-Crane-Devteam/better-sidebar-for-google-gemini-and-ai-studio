/**
 * The Web Agent side panel: Gemini in an iframe, a toolbar, and a port that says the panel
 * is open.
 *
 * Deliberately thin. Everything that thinks runs inside the iframe (our content scripts in
 * panel mode) or in the background. This page only has to:
 *
 * 1. get this window's session token and put it in the iframe's URL hash — the iframe has no
 *    `sender.tab`, so the token is how the background knows which window it belongs to;
 * 2. hold a port open, because its disconnect is the only reliable "panel closed" signal;
 * 3. remount the iframe when a new task arrives while the panel is already open. Remount, not
 *    re-navigate: a hash-only change would not reload Gemini, and every task gets a fresh chat
 *    (design §2);
 * 4. nudge the iframe when extra context (a right-clicked page, tabs from the toolbar) is
 *    waiting, so it joins the chat already there instead of replacing it.
 *
 * See `.kiro/docs/web-agent-technical-design.md`.
 */

import { WEB_PANEL_PORT, PANEL_HASH_PARAM, PANEL_NUDGE } from '@/shared/web-agent/contracts';

const GEMINI_ORIGIN = 'https://gemini.google.com';
const GEMINI_APP = `${GEMINI_ORIGIN}/app`;

/** `chrome.i18n` with `$1`… substitutions, and an English fallback using the same slots. */
const msg = (key: string, fallback: string, ...subs: (string | number)[]) => {
  const s = subs.map(String);
  return chrome.i18n.getMessage(key, s) || s.reduce((t, v, i) => t.replace(`$${i + 1}`, v), fallback);
};

function mount(token: string) {
  document.querySelector('iframe')?.remove();
  const frame = document.createElement('iframe');
  frame.allow = 'clipboard-read; clipboard-write; microphone';
  frame.src = `${GEMINI_APP}#${PANEL_HASH_PARAM}=${encodeURIComponent(token)}`;
  document.body.appendChild(frame);
}

/** Tell the iframe a handoff is waiting. Targeted at Gemini's origin, so nothing else hears it. */
function nudge() {
  document.querySelector('iframe')?.contentWindow?.postMessage({ type: PANEL_NUDGE }, GEMINI_ORIGIN);
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;
function showStatus(text: string) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

function initToolbar(windowId: number) {
  const add = async (which: 'active' | 'all') => {
    if (which === 'all') {
      const count = (await chrome.tabs.query({ windowId })).length;
      const ok = confirm(msg('webAgentAddAllConfirm', 'Let the Web Agent operate every tab in this window? ($1 tabs)', count));
      if (!ok) return;
    }
    const res = await chrome.runtime.sendMessage({ type: 'WEB_AGENT', payload: { action: 'add-tabs', windowId, which } });
    if (!res?.success) { showStatus(res?.error ?? 'Failed'); return; }
    const { added, skipped } = res.data as { added: number; skipped: number };
    if (added) nudge();
    showStatus(added
      ? msg('webAgentTabsAdded', '$1 added, $2 skipped', added, skipped)
      : msg('webAgentNoTabAdded', 'This page cannot be operated by the Web Agent'));
  };

  const activeBtn = document.getElementById('add-active') as HTMLButtonElement;
  const allBtn = document.getElementById('add-all') as HTMLButtonElement;
  activeBtn.textContent = msg('webAgentAddActive', '+ Current tab');
  allBtn.textContent = msg('webAgentAddAll', '+ All tabs');
  activeBtn.addEventListener('click', () => void add('active'));
  allBtn.addEventListener('click', () => void add('all'));
}

async function main() {
  const { id: windowId } = await chrome.windows.getCurrent();
  if (windowId === undefined) return;
  initToolbar(windowId);

  const connect = () => {
    const port = chrome.runtime.connect({ name: WEB_PANEL_PORT });
    port.postMessage({ windowId });
    port.onMessage.addListener((m: { type?: string; token?: string }) => {
      if (m.type === 'load' && m.token) mount(m.token);
      else if (m.type === 'nudge') nudge();
    });
    // The worker restarted. The panel is still open, so say so again.
    port.onDisconnect.addListener(() => setTimeout(connect, 500));
  };
  connect();

  const res = await chrome.runtime.sendMessage({ type: 'WEB_AGENT', payload: { action: 'panel-ready', windowId } });
  if (res?.success) mount(res.data.token);
  else document.body.textContent = res?.error ?? 'Web Agent is unavailable.';
}

void main();
