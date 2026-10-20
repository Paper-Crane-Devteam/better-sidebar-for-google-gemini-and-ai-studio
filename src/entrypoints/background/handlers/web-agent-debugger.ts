/**
 * Where the Web Agent's `chrome.debugger` calls go.
 *
 * - **builtin**: this build has `debugger` in its own manifest. Dev builds only — see the
 *   comment in `wxt.config.ts`.
 * - **connector**: everything else. The calls go to Better Sidebar Web Agent Connector, a
 *   separate extension that holds the permission (`shared/web-agent/connector-protocol.ts`).
 *
 * `web-agent.ts` only ever talks to {@link dbg}, so the tools do not know which one it is.
 */

import {
  CONNECTOR_EXTENSION_ID, CONNECTOR_TAG, MIN_CONNECTOR_PROTOCOL,
  type ConnectorEvent, type ConnectorHello, type ConnectorRequest, type ConnectorResponse,
  type ConnectorTarget,
} from '@/shared/web-agent/connector-protocol';
import type { WebDebuggerState } from '@/shared/web-agent/contracts';

type Detached = (tabId: number, reason: string) => void;

interface DebuggerBackend {
  state(): Promise<WebDebuggerState>;
  getTargets(): Promise<ConnectorTarget[]>;
  attach(tabId: number): Promise<void>;
  detach(tabId: number): Promise<void>;
  send<T>(tabId: number, method: string, params?: object): Promise<T>;
}

// ─── Builtin ─────────────────────────────────────────────────────────────────

const builtin: DebuggerBackend = {
  state: async () => 'builtin',
  getTargets: async () => (await chrome.debugger.getTargets())
    .filter(t => t.type === 'page' && t.tabId !== undefined)
    .map(t => ({ tabId: t.tabId!, url: t.url, title: t.title, faviconUrl: t.faviconUrl ?? '', attached: t.attached })),
  attach: async (tabId) => {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (e) {
      // Survived a worker restart: Chrome still has us attached, our Set forgot.
      if (!String((e as Error)?.message).includes('Already attached')) throw e;
    }
  },
  detach: async (tabId) => { await chrome.debugger.detach({ tabId }).catch(() => {}); },
  send: (tabId, method, params) => chrome.debugger.sendCommand({ tabId }, method, params) as Promise<any>,
};

// ─── Connector ───────────────────────────────────────────────────────────────

/** What Chrome says when nothing with that id is installed (or it is disabled). */
const isMissing = (e: unknown) => /Could not establish connection|Receiving end does not exist/i.test(String((e as Error)?.message ?? e));

type Op = ConnectorRequest extends infer R ? (R extends unknown ? Omit<R, 'tag'> : never) : never;

async function call<T>(req: Op): Promise<T> {
  let res: ConnectorResponse<T> | undefined;
  try {
    res = await chrome.runtime.sendMessage(CONNECTOR_EXTENSION_ID, { ...req, tag: CONNECTOR_TAG });
  } catch (e) {
    if (isMissing(e)) throw new Error('Better Sidebar Web Agent Connector is not installed or is turned off. Open the Web Agent risk notice to set it up.');
    throw e;
  }
  if (!res) throw new Error('The Web Agent Connector did not answer.');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

const connector: DebuggerBackend = {
  state: async () => {
    try {
      const hello = await call<ConnectorHello>({ op: 'hello' });
      if (hello.protocol < MIN_CONNECTOR_PROTOCOL) return 'outdated';
      return hello.paused ? 'paused' : 'ok';
    } catch {
      return 'missing';
    }
  },
  getTargets: () => call<ConnectorTarget[]>({ op: 'getTargets' }),
  attach: (tabId) => call<void>({ op: 'attach', tabId }),
  detach: (tabId) => call<void>({ op: 'detach', tabId }).catch(() => {}),
  send: <T>(tabId: number, method: string, params?: object) => call<T>({ op: 'send', tabId, method, params }),
};

// ─── Wiring ──────────────────────────────────────────────────────────────────

/** Read per call: `chrome.debugger` is there or not for the life of the build. */
export const dbg = (): DebuggerBackend => (chrome.debugger ? builtin : connector);

let hooked = false;

/**
 * Report sessions that ended without us asking — the user's Cancel on Chrome's bar, a tab
 * closed, the Connector's own "Disconnect all". Also answers the Connector popup's ping.
 */
export function hookDebuggerEvents(onDetached: Detached, onConnectorInstalled: () => void) {
  if (hooked) return;
  hooked = true;
  chrome.debugger?.onDetach.addListener((source, reason) => {
    if (source.tabId !== undefined) onDetached(source.tabId, reason);
  });
  chrome.runtime.onMessageExternal.addListener((msg: ConnectorEvent, sender, sendResponse) => {
    if (sender.id !== CONNECTOR_EXTENSION_ID || msg?.tag !== CONNECTOR_TAG) return;
    if (msg.event === 'detached') onDetached(msg.tabId, msg.reason);
    if (msg.event === 'installed') onConnectorInstalled();
    sendResponse({ ok: true });
  });
}
