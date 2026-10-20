/**
 * The Web Agent side panel: Gemini in an iframe, and a port that says the panel is open.
 *
 * Deliberately thin. Everything that thinks runs inside the iframe (our content scripts in
 * panel mode) or in the background. This page only has to:
 *
 * 1. get this window's session token and put it in the iframe's URL hash — the iframe has no
 *    `sender.tab`, so the token is how the background knows which window it belongs to;
 * 2. hold a port open, because its disconnect is the only reliable "panel closed" signal;
 * 3. remount the iframe when a new task arrives while the panel is already open. Remount, not
 *    re-navigate: a hash-only change would not reload Gemini, and every task gets a fresh chat
 *    (design §2).
 *
 * See `.kiro/docs/web-agent-technical-design.md`.
 */

import { WEB_PANEL_PORT, PANEL_HASH_PARAM } from '@/shared/web-agent/contracts';

const GEMINI_APP = 'https://gemini.google.com/app';

function mount(token: string) {
  document.querySelector('iframe')?.remove();
  const frame = document.createElement('iframe');
  frame.allow = 'clipboard-read; clipboard-write; microphone';
  frame.src = `${GEMINI_APP}#${PANEL_HASH_PARAM}=${encodeURIComponent(token)}`;
  document.body.appendChild(frame);
}

async function main() {
  const { id: windowId } = await chrome.windows.getCurrent();
  if (windowId === undefined) return;

  const connect = () => {
    const port = chrome.runtime.connect({ name: WEB_PANEL_PORT });
    port.postMessage({ windowId });
    port.onMessage.addListener((msg: { type?: string; token?: string }) => {
      if (msg.type === 'load' && msg.token) mount(msg.token);
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
