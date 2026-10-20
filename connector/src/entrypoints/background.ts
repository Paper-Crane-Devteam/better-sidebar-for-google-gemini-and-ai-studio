/**
 * The Connector: `chrome.debugger` on behalf of Better Sidebar, with guardrails.
 *
 * Protocol: `src/shared/web-agent/connector-protocol.ts`. Everything that makes the Web Agent
 * an agent — tools, snapshots, scope, consent — is in the main extension. This side only:
 *
 * 1. answers Better Sidebar and nobody else (`externally_connectable` plus `sender.id`);
 * 2. refuses blocked URLs, on attach *and* before every command, because a tab can navigate
 *    somewhere off limits while attached;
 * 3. forwards only the CDP methods in the allowlist;
 * 4. lets the user see what is attached, disconnect it all, or pause (the popup).
 *
 * Stateless towards the caller on purpose: both service workers can be stopped at any time,
 * so there is no port to lose. What must survive a restart is in storage.
 */

import { defineBackground } from 'wxt/utils/define-background';
import {
  CONNECTOR_PROTOCOL, CONNECTOR_TAG, MAIN_EXTENSION_ID,
  isAllowedMethod, refuseUrl,
  type ConnectorDetachReason, type ConnectorErrorCode, type ConnectorEvent, type ConnectorHello,
  type ConnectorRequest, type ConnectorResponse, type ConnectorTarget,
} from '../../../src/shared/web-agent/connector-protocol';
import type { PopupRequest, PopupState } from './popup/messages';

const ATTACHED_KEY = 'attached';
const PAUSED_KEY = 'paused';

class Refused extends Error {
  constructor(message: string, readonly code: ConnectorErrorCode) { super(message); }
}

// ─── State ───────────────────────────────────────────────────────────────────

/** Tabs we attached. `storage.session`: gone with the browser, kept across worker restarts. */
async function attachedTabs(): Promise<number[]> {
  return ((await chrome.storage.session.get(ATTACHED_KEY))[ATTACHED_KEY] as number[] | undefined) ?? [];
}
async function setAttached(tabs: number[]) {
  await chrome.storage.session.set({ [ATTACHED_KEY]: [...new Set(tabs)] });
}
const remember = async (tabId: number) => setAttached([...(await attachedTabs()), tabId]);
const forget = async (tabId: number) => setAttached((await attachedTabs()).filter(t => t !== tabId));

/** `storage.local`: a pause outlives a browser restart, so it cannot be undone by accident. */
async function isPaused(): Promise<boolean> {
  return !!(await chrome.storage.local.get(PAUSED_KEY))[PAUSED_KEY];
}

// ─── Talking to Better Sidebar ───────────────────────────────────────────────

/** Fire and forget. Better Sidebar may be uninstalled, disabled, or simply not listening. */
function notify(event: ConnectorEvent extends infer E ? (E extends unknown ? Omit<E, 'tag'> : never) : never) {
  chrome.runtime.sendMessage(MAIN_EXTENSION_ID, { ...event, tag: CONNECTOR_TAG }).catch(() => {});
}

async function pingMain(): Promise<boolean> {
  try {
    const res = await chrome.runtime.sendMessage(MAIN_EXTENSION_ID, { tag: CONNECTOR_TAG, event: 'ping' });
    return !!res?.ok;
  } catch {
    return false;
  }
}

// ─── Debugger ────────────────────────────────────────────────────────────────

async function targets(): Promise<ConnectorTarget[]> {
  const ours = new Set(await attachedTabs());
  return (await chrome.debugger.getTargets())
    .filter(t => t.type === 'page' && t.tabId !== undefined)
    .map(t => ({
      tabId: t.tabId!,
      url: t.url,
      title: t.title,
      faviconUrl: t.faviconUrl ?? '',
      attached: ours.has(t.tabId!),
    }));
}

async function urlOf(tabId: number): Promise<string> {
  return (await chrome.debugger.getTargets()).find(t => t.tabId === tabId)?.url ?? '';
}

async function attach(tabId: number) {
  const refused = refuseUrl(await urlOf(tabId));
  if (refused) throw new Refused(refused, 'blocked-url');
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
  } catch (e) {
    // Survived a worker restart: Chrome still has us attached.
    if (!String((e as Error)?.message).includes('Already attached')) throw e;
  }
  await remember(tabId);
}

async function detach(tabId: number) {
  await chrome.debugger.detach({ tabId }).catch(() => {});
  await forget(tabId);
}

/**
 * Detach everything, and tell Better Sidebar why. A detach we ask for does not fire
 * `onDetach`, so the event is sent by hand.
 */
async function detachAll(reason: ConnectorDetachReason) {
  for (const tabId of await attachedTabs()) {
    await detach(tabId);
    notify({ event: 'detached', tabId, reason });
  }
}

async function send(tabId: number, method: string, params?: object): Promise<unknown> {
  if (!isAllowedMethod(method)) throw new Refused(`The Web Agent Connector does not forward ${method}.`, 'blocked-method');
  if (!(await attachedTabs()).includes(tabId)) throw new Refused('The Web Agent is not attached to that tab.', 'not-attached');
  // The tab may have navigated since attach. Off-limits pages are dropped, not driven.
  const refused = refuseUrl(await urlOf(tabId));
  if (refused) {
    await detach(tabId);
    notify({ event: 'detached', tabId, reason: 'blocked_url' });
    throw new Refused(refused, 'blocked-url');
  }
  if (method === 'Page.navigate') {
    const target = refuseUrl(String((params as { url?: unknown } | undefined)?.url ?? ''));
    if (target) throw new Refused(target, 'blocked-url');
  }
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

// ─── Requests ────────────────────────────────────────────────────────────────

const isTabId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

async function handle(req: ConnectorRequest): Promise<unknown> {
  if (req.op === 'hello') {
    return { protocol: CONNECTOR_PROTOCOL, version: chrome.runtime.getManifest().version, paused: await isPaused() } satisfies ConnectorHello;
  }
  if (req.op === 'getTargets') return targets();
  // Better Sidebar asked, so it already knows; no events back.
  if (req.op === 'detachAll') { for (const tabId of await attachedTabs()) await detach(tabId); return null; }
  if (!isTabId(req.tabId)) throw new Refused('Invalid tab id.', 'bad-request');
  if (req.op === 'detach') { await detach(req.tabId); return null; }
  if (await isPaused()) throw new Refused('The Web Agent Connector is paused. Turn it back on from its toolbar icon.', 'paused');
  if (req.op === 'attach') { await attach(req.tabId); return null; }
  if (req.op === 'send') {
    if (typeof req.method !== 'string') throw new Refused('Invalid method.', 'bad-request');
    return send(req.tabId, req.method, req.params);
  }
  throw new Refused('Unknown request.', 'bad-request');
}

async function handlePopup(req: PopupRequest): Promise<PopupState | null> {
  if (req.op === 'disconnect-all') await detachAll('stopped_by_user');
  if (req.op === 'set-paused') {
    await chrome.storage.local.set({ [PAUSED_KEY]: req.paused });
    if (req.paused) await detachAll('stopped_by_user');
  }
  const ours = new Set(await attachedTabs());
  return {
    mainInstalled: await pingMain(),
    paused: await isPaused(),
    tabs: (await targets()).filter(t => ours.has(t.tabId)),
  };
}

export default defineBackground(() => {
  chrome.runtime.onMessageExternal.addListener((msg: ConnectorRequest, sender, sendResponse) => {
    // Belt and braces with `externally_connectable`. Strangers get no answer at all.
    if (sender.id !== MAIN_EXTENSION_ID || msg?.tag !== CONNECTOR_TAG) return;
    handle(msg).then(
      data => sendResponse({ ok: true, data } satisfies ConnectorResponse),
      (e: unknown) => sendResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: e instanceof Refused ? e.code : undefined,
      } satisfies ConnectorResponse),
    );
    return true;
  });

  // Only our own popup sends internal messages.
  chrome.runtime.onMessage.addListener((msg: PopupRequest, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
    handlePopup(msg).then(sendResponse, () => sendResponse(null));
    return true;
  });

  // Chrome ended a session: the user's Cancel on the debugging bar, or the tab went away.
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId === undefined) return;
    const tabId = source.tabId;
    void forget(tabId).then(() => notify({ event: 'detached', tabId, reason: reason as ConnectorDetachReason }));
  });
  chrome.tabs.onRemoved.addListener(tabId => void forget(tabId));

  chrome.runtime.onInstalled.addListener(() => notify({ event: 'installed', protocol: CONNECTOR_PROTOCOL }));
});
