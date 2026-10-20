/**
 * The Web Agent's side of the wall, in the page: what is unlocked, and the way to the panel.
 *
 * Same role as `browser/browser-store.ts`, and like it this module imports nothing from
 * `agent-loop` — the registry, the provider and both platforms' send paths sit on top of it.
 *
 * Three gates, checked in this order by `webAgentBlocker`:
 * 1. **Power Pack.** The whole agent is paid, reads included — unlike the Browser agent.
 * 2. **The risk notice**, accepted once per notice version.
 * 3. **Chrome's `debugger` permission**, granted on the same click as 2.
 * 2 and 3 share one fix (the notice window), so they share one sentence.
 */

import { create } from 'zustand';
import i18n from '@/locale/i18n';
import { isPowerPackUser } from '@/shared/lib/license-store';
import { showPowerPackPaywall } from '@/shared/lib/powerpack-paywall';
import { toast } from '@/shared/lib/toast';
import {
  PANEL_TOKEN_STORAGE_KEY,
  WEB_CONSENT_KEY,
  isPanelFrame,
  type WebAgentRequest,
  type WebAgentStatus,
  type WebHandoff,
} from '@/shared/web-agent/contracts';

export async function webRequest<T = unknown>(payload: WebAgentRequest): Promise<T> {
  const response = await browser.runtime.sendMessage({ type: 'WEB_AGENT', payload });
  if (!response?.success) throw new Error(response?.error || 'Web Agent is unavailable.');
  return response.data as T;
}

interface WebAgentState extends WebAgentStatus {
  ready: boolean;
  refresh: () => Promise<void>;
}

export const useWebAgent = create<WebAgentState>((set) => ({
  consented: false,
  permitted: false,
  ready: false,
  refresh: async () => {
    if (import.meta.env.BROWSER !== 'chrome') return;
    try {
      set({ ...(await webRequest<WebAgentStatus>({ action: 'status' })), ready: true });
    } catch {
      set({ consented: false, permitted: false, ready: false });
    }
  },
}));

/**
 * Start mirroring. Same two triggers as the Browser agent: accepting the notice writes
 * `storage.local`, and a permission removed from Chrome's own UI is only noticeable when the
 * window regains focus.
 */
export function initializeWebAgent(): () => void {
  const refresh = () => void useWebAgent.getState().refresh();
  refresh();
  const changed = (changes: Record<string, unknown>) => {
    if (WEB_CONSENT_KEY in changes) refresh();
  };
  window.addEventListener('focus', refresh);
  browser.storage.onChanged.addListener(changed);
  return () => {
    window.removeEventListener('focus', refresh);
    browser.storage.onChanged.removeListener(changed);
  };
}

export function openWebAgentConsent(): Promise<unknown> {
  return webRequest({ action: 'open-consent' });
}

/** Why the Web Agent cannot run yet, and the one action that fixes it. */
export function webAgentBlocker(): { reason: string; resolve: () => void } | null {
  if (!isPowerPackUser()) {
    return {
      reason: i18n.t('agent.web.needsPowerPack', { defaultValue: '⭐ Power Pack feature · click to learn more' }),
      resolve: () => void showPowerPackPaywall(i18n.t('agent.agents.web.name', { defaultValue: 'Web Agent' })),
    };
  }
  const { consented, permitted } = useWebAgent.getState();
  if (!consented || !permitted) {
    return {
      reason: i18n.t('agent.web.needsConsent', { defaultValue: '🔒 Read the risk notice first · click to open' }),
      resolve: () => void openWebAgentConsent(),
    };
  }
  return null;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

/** This panel's session token. Null outside the panel iframe. */
export function getPanelToken(): string | null {
  if (!isPanelFrame()) return null;
  try { return sessionStorage.getItem(PANEL_TOKEN_STORAGE_KEY); } catch { return null; }
}

/**
 * Send a task to this window's side panel (entry 1).
 *
 * ⚠️ `sendMessage` must be the first thing that runs, inside the Enter / click handler that
 * called this — it carries the user gesture `sidePanel.open` needs. Nothing may be awaited
 * before it.
 */
export async function handoffToPanel(userInput: string): Promise<'opened' | 'busy' | 'failed'> {
  try {
    await webRequest({ action: 'handoff', userInput });
    return 'opened';
  } catch (e) {
    const message = (e as Error)?.message ?? '';
    console.warn('[WebAgent] handoff failed:', message);
    return message === 'busy' ? 'busy' : 'failed';
  }
}

/**
 * Entry 1, end to end: hand the task to the panel, and only then empty the composer.
 *
 * ⚠️ Clearing waits for the background to confirm the panel opened. Clearing first and then
 * failing would throw away what the user wrote. On failure the text stays and the toast
 * offers a retry — that click is a fresh user gesture, which is what Chrome may have wanted.
 */
export function sendToPanel(userInput: string, clearComposer: () => void): void {
  const settle = (result: 'opened' | 'busy' | 'failed') => {
    if (result === 'opened') {
      clearComposer();
      toast.success(i18n.t('agent.web.handedOff', { defaultValue: 'Sent to the Web Agent in the side panel' }));
    } else if (result === 'busy') {
      toast.warning(i18n.t('agent.web.panelBusy', { defaultValue: 'The side panel is still running a task. Finish or stop it first.' }));
    } else {
      const id: string = toast.withAction(
        i18n.t('agent.web.panelBlocked', { defaultValue: 'Chrome did not open the side panel.' }),
        'warning',
        {
          label: i18n.t('agent.web.openPanel', { defaultValue: 'Open side panel' }),
          onClick: () => {
            toast.dismiss(id);
            void handoffToPanel(userInput).then(settle);
          },
        },
        15000,
      );
    }
  };
  void handoffToPanel(userInput).then(settle);
}

/**
 * Open this window's side panel with nothing to run — the Agent tab's button.
 *
 * ⚠️ Same gesture rule as {@link handoffToPanel}: call it straight from the click handler.
 */
export function openWebPanel(): void {
  void webRequest({ action: 'open-panel' }).catch((e: Error) => {
    console.warn('[WebAgent] open panel failed:', e?.message);
    toast.warning(i18n.t('agent.web.panelBlocked', { defaultValue: 'Chrome did not open the side panel.' }));
  });
}

/** Panel only: take whatever task the tab that opened us left. */
export async function claimHandoff(): Promise<WebHandoff | null> {
  const token = getPanelToken();
  if (!token) return null;
  return webRequest<WebHandoff | null>({ action: 'claim', token });
}

/** Panel only: tell the background whether a task is running here. */
export function reportPanelRunning(running: boolean): void {
  const token = getPanelToken();
  if (token) void webRequest({ action: 'report', token, running }).catch(() => {});
}

/** Run one page tool through the background. Never throws: failures are `ERROR:` text. */
export async function runWebTool(tool: string, params: Record<string, string>): Promise<string> {
  if (!isPowerPackUser()) return 'ERROR: The Web Agent needs Power Pack. Tell the user and call complete_task.';
  const token = getPanelToken();
  if (!token) {
    return 'ERROR: Web Agent tools only run in the Better Sidebar side panel. Tell the user to start the task with >Web Agent so it opens there, and call complete_task.';
  }
  try {
    return await webRequest<string>({ action: 'tool', token, tool, params });
  } catch (e) {
    return `ERROR: ${(e as Error)?.message ?? String(e)}`;
  }
}
