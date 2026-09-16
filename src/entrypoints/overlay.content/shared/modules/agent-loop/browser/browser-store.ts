/**
 * The Browser agent's side of the wall: granted capabilities, and the only way through it.
 *
 * Parallel to `workspace/workspace-store.ts`. The difference is where the state actually
 * lives: a workspace is ours, so its store owns it, while everything here is a *mirror* of
 * two things the content script cannot see — the settings record in `storage.local` and the
 * Chrome permissions the user granted. A capability is only real if `permissions.contains`
 * still agrees, so the refresh goes through the background rather than reading storage.
 *
 * ⚠️ This module deliberately imports nothing from `agent-loop`. It is the leaf the MCP
 * provider, the soul and the Agent tab all sit on top of, and a back-edge from here would
 * close a cycle through `mcp/setup.ts`.
 */

import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  isChromeBuild,
  publicData,
  type BrowserRequest,
  type BrowserSettings,
  type PlanPreview,
} from '@/shared/browser-agent/contracts';

/**
 * Every browser operation, read or write, goes through the background.
 *
 * Not a convenience wrapper: the content script has no `chrome.tabs`, and the audit journal
 * and the permission check both live on the other side. A failure comes back as a rejected
 * promise so callers can turn it into an `ERROR:` result the way every other tool does.
 */
export async function browserRequest<T = unknown>(payload: BrowserRequest): Promise<T> {
  const response = await browser.runtime.sendMessage({ type: 'BROWSER_AGENT', payload });
  if (!response?.success) throw new Error(response?.error || 'Browser Agent is unavailable.');
  return response.data as T;
}

interface BrowserAgentState {
  settings: BrowserSettings;
  /** Whether the background has answered at least once. False on non-Chrome builds. */
  ready: boolean;
  refresh: () => Promise<void>;
}

export const useBrowserAgent = create<BrowserAgentState>((set) => ({
  settings: DEFAULT_SETTINGS,
  ready: false,
  refresh: async () => {
    if (!isChromeBuild()) return;
    try {
      set({ settings: await browserRequest<BrowserSettings>({ action: 'settings' }), ready: true });
    } catch {
      set({ settings: DEFAULT_SETTINGS, ready: false });
    }
  },
}));

/**
 * Start mirroring, and keep mirroring.
 *
 * Called once per page from the platform's feature component. Returns its own teardown.
 *
 * Both triggers are needed and neither is redundant: the settings window is a separate
 * popup, so a grant made there arrives as a `storage.onChanged` event, while a permission
 * *revoked* from Chrome's own UI produces no event at all — the window regaining focus is
 * the only moment we can notice it.
 */
export function initializeBrowserAgent(): () => void {
  void useBrowserAgent.getState().refresh();
  const refresh = () => {
    void useBrowserAgent.getState().refresh();
  };
  const changed = (changes: Record<string, unknown>) => {
    if ('browser-agent-settings' in changes) refresh();
  };
  window.addEventListener('focus', refresh);
  browser.storage.onChanged.addListener(changed);
  return () => {
    window.removeEventListener('focus', refresh);
    browser.storage.onChanged.removeListener(changed);
  };
}

/**
 * Whether the agent can do anything at all yet.
 *
 * Read access is the floor: without one `*.read` capability there is nothing to look at, so
 * a session would open, call a tool, be refused by the background and end — three rounds
 * to discover a switch is off. The `>` list and the Agent tab both ask this first and send
 * the user to the permission window instead.
 */
export function browserAgentNeedsPermission(): boolean {
  return !useBrowserAgent.getState().settings.capabilities.some((c) => c.endsWith('.read'));
}

/** Open the permissions window. The one action offered when the agent is unavailable. */
export function openBrowserAgentSettings(): Promise<unknown> {
  return browserRequest({ action: 'open-settings' });
}

/** Ask the background to build an approval preview for a write. Never commits. */
export function prepareBrowserPlan(
  tool: string,
  params: Record<string, string>,
): Promise<PlanPreview> {
  return browserRequest<PlanPreview>({ action: 'prepare', tool, params });
}

/** Apply a plan the user has approved. */
export function commitBrowserPlan(planId: string): Promise<{ status: string }> {
  return browserRequest<{ status: string }>({ action: 'commit', planId });
}

/** Drop a prepared plan. Best-effort — a stale plan expires on its own. */
export function cancelBrowserPlan(planId: string): void {
  void browserRequest({ action: 'cancel', planId }).catch(() => {
    /* Nothing to do: the plan is unusable either way. */
  });
}

/**
 * Text on its way into the conversation, with URLs redacted unless the user allowed them.
 *
 * ⚠️ Applies to error messages too, not just tool results. A background error routinely
 * quotes the URL it choked on, and that string is about to become a permanent message in
 * the user's chat history — which is exactly what "don't send my URLs to the AI" was about.
 */
export function safeBrowserText<T>(value: T): T {
  return publicData(value, useBrowserAgent.getState().settings.shareFullUrls);
}
