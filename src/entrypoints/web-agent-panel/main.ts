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
 * 4. nudge the iframe when extra context (a right-clicked selection) is waiting, so it joins
 *    the chat already there instead of replacing it;
 * 5. show which tabs the agent controls, and let the user add or drop them.
 *
 * See `.kiro/docs/web-agent-technical-design.md`.
 */

import {
  WEB_PANEL_PORT, PANEL_HASH_PARAM, PANEL_NUDGE, WEB_SESSION_KEY,
  type WebAgentRequest, type WebScopeView,
} from '@/shared/web-agent/contracts';

const GEMINI_ORIGIN = 'https://gemini.google.com';
const GEMINI_APP = `${GEMINI_ORIGIN}/app`;

/** `chrome.i18n` with `$1`… substitutions, and an English fallback using the same slots. */
const msg = (key: string, fallback: string, ...subs: (string | number)[]) => {
  const s = subs.map(String);
  return chrome.i18n.getMessage(key, s) || s.reduce((t, v, i) => t.replace(`$${i + 1}`, v), fallback);
};

async function request<T>(payload: WebAgentRequest): Promise<T> {
  const res = await chrome.runtime.sendMessage({ type: 'WEB_AGENT', payload });
  if (!res?.success) throw new Error(res?.error ?? 'Web Agent is unavailable.');
  return res.data as T;
}

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

// ─── Toolbar ─────────────────────────────────────────────────────────────────

const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };

function renderTabs(list: HTMLElement, view: WebScopeView, windowId: number, redraw: () => void) {
  list.replaceChildren();
  if (!view.tabs.length) {
    const empty = document.createElement('span');
    empty.className = 'empty';
    empty.textContent = msg('webAgentNoTabs', 'No tabs under control yet');
    list.appendChild(empty);
    return;
  }
  for (const tab of view.tabs) {
    const chip = document.createElement('div');
    chip.className = tab.active ? 'chip current' : 'chip';
    chip.setAttribute('role', 'listitem');

    // Clicking the name switches to the tab; switching does not need the `tabs` permission.
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'chip-main';
    open.title = `${tab.title}\n${tab.url}`;
    if (tab.active) open.setAttribute('aria-current', 'page');
    if (tab.favicon) {
      const icon = document.createElement('img');
      icon.src = tab.favicon;
      icon.alt = '';
      icon.onerror = () => icon.remove();
      open.appendChild(icon);
    }
    const label = document.createElement('span');
    label.textContent = tab.title || hostOf(tab.url);
    open.appendChild(label);
    open.addEventListener('click', () => void chrome.tabs.update(tab.id, { active: true }));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-remove';
    remove.textContent = '×';
    remove.title = msg('webAgentRemoveTab', 'Stop controlling this tab');
    remove.setAttribute('aria-label', `${remove.title}: ${label.textContent}`);
    remove.addEventListener('click', () => void request({ action: 'remove-tab', windowId, tabId: tab.id }).then(redraw, redraw));

    chip.append(open, remove);
    list.appendChild(chip);
  }
  // Keep the active tab in view when the list overflows.
  list.querySelector('.current')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function initToolbar(windowId: number) {
  const list = document.getElementById('tabs')!;
  const addActive = document.getElementById('add-active') as HTMLButtonElement;
  const addAll = document.getElementById('add-all') as HTMLButtonElement;
  addActive.textContent = msg('webAgentAddActive', '+ Current tab');
  addAll.textContent = msg('webAgentAddAll', '+ All tabs');

  let seq = 0;
  const redraw = async () => {
    const mine = ++seq;
    let view: WebScopeView;
    try { view = await request<WebScopeView>({ action: 'get-scope', windowId }); } catch { return; }
    if (mine !== seq) return; // A newer redraw is on its way.
    renderTabs(list, view, windowId, () => void redraw());
    const current = view.current;
    // Already under control: the chip says so, the button would be noise.
    addActive.hidden = !current || current.inScope;
    addActive.disabled = !!current?.refused;
    addActive.title = current?.refused ? msg('webAgentCurrentRefused', 'The Web Agent cannot operate this page') : '';
    const othersAddable = view.addable - (current && !current.inScope && !current.refused ? 1 : 0);
    addAll.hidden = othersAddable <= 0;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => void redraw(), 120); };

  addActive.addEventListener('click', () => void request({ action: 'add-tabs', windowId, which: 'active' }).then(soon, soon));
  addAll.addEventListener('click', async () => {
    const count = (await chrome.tabs.query({ windowId })).length;
    if (!confirm(msg('webAgentAddAllConfirm', 'Let the Web Agent operate every tab in this window? ($1 tabs)', count))) return;
    void request({ action: 'add-tabs', windowId, which: 'all' }).then(soon, soon);
  });

  // Scope changes from anywhere (right-click, `page_open`, a closed tab) land in session storage.
  chrome.storage.session.onChanged.addListener(changes => { if (WEB_SESSION_KEY in changes) soon(); });
  chrome.tabs.onActivated.addListener(info => { if (info.windowId === windowId) soon(); });
  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (tab.windowId === windowId && (change.status === 'complete' || change.title || change.favIconUrl)) soon();
  });
  chrome.tabs.onRemoved.addListener((_id, info) => { if (info.windowId === windowId) soon(); });
  chrome.tabs.onAttached.addListener(soon);
  chrome.tabs.onDetached.addListener(soon);
  void redraw();
}

// ─── Boot ────────────────────────────────────────────────────────────────────

async function main() {
  const { id: windowId } = await chrome.windows.getCurrent();
  if (windowId === undefined) return;

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

  try {
    const { token } = await request<{ token: string }>({ action: 'panel-ready', windowId });
    mount(token);
    // After `panel-ready`, so the window already has a token to hang a scope on.
    initToolbar(windowId);
  } catch (e) {
    document.body.textContent = (e as Error).message;
  }
}

void main();
