/**
 * The wire between Better Sidebar and **Better Sidebar Web Agent Connector**.
 *
 * Chrome will not let `debugger` be an optional permission, and adding it as a required one
 * would disable the main extension for every existing user on update (design doc §16). So
 * production builds never hold it: a separate extension does, and the main one calls it by
 * extension id. Dev builds of the main extension still carry `debugger` themselves and skip
 * the Connector entirely (see `background/handlers/web-agent-debugger.ts`).
 *
 * ⚠️ This file is compiled into **both** extensions, and the Connector is meant to be
 * published rarely. Keep it free of imports, and only ever extend the protocol in a backward
 * compatible way — bump `CONNECTOR_PROTOCOL` when you add something the main extension
 * relies on, and gate on it there with `MIN_CONNECTOR_PROTOCOL`.
 *
 * The Connector is a pipe with guardrails, nothing more: tools, snapshots, scope and consent
 * all live in the main extension. What the Connector enforces on its own — the URL rule and
 * the CDP method allowlist below — is there because it is the one holding the permission.
 */

/** Better Sidebar. Fixed by the `key` in the main `wxt.config.ts`, same in dev and store. */
export const MAIN_EXTENSION_ID = 'cjeoaidogoaekodkbhijgljhenknkenj';

/** The Connector. Fixed by the store public `key` in `connector/wxt.config.ts`, same in dev and store. */
export const CONNECTOR_EXTENSION_ID = 'dmogbaiecikhmldgdpapobncijaoeamc';

export const CONNECTOR_STORE_URL = `https://chromewebstore.google.com/detail/${CONNECTOR_EXTENSION_ID}`;
export const MAIN_STORE_URL = `https://chromewebstore.google.com/detail/${MAIN_EXTENSION_ID}`;

/** What this copy of the file speaks. */
export const CONNECTOR_PROTOCOL = 1;
/** The oldest Connector the main extension still works with. */
export const MIN_CONNECTOR_PROTOCOL = 1;

/** Tag on every message, both directions, so neither side mistakes a stray message for one. */
export const CONNECTOR_TAG = 'bs-connector';

/** A page as `chrome.debugger.getTargets` reports it, cut to what is used. */
export interface ConnectorTarget {
  tabId: number;
  url: string;
  title: string;
  faviconUrl: string;
  attached: boolean;
}

export interface ConnectorHello {
  protocol: number;
  version: string;
  /** The user paused the Connector from its popup. Every attach and command is refused. */
  paused: boolean;
}

/** Main → Connector, through `chrome.runtime.sendMessage(CONNECTOR_EXTENSION_ID, …)`. */
export type ConnectorRequest = { tag: typeof CONNECTOR_TAG } & (
  | { op: 'hello' }
  | { op: 'getTargets' }
  | { op: 'attach'; tabId: number }
  | { op: 'detach'; tabId: number }
  | { op: 'detachAll' }
  | { op: 'send'; tabId: number; method: string; params?: object }
);

export type ConnectorErrorCode = 'blocked-url' | 'blocked-method' | 'paused' | 'not-attached' | 'bad-request';

export type ConnectorResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: ConnectorErrorCode };

/**
 * Why a debugging session ended, beyond Chrome's own `onDetach` reasons.
 *
 * - `stopped_by_user`: the Connector popup's "Disconnect all" or "Pause". Means stop, same as
 *   Chrome's `canceled_by_user`.
 * - `blocked_url`: the tab navigated somewhere the Connector refuses to drive.
 */
export type ConnectorDetachReason = 'canceled_by_user' | 'target_closed' | 'stopped_by_user' | 'blocked_url';

/** The reasons that mean "the user wants this to stop". The task ends, nothing re-attaches. */
export const isUserStop = (reason: string) => reason === 'canceled_by_user' || reason === 'stopped_by_user';

/** Connector → main, through `chrome.runtime.sendMessage(MAIN_EXTENSION_ID, …)`. */
export type ConnectorEvent = { tag: typeof CONNECTOR_TAG } & (
  | { event: 'installed'; protocol: number }
  | { event: 'detached'; tabId: number; reason: ConnectorDetachReason }
  /** The popup asking whether Better Sidebar is there. Answered with `{ ok: true }`. */
  | { event: 'ping' }
);

// ─── Guardrails (both sides) ─────────────────────────────────────────────────

/** Never driven: our own hosts, the store, and Google sign-in. */
export const BLOCKED_HOSTS = [
  'gemini.google.com',
  'aistudio.google.com',
  'chromewebstore.google.com',
  'chrome.google.com',
  'accounts.google.com',
];

/** Why the agent must not drive this URL, or null when it may. */
export function refuseUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return 'This tab has no address the agent can work with.'; }
  if (!['http:', 'https:'].includes(u.protocol)) return `The agent only works on http(s) pages, not ${u.protocol} pages.`;
  if (BLOCKED_HOSTS.includes(u.hostname)) return `${u.hostname} is off limits to the Web Agent.`;
  return null;
}

/**
 * CDP domains the Connector forwards. Everything else — `Target`, `Browser`, `Storage`,
 * `Network`, `Fetch`, … — reaches past the one page, or into cookies, and is refused.
 * `Runtime.evaluate` already runs arbitrary code *in the page*; the point of this list is to
 * keep it in the page.
 */
const ALLOWED_DOMAINS = ['Runtime', 'Input', 'Page', 'DOM', 'DOMSnapshot', 'Accessibility'];

/** Inside the allowed domains, the methods that outlive the page or leave it. */
const BLOCKED_METHODS = [
  // Runs on every future navigation, including to a blocked host.
  'Page.addScriptToEvaluateOnNewDocument',
  'Page.setDownloadBehavior',
  'Page.setBypassCSP',
  'Page.setInterceptFileChooserDialog',
  'Page.setWebLifecycleState',
  'Runtime.addBinding',
];

export function isAllowedMethod(method: string): boolean {
  const domain = method.split('.')[0];
  return ALLOWED_DOMAINS.includes(domain) && !BLOCKED_METHODS.includes(method);
}
