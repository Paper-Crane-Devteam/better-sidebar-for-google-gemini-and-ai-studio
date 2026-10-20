/**
 * Web Agent, background side: the side panel, the handoff, and `chrome.debugger`.
 *
 * Design: `.kiro/docs/web-agent-technical-design.md`. POC scope — see §15 there for what
 * this cut leaves out (the Agent tab group, the sensitive-page rule, AI Studio in the panel).
 *
 * ## Who is who
 *
 * - The **source tab** is a normal Gemini / AI Studio tab. It only ever sends `handoff`.
 * - The **panel page** (`web-agent-panel.html`) is ours. It holds a port and an iframe.
 * - The **panel iframe** is Gemini, running our content scripts in panel mode. It has no
 *   `sender.tab` (a side panel is not a tab), so it identifies itself with the session token
 *   the panel page put in its URL hash.
 * - **Target tabs** are the pages being operated on. Only tabs in the panel's scope.
 *
 * ⚠️ `sidePanel.open` needs a user gesture, and the gesture does not survive an `await`.
 * Every path that opens the panel calls it synchronously, first, before touching storage.
 */

import type { MessageSender } from '../types';
import {
  WEB_CONSENT_KEY, WEB_CONSENT_VERSION, WEB_PANEL_PORT,
  isWebTool,
  type WebAgentRequest, type WebAgentStatus, type WebConsent, type WebHandoff,
} from '@/shared/web-agent/contracts';

const GEMINI_ORIGINS = ['https://gemini.google.com', 'https://aistudio.google.com'];
const PANEL_URL = () => chrome.runtime.getURL('web-agent-panel.html');
const CONSENT_URL = () => chrome.runtime.getURL('web-agent-consent.html');
const MENU_ID = 'bs-web-agent';
const FRAME_RULE_ID = 9101;
/** A handoff nobody claimed in this long is stale — the user went and did something else. */
const HANDOFF_TTL = 5 * 60 * 1000;
/** Per tool result. The round budget is ~30k for everything (`handoff/budget.ts`). */
const RESULT_CAP = 12000;

// ─── State ───────────────────────────────────────────────────────────────────

/**
 * Pending handoffs by window. In memory on purpose: it is written and read within seconds,
 * while the worker is busy with exactly this, and the panel page asks for it immediately.
 */
const pending = new Map<number, WebHandoff>();
const panelPorts = new Map<number, chrome.runtime.Port>();
const busy = new Set<string>();
const attached = new Set<number>();
/** Tokens whose user pressed "Cancel" on the debugging bar. Their task is over. */
const stopped = new Set<string>();

/**
 * Token ↔ window, and token → scope. In `storage.session` because tool calls arrive minutes
 * apart and the worker can be restarted between any two of them.
 */
interface Persisted { tokens: Record<string, number>; scope: Record<string, number[]> }
const SESSION_KEY = 'web-agent-state';
let state: Persisted | null = null;
async function load(): Promise<Persisted> {
  if (!state) state = ((await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as Persisted | undefined) ?? { tokens: {}, scope: {} };
  return state;
}
async function save() { if (state) await chrome.storage.session.set({ [SESSION_KEY]: state }); }
const tokenFor = (s: Persisted, windowId: number) => Object.keys(s.tokens).find(t => s.tokens[t] === windowId);

async function addToScope(windowId: number, tabId: number) {
  const s = await load();
  const token = tokenFor(s, windowId) ?? newToken(s, windowId);
  const list = s.scope[token] ?? [];
  if (!list.includes(tabId)) s.scope[token] = [...list, tabId];
  await save();
}
function newToken(s: Persisted, windowId: number): string {
  const token = crypto.randomUUID();
  s.tokens[token] = windowId;
  s.scope[token] = [];
  return token;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

/**
 * Open the panel and leave a handoff for it. Synchronous up to `sidePanel.open`.
 *
 * ⚠️ The handoff is written *before* the open call, so a panel that loads fast cannot ask
 * for it before it exists.
 */
function openPanelWith(windowId: number, handoff: WebHandoff): Promise<void> {
  pending.set(windowId, handoff);
  console.log('[probe:web] openPanelWith', { windowId, handoff, hasPort: panelPorts.has(windowId) }); // [probe]
  const opening = chrome.sidePanel.open({ windowId });
  // An open panel never sends `panel-ready` again, so tell it to start a fresh chat.
  const port = panelPorts.get(windowId);
  if (port) void load().then(s => port.postMessage({ type: 'load', token: tokenFor(s, windowId) ?? '' }));
  return opening;
}

/** `chrome.contextMenus` entry point (entry 2). A real click, so the gesture holds. */
function onMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  if (info.menuItemId !== MENU_ID || tab?.id === undefined || tab.windowId === undefined) return;
  const selection = info.selectionText?.trim();
  void openPanelWith(tab.windowId, {
    userInput: selection ? `Selected text on the page:\n"""\n${selection.slice(0, 4000)}\n"""\n` : '',
    autoSend: false,
    createdAt: Date.now(),
  }).catch(e => console.warn('[WebAgent] side panel did not open', e));
  // The page the user right-clicked on is the one they mean.
  const url = tab.url ?? info.pageUrl ?? '';
  if (!GEMINI_ORIGINS.some(o => url.startsWith(o))) void addToScope(tab.windowId, tab.id);
}

/**
 * Let Gemini be framed by the panel, and nowhere else.
 *
 * `tabIds: [TAB_ID_NONE]` is the whole restriction: a side panel is not a tab, so its
 * requests carry -1, while every Gemini tab the user opens keeps its real headers. Session
 * rules are the only kind that accept `tabIds`. ⚠️ This removes Gemini's CSP in the panel
 * frame entirely — dNR can drop a header, not edit one directive of it.
 */
async function installFrameRule() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [FRAME_RULE_ID],
    addRules: [{
      id: FRAME_RULE_ID,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        responseHeaders: [
          { header: 'x-frame-options', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
          { header: 'content-security-policy', operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE },
        ],
      },
      condition: {
        requestDomains: ['gemini.google.com'],
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.SUB_FRAME],
        tabIds: [chrome.tabs.TAB_ID_NONE],
      },
    }],
  });
}

/** Wire listeners. Called once from the background entry. Chrome only. */
export function initWebAgent() {
  if (import.meta.env.BROWSER !== 'chrome' || !chrome.sidePanel) return;
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  installFrameRule().catch(e => console.error('[WebAgent] frame rule failed', e));

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: MENU_ID,
        title: chrome.i18n.getMessage('webAgentMenu') || 'Let Web Agent work on this page',
        contexts: ['page', 'selection'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
      });
    });
  });
  chrome.contextMenus.onClicked.addListener(onMenuClick);

  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== WEB_PANEL_PORT || port.sender?.url?.split('#')[0] !== PANEL_URL()) return;
    let windowId: number | undefined;
    port.onMessage.addListener((msg: { windowId?: number }) => {
      if (typeof msg.windowId === 'number') { windowId = msg.windowId; panelPorts.set(windowId, port); }
    });
    // The panel closed, or reloaded. Either way the task it hosted is over.
    port.onDisconnect.addListener(() => {
      if (windowId === undefined || panelPorts.get(windowId) !== port) return;
      panelPorts.delete(windowId);
      void endPanelSession(windowId);
    });
  });

  // `chrome.debugger` only exists once the optional permission is granted.
  hookDebugger();
  chrome.permissions.onAdded.addListener(hookDebugger);
  chrome.tabs.onRemoved.addListener(async tabId => {
    attached.delete(tabId);
    const s = await load();
    let changed = false;
    for (const token of Object.keys(s.scope)) {
      if (s.scope[token].includes(tabId)) { s.scope[token] = s.scope[token].filter(t => t !== tabId); changed = true; }
    }
    if (changed) await save();
  });
}

let debuggerHooked = false;
function hookDebugger() {
  if (debuggerHooked || !chrome.debugger) return;
  debuggerHooked = true;
  chrome.debugger.onDetach.addListener(async (source, reason) => {
    if (source.tabId === undefined) return;
    attached.delete(source.tabId);
    // The "Cancel" button on Chrome's debugging bar. The user's way of saying stop.
    if (reason === 'canceled_by_user') {
      const s = await load();
      for (const [token, tabs] of Object.entries(s.scope)) if (tabs.includes(source.tabId)) stopped.add(token);
    }
  });
}

async function endPanelSession(windowId: number) {
  const s = await load();
  const token = tokenFor(s, windowId);
  if (!token) return;
  busy.delete(token);
  stopped.delete(token);
  for (const tabId of s.scope[token] ?? []) await detach(tabId);
  s.scope[token] = [];
  await save();
}

// ─── Consent ─────────────────────────────────────────────────────────────────

async function status(): Promise<WebAgentStatus> {
  const consent = (await chrome.storage.local.get(WEB_CONSENT_KEY))[WEB_CONSENT_KEY] as WebConsent | undefined;
  return {
    consented: !!consent && consent.version >= WEB_CONSENT_VERSION,
    permitted: await chrome.permissions.contains({ permissions: ['debugger'] }),
  };
}

async function openConsentWindow() {
  const existing = (await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] }))
    .find(w => w.tabs?.some(t => t.url === CONSENT_URL()));
  if (existing?.id !== undefined) await chrome.windows.update(existing.id, { focused: true });
  else await chrome.windows.create({ url: CONSENT_URL(), type: 'popup', width: 500, height: 680 });
}

// ─── Debugger ────────────────────────────────────────────────────────────────

const BLOCKED_HOSTS = ['gemini.google.com', 'aistudio.google.com', 'chromewebstore.google.com', 'chrome.google.com', 'accounts.google.com'];

async function targetInfo(tabId: number) {
  return (await chrome.debugger.getTargets()).find(t => t.tabId === tabId);
}

/** Refuses the pages this agent must never drive, by URL, before anything attaches. */
function refuseUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return 'This tab has no address the agent can work with.'; }
  if (!['http:', 'https:'].includes(u.protocol)) return `The agent only works on http(s) pages, not ${u.protocol} pages.`;
  if (BLOCKED_HOSTS.includes(u.hostname)) return `${u.hostname} is off limits to the Web Agent.`;
  return null;
}

async function attach(tabId: number) {
  if (attached.has(tabId)) return;
  const info = await targetInfo(tabId);
  const refused = refuseUrl(info?.url ?? '');
  if (refused) throw new Error(refused);
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
  } catch (e) {
    // Survived a worker restart: Chrome still has us attached, our Set forgot.
    if (!String((e as Error)?.message).includes('Already attached')) throw e;
  }
  attached.add(tabId);
}

async function detach(tabId: number) {
  attached.delete(tabId);
  if (!chrome.debugger) return;
  await chrome.debugger.detach({ tabId }).catch(() => {});
}

function cdp<T = any>(tabId: number, method: string, params?: object): Promise<T> {
  return chrome.debugger.sendCommand({ tabId }, method, params) as Promise<T>;
}

/** Evaluate in the page's main world and return the value, or throw what the page threw. */
async function evaluate<T = unknown>(tabId: number, expression: string): Promise<T> {
  const res = await cdp<{ result: { value?: T; description?: string }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
    tabId, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true },
  );
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
  return res.result.value as T;
}

function waitForLoad(tabId: number, timeout = 15000): Promise<void> {
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpdate); resolve(); };
    const onUpdate = (id: number, change: { status?: string }) => { if (id === tabId && change.status === 'complete') done(); };
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(onUpdate);
    chrome.tabs.get(tabId).then(t => { if (t.status === 'complete') done(); }, done);
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const clip = (text: string, max = RESULT_CAP) => text.length > max ? `${text.slice(0, max)}\n…(truncated, ${text.length - max} more characters)` : text;

// ─── Page scripts ────────────────────────────────────────────────────────────
//
// ⚠️ Plain strings, not `fn.toString()`. The bundler is free to rewrite a function body
// (helpers, renamed bindings), and whatever it emits has to run in a page we know nothing
// about. ES2017, no imports, no closures over anything here.

/**
 * The projection: visible interactive elements with a ref, and the text between them.
 *
 * Refs live in `window.__bsAgentRefs`, rebuilt on every call — so a ref is only valid until
 * the next snapshot, which is the rule the tool descriptions state. Shadow roots are walked;
 * iframes are not (POC).
 */
const SNAPSHOT_JS = String.raw`(function (maxChars) {
  var INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true],[onclick]';
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, svg: 1, SVG: 1, IFRAME: 1, HEAD: 1 };
  var refs = {}; var lines = []; var used = 0; var omitted = 0; var n = 0;
  function clip(t, m) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > m ? t.slice(0, m) + '…' : t; }
  function push(line) { if (used + line.length + 1 > maxChars) { omitted++; return; } lines.push(line); used += line.length + 1; }
  function shown(el, st) {
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }
  function describe(el, ref) {
    var tag = el.tagName.toLowerCase(); var role = el.getAttribute('role');
    var p = ['[' + ref + ']', role || tag];
    if (tag === 'input') {
      var type = (el.type || 'text').toLowerCase(); p[1] = 'input[' + type + ']';
      var lab = (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('aria-label') || '';
      if (lab) p.push('label=' + JSON.stringify(clip(lab, 80)));
      if (el.name) p.push('name=' + JSON.stringify(el.name));
      if (el.placeholder) p.push('placeholder=' + JSON.stringify(clip(el.placeholder, 80)));
      if (type === 'checkbox' || type === 'radio') p.push(el.checked ? 'checked' : 'unchecked');
      else if (type === 'password') p.push(el.value ? 'value=(hidden)' : 'empty');
      else if (el.value) p.push('value=' + JSON.stringify(clip(el.value, 120)));
    } else if (tag === 'textarea') {
      var tl = el.getAttribute('aria-label') || el.placeholder || el.name || '';
      if (tl) p.push(JSON.stringify(clip(tl, 80)));
      p.push(el.value ? 'value=' + JSON.stringify(clip(el.value, 200)) : 'empty');
    } else if (tag === 'select') {
      var opt = el.options[el.selectedIndex];
      p.push('selected=' + JSON.stringify(opt ? clip(opt.text, 80) : ''));
      p.push('options=' + JSON.stringify(Array.prototype.slice.call(el.options, 0, 20).map(function (o) { return clip(o.text, 40); })));
    } else {
      var l = el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('alt') || '';
      if (l) p.push(JSON.stringify(clip(l, 120)));
      if (tag === 'a') p.push('href=' + JSON.stringify(clip(el.getAttribute('href'), 150)));
      var checked = el.getAttribute('aria-checked') || el.getAttribute('aria-selected') || el.getAttribute('aria-expanded');
      if (checked) p.push('state=' + checked);
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') p.push('disabled');
    return p.join(' ');
  }
  function walk(el) {
    if (SKIP[el.tagName]) return;
    var st = getComputedStyle(el);
    if (st.display === 'none') return;
    if (el.matches(INTERACTIVE)) {
      if (!shown(el, st)) return;
      n++; var ref = 'e' + n; refs[ref] = el; push(describe(el, ref));
      return;
    }
    var block = st.display !== 'inline' && st.display !== 'contents';
    if (block && !el.shadowRoot && !el.querySelector(INTERACTIVE) && st.visibility !== 'hidden') {
      var text = clip(el.innerText, 500);
      if (text) { var h = /^H[1-6]$/.test(el.tagName) ? '#'.repeat(+el.tagName[1]) + ' ' : ''; push(h + text); }
      return;
    }
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { var t = clip(c.nodeValue, 300); if (t && st.visibility !== 'hidden') push(t); }
      else if (c.nodeType === 1) walk(c);
    }
    if (el.shadowRoot) for (var s = el.shadowRoot.firstElementChild; s; s = s.nextElementSibling) walk(s);
  }
  if (document.body) walk(document.body);
  window.__bsAgentRefs = refs;
  window.__bsRef = function (r) { return (window.__bsAgentRefs || {})[r] || null; };
  var head = 'Title: ' + document.title + '\nURL: ' + location.href + '\nScroll: ' + Math.round(scrollY) + ' / ' + Math.max(0, document.documentElement.scrollHeight - innerHeight) + ' px\n---';
  return head + '\n' + lines.join('\n') + (omitted ? '\n…(' + omitted + ' more lines omitted — scroll, or read a specific part with page_run_js)' : '');
})`;

/** Scroll the ref into view and say where its centre is, and whether something covers it. */
const LOCATE_JS = String.raw`(function (ref) {
  var el = (window.__bsAgentRefs || {})[ref];
  if (!el || !el.isConnected) return { error: 'stale' };
  el.scrollIntoView({ block: 'center', inline: 'center' });
  var r = el.getBoundingClientRect();
  var x = r.left + r.width / 2, y = r.top + r.height / 2;
  var top = document.elementFromPoint(x, y);
  var covered = top && top !== el && !el.contains(top) && !top.contains(el) && !(el.getRootNode() && el.getRootNode().host === top);
  return { x: x, y: y, covered: covered ? (top.tagName.toLowerCase() + (top.id ? '#' + top.id : '')) : null };
})`;

const FOCUS_JS = String.raw`(function (ref, clear) {
  var el = (window.__bsAgentRefs || {})[ref];
  if (!el || !el.isConnected) return 'stale';
  el.scrollIntoView({ block: 'center' });
  el.focus();
  if (clear) {
    if (typeof el.select === 'function') el.select();
    else if (el.isContentEditable) { var range = document.createRange(); range.selectNodeContents(el); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  }
  return document.activeElement === el || el.contains(document.activeElement) ? 'ok' : 'unfocused';
})`;

const STALE = 'ERROR: That ref is from an older snapshot, or the element is gone. Call page_snapshot again and use a fresh ref.';

// ─── Tools ───────────────────────────────────────────────────────────────────

function tabParam(params: Record<string, string>, scope: number[]): number {
  if (!params.tab_id) {
    if (scope.length === 1) return scope[0];
    throw new Error(scope.length ? 'Several tabs are in scope; pass tab_id (see page_list).' : 'No tab is in scope yet. Open one with page_open.');
  }
  const id = Number(params.tab_id);
  if (!scope.includes(id)) throw new Error(`Tab ${params.tab_id} is not in the Web Agent's scope. Use page_list to see the tabs you may work on.`);
  return id;
}

async function runTool(token: string, windowId: number, tool: string, params: Record<string, string>): Promise<string> {
  const s = await load();
  const scope = s.scope[token] ?? [];

  if (tool === 'page_list') {
    const targets = await chrome.debugger.getTargets();
    const rows = scope.map(tabId => {
      const t = targets.find(x => x.tabId === tabId);
      return { tab_id: tabId, title: t?.title ?? '', url: t?.url ?? '', attached: attached.has(tabId) };
    });
    return rows.length ? JSON.stringify(rows) : 'No tabs in scope. Open one with page_open, or ask the user to right-click a page and choose "Let Web Agent work on this page".';
  }

  if (tool === 'page_open') {
    const refused = refuseUrl(params.url ?? '');
    if (refused) throw new Error(refused);
    let tabId: number;
    if (params.tab_id) {
      tabId = tabParam(params, scope);
      await chrome.tabs.update(tabId, { url: params.url, active: true });
    } else {
      const tab = await chrome.tabs.create({ windowId, url: params.url, active: true });
      tabId = tab.id!;
      await addToScope(windowId, tabId);
    }
    await sleep(300);
    await waitForLoad(tabId);
    return `Opened tab ${tabId}: ${(await targetInfo(tabId))?.title ?? params.url}. Call page_snapshot to see it.`;
  }

  const tabId = tabParam(params, scope);
  // A hidden tab renders lazily and throttles its timers; the user should see it anyway.
  await chrome.tabs.update(tabId, { active: true });
  await attach(tabId);

  if (tool === 'page_snapshot') {
    const max = Math.min(Math.max(Number(params.max_chars) || RESULT_CAP, 2000), 20000);
    return await evaluate<string>(tabId, `${SNAPSHOT_JS}(${max})`);
  }

  if (tool === 'page_click') {
    const at = await evaluate<{ x: number; y: number; covered: string | null; error?: string }>(tabId, `${LOCATE_JS}(${JSON.stringify(params.ref)})`);
    if (at.error) return STALE;
    const base = { x: at.x, y: at.y, button: 'left' as const, clickCount: 1 };
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    await sleep(600);
    await waitForLoad(tabId, 10000);
    const info = await targetInfo(tabId);
    return `Clicked ${params.ref}${at.covered ? ` (note: ${at.covered} was on top of it, so the click may have landed there)` : ''}. Page is now: ${info?.title ?? ''} — ${info?.url ?? ''}. Refs are stale after any change; snapshot again before the next action.`;
  }

  if (tool === 'page_type') {
    const focused = await evaluate<string>(tabId, `${FOCUS_JS}(${JSON.stringify(params.ref)}, ${params.clear !== 'false'})`);
    if (focused === 'stale') return STALE;
    if (params.text) await cdp(tabId, 'Input.insertText', { text: params.text });
    if (params.submit === 'true') {
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
      await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...key });
      await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...key });
      await sleep(600);
      await waitForLoad(tabId, 10000);
    }
    return `Typed into ${params.ref}${focused === 'unfocused' ? ' (warning: the element did not take focus, check the result)' : ''}${params.submit === 'true' ? ' and pressed Enter' : ''}.`;
  }

  if (tool === 'page_run_js') {
    // The body of an async function, so `await` and `return` both work.
    const value = await evaluate<unknown>(tabId, `(async () => {\n${params.code ?? ''}\n})()`);
    if (value === undefined) return 'Done. (The script returned nothing — use `return` to read a value.)';
    return clip(typeof value === 'string' ? value : JSON.stringify(value, null, 1));
  }

  throw new Error(`Unknown Web Agent tool "${tool}".`);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function handleWebAgent(request: WebAgentRequest, sender: MessageSender) {
  try {
    if (import.meta.env.BROWSER !== 'chrome') throw new Error('Web Agent supports Chrome only.');
    if (sender.id !== chrome.runtime.id) throw new Error('Unknown sender.');
    const senderUrl = sender.url ?? '';
    const fromHostTab = !!sender.tab && GEMINI_ORIGINS.some(o => senderUrl.startsWith(o));
    const fromPanelFrame = !sender.tab && GEMINI_ORIGINS.some(o => senderUrl.startsWith(o));
    const fromPage = (page: string) => senderUrl.split('#')[0] === page;

    // ⚠️ First, and synchronous: the Enter that sent this is the only gesture we get.
    if (request.action === 'handoff') {
      if (!fromHostTab || sender.tab?.windowId === undefined) throw new Error('Handoff must come from a Gemini or AI Studio tab.');
      const windowId = sender.tab.windowId;
      const s0 = state;
      const token = s0 && tokenFor(s0, windowId);
      if (token && busy.has(token) && panelPorts.has(windowId)) {
        void chrome.sidePanel.open({ windowId }).catch(() => {});
        return { success: false, error: 'busy' };
      }
      await openPanelWith(windowId, { userInput: request.userInput.slice(0, 20000), autoSend: true, createdAt: Date.now() });
      return { success: true };
    }

    // Same gesture rule as `handoff`. An already-open panel is only focused — reloading it
    // would throw away whatever chat (or running task) it holds. A fresh one gets an empty,
    // unsent `>Web Agent` capsule so the user lands ready to type.
    if (request.action === 'open-panel') {
      if (!fromHostTab || sender.tab?.windowId === undefined) throw new Error('The side panel can only be opened from a Gemini or AI Studio tab.');
      const windowId = sender.tab.windowId;
      if (panelPorts.has(windowId)) await chrome.sidePanel.open({ windowId });
      else await openPanelWith(windowId, { userInput: '', autoSend: false, createdAt: Date.now() });
      return { success: true };
    }

    if (request.action === 'panel-ready') {
      if (!fromPage(PANEL_URL())) throw new Error('Not the panel.');
      const s = await load();
      const token = tokenFor(s, request.windowId) ?? newToken(s, request.windowId);
      await save();
      return { success: true, data: { token } };
    }

    if (request.action === 'status') return { success: true, data: await status() };

    if (request.action === 'open-consent') {
      if (!fromHostTab && !fromPanelFrame) throw new Error('Unsupported host.');
      await openConsentWindow();
      return { success: true };
    }

    if (request.action === 'accept-consent' || request.action === 'withdraw-consent') {
      if (!fromPage(CONSENT_URL())) throw new Error('Consent can only be given on the notice page.');
      if (request.action === 'accept-consent') {
        if (!(await status()).permitted) throw new Error('Chrome did not grant the debugger permission.');
        await chrome.storage.local.set({ [WEB_CONSENT_KEY]: { version: WEB_CONSENT_VERSION, acceptedAt: Date.now() } satisfies WebConsent });
      } else {
        await chrome.storage.local.remove(WEB_CONSENT_KEY);
        for (const tabId of [...attached]) await detach(tabId);
        await chrome.permissions.remove({ permissions: ['debugger'] }).catch(() => false);
      }
      return { success: true, data: await status() };
    }

    // Everything below is the panel iframe, identified by its token.
    if (!fromPanelFrame) throw new Error('Web Agent tools only run in the side panel.');
    const s = await load();
    const windowId = s.tokens[request.token];
    if (windowId === undefined) throw new Error('This side panel session has expired. Close and reopen the panel.');

    if (request.action === 'claim') {
      const handoff = pending.get(windowId);
      console.log('[probe:web] claim', { windowId, handoff, pendingKeys: [...pending.keys()] }); // [probe]
      pending.delete(windowId);
      return { success: true, data: handoff && Date.now() - handoff.createdAt < HANDOFF_TTL ? handoff : null };
    }

    if (request.action === 'report') {
      if (request.running) busy.add(request.token); else busy.delete(request.token);
      return { success: true };
    }

    if (request.action === 'tool') {
      if (!isWebTool(request.tool)) throw new Error('Unknown tool.');
      if (stopped.has(request.token)) {
        return { success: true, data: 'STOPPED: The user pressed "Cancel" on Chrome\'s debugging bar, which means stop. Do not retry; call complete_task now and say where you got to.' };
      }
      const { consented, permitted } = await status();
      if (!consented || !permitted) throw new Error('The Web Agent risk notice has not been accepted, or the debugger permission was removed.');
      try {
        return { success: true, data: await runTool(request.token, windowId, request.tool, request.params ?? {}) };
      } catch (e) {
        return { success: true, data: `ERROR: ${(e as Error)?.message ?? String(e)}` };
      }
    }

    throw new Error('Unknown Web Agent request.');
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Web Agent request failed.' };
  }
}
