/**
 * Web Agent — the wire between the page, the side panel and the background.
 *
 * Design: `.kiro/docs/web-agent-technical-design.md`. This is the POC cut: the side panel
 * hosts Gemini in an iframe, the background drives target tabs through `chrome.debugger`,
 * and the scope is a per-panel list of tab ids (the "Agent" tab group comes later).
 */

/** Agent id. Wire format, like every other agent id — see `agents/types.ts`. */
export const WEB_AGENT_ID = 'web';

/** Port the side panel page holds open. Its disconnect is how we learn the panel closed. */
export const WEB_PANEL_PORT = 'web-agent-panel';

/** `storage.local` key holding the accepted risk notice. */
export const WEB_CONSENT_KEY = 'web-agent-consent';

/**
 * `storage.local` key the background touches when the Web Agent Connector announces itself,
 * so an open notice or Agent tab re-reads the status without waiting for window focus.
 */
export const WEB_CONNECTOR_SEEN_KEY = 'web-agent-connector-seen';

/**
 * Bumped when the notice changes in a way that needs agreeing to again. A stored consent
 * with an older version reads as no consent.
 */
export const WEB_CONSENT_VERSION = 1;

export interface WebConsent { version: number; acceptedAt: number }

/** Hash parameter the panel uses to hand its session token to the Gemini iframe. */
export const PANEL_HASH_PARAM = 'bs-web';
/** Where the iframe keeps that token once the hash has been stripped. */
export const PANEL_TOKEN_STORAGE_KEY = 'bs-web-agent-token';
/**
 * `postMessage` type the panel page sends its iframe: "a handoff is waiting, claim it".
 * Carries no data — the handoff itself still goes through `claim`, so a forged nudge can
 * at most make the iframe ask the background for nothing.
 */
export const PANEL_NUDGE = 'bs-web-agent-nudge';

/**
 * `storage.session` key of the background's token / scope state. The panel page watches it
 * to know when to redraw its tab list; only the background writes it.
 */
export const WEB_SESSION_KEY = 'web-agent-state';

/** A tab as the panel toolbar shows it. */
export interface WebScopeTab { id: number; title: string; url: string; favicon: string; active: boolean }

/** What the panel toolbar draws: the tabs under control, and where the active tab stands. */
export interface WebScopeView {
  tabs: WebScopeTab[];
  /** The window's active tab. `refused` is set when the agent may not drive it at all. */
  current: { id: number; inScope: boolean; refused: boolean } | null;
  /** Tabs in this window that could still be added. */
  addable: number;
}

export const WEB_READ_TOOLS = ['page_list', 'page_snapshot'] as const;
export const WEB_WRITE_TOOLS = ['page_open', 'page_click', 'page_type', 'page_run_js'] as const;
export const WEB_TOOLS: readonly string[] = [...WEB_READ_TOOLS, ...WEB_WRITE_TOOLS];
export const isWebTool = (name: string) => WEB_TOOLS.includes(name);
export const isWebWrite = (name: string) => (WEB_WRITE_TOOLS as readonly string[]).includes(name);

/**
 * Whether this call is a write that needs the user's approval.
 *
 * `page_run_js` declared `read_only: "true"` by the model counts as a read and runs without
 * approval. ⚠️ This trusts the model's own judgement — nothing checks the script. It was a
 * deliberate product call: approving every `return location.href` made the agent unusable on
 * pages where snapshot alone doesn't cut it. The soul tells the model exactly when it may set
 * the flag (see `web-soul.ts`).
 */
export function isWebWriteCall(name: string, params: Record<string, string | undefined>): boolean {
  if (!isWebWrite(name)) return false;
  if (name === 'page_run_js' && params.read_only?.trim().toLowerCase() === 'true') return false;
  return true;
}

/** What the panel picks up when it opens: a task sent from a tab, or a page to work on. */
export interface WebHandoff {
  /** Text to put after the `>Web Agent` capsule. */
  userInput: string;
  /** Send it straight away (entry 1) or leave it staged for the user (entry 2). */
  autoSend: boolean;
  createdAt: number;
}

/**
 * Who drives the pages. `builtin`: this build carries `debugger` itself (dev only). The rest
 * are the Web Agent Connector's states — see `shared/web-agent/connector-protocol.ts`.
 */
export type WebDebuggerState = 'builtin' | 'ok' | 'missing' | 'outdated' | 'paused';

export interface WebAgentStatus {
  consented: boolean;
  /** The pages can be driven right now: `debugger` is `builtin` or `ok`. */
  permitted: boolean;
  debugger: WebDebuggerState;
}

export type WebAgentRequest =
  /** From a Gemini / AI Studio tab: open this window's panel and run `userInput` there. */
  | { action: 'handoff'; userInput: string }
  /** From a Gemini / AI Studio tab: just open (or focus) this window's panel, no task. */
  | { action: 'open-panel' }
  /** From the panel page, once per load: this window's panel session token. */
  | { action: 'panel-ready'; windowId: number }
  /** From the panel page's toolbar: put this window's active tab, or all its tabs, in scope. */
  | { action: 'add-tabs'; windowId: number; which: 'active' | 'all' }
  /** From the panel page's toolbar: take one tab out of scope. */
  | { action: 'remove-tab'; windowId: number; tabId: number }
  /** From the panel page's toolbar: what to draw. */
  | { action: 'get-scope'; windowId: number }
  /** From the panel iframe: take the pending handoff, if any. One-shot. */
  | { action: 'claim'; token: string }
  /** From the panel iframe: whether a task is running, so a second handoff can be refused. */
  | { action: 'report'; token: string; running: boolean }
  | { action: 'status' }
  | { action: 'open-consent' }
  /** From the consent page, after Chrome granted `debugger`. */
  | { action: 'accept-consent' }
  | { action: 'withdraw-consent' }
  | { action: 'tool'; token: string; tool: string; params: Record<string, string> };

/**
 * Whether this document is the Gemini iframe inside our side panel.
 *
 * `ancestorOrigins` rather than `window.parent.location`, which is cross-origin and throws.
 * Exactly one ancestor and it is us: any other iframe on a Gemini page (Google embeds a few)
 * is neither the top page nor the panel, and content scripts must stay out of it.
 */
export function isPanelFrame(): boolean {
  if (window.top === window) return false;
  const ancestors = location.ancestorOrigins;
  return !!ancestors && ancestors.length === 1 && ancestors[0] === new URL(browser.runtime.getURL('/')).origin;
}

/** Top page, the panel iframe, or some other frame we must ignore. */
export function frameRole(): 'top' | 'panel' | 'other' {
  if (window.top === window) return 'top';
  return isPanelFrame() ? 'panel' : 'other';
}
