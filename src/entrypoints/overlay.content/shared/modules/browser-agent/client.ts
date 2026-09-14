import { create } from 'zustand';
import { DEFAULT_SETTINGS, isChromeBuild, publicData, type BrowserRequest, type BrowserSettings, type PlanPreview } from '@/shared/browser-agent/contracts';

export async function browserRequest<T = unknown>(payload: BrowserRequest): Promise<T> {
  const response = await browser.runtime.sendMessage({ type: 'BROWSER_AGENT', payload });
  if (!response?.success) throw new Error(response?.error || 'Browser Agent is unavailable.');
  return response.data as T;
}
interface State {
  settings: BrowserSettings; ready: boolean;
  refresh: () => Promise<void>;
}
export const useBrowserAgent = create<State>((set) => ({
  settings: DEFAULT_SETTINGS, ready: false,
  refresh: async () => {
    if (!isChromeBuild()) return;
    try { set({ settings: await browserRequest<BrowserSettings>({ action: 'settings' }), ready: true }); }
    catch { set({ settings: DEFAULT_SETTINGS, ready: false }); }
  },
}));

export function initializeBrowserAgent() {
  void useBrowserAgent.getState().refresh();
  const refresh = () => { void useBrowserAgent.getState().refresh(); };
  const changed = (changes: Record<string, unknown>) => { if ('browser-agent-settings-version' in changes) refresh(); };
  window.addEventListener('focus', refresh);
  browser.storage.onChanged.addListener(changed);
  return () => { window.removeEventListener('focus', refresh); browser.storage.onChanged.removeListener(changed); };
}

/** Called only by the approval stage; commit is never exposed as a model tool. */
export async function prepareBrowserCall(tool: string, params: Record<string, string>, agentId: string) {
  if (agentId !== 'browser') throw new Error('Start Browser Agent before using browser tools.');
  return browserRequest<PlanPreview>({ action: 'prepare', tool, params });
}
export function safeBrowserText(text: string) {
  return publicData(text, useBrowserAgent.getState().settings.shareFullUrls);
}
