import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';

export async function handleMisc(
  message: ExtensionMessage,
  sender: MessageSender,
): Promise<ExtensionResponse | null> {
  if (message.type === 'OPEN_URL') {
    const { url } = message.payload;
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      await browser.tabs.update(tab.id, { url });
    } else {
      await browser.tabs.create({ url });
    }
    return { success: true };
  }

  if (message.type === 'OPEN_NEW_CHAT_TAB') {
    const { url, prompt } = message.payload;
    if (!isNewChatUrl(url)) {
      return { success: false, error: 'Not a Gemini or AI Studio URL' };
    }
    const opener = sender.tab;
    // Next to the conversation it came from, so the two read as a pair in the tab strip.
    const tab = await browser.tabs.create({
      url,
      active: true,
      windowId: opener?.windowId,
      index: opener?.index != null ? opener.index + 1 : undefined,
      openerTabId: opener?.id,
    });
    // Parked right after creation: the new tab's content script only asks once the page
    // has loaded and the overlay has booted, which is far behind this write.
    if (prompt && tab.id != null) await parkPrefill(tab.id, prompt);
    return { success: true, data: { tabId: tab.id } };
  }

  if (message.type === 'CLAIM_COMPOSER_PREFILL') {
    const tabId = sender.tab?.id;
    const prompt = tabId != null ? await claimPrefill(tabId) : null;
    return { success: true, data: { prompt } };
  }

  if (message.type === 'OPEN_PERMISSION_PAGE') {
    const { origin } = message.payload;
    const permUrl = browser.runtime.getURL(
      `/permissions.html?origins=${encodeURIComponent(origin)}`,
    );
    // Open as a popup window to avoid popup blocker (content script can't use window.open)
    await browser.windows.create({
      url: permUrl,
      type: 'popup',
      width: 500,
      height: 600,
    });
    return { success: true };
  }

  if (message.type === 'CHECK_HOST_PERMISSION') {
    const { origin } = message.payload;
    const granted = await new Promise<boolean>((resolve) => {
      chrome.permissions.contains({ origins: [origin] }, (result) => {
        resolve(result);
      });
    });
    return { success: true, data: { granted } };
  }

  if (message.type === 'REMOVE_HOST_PERMISSION') {
    const { origin } = message.payload;
    const removed = await new Promise<boolean>((resolve) => {
      chrome.permissions.remove({ origins: [origin] }, (result) => {
        resolve(result);
      });
    });
    return { success: true, data: { removed } };
  }

  return null;
}

// ─── Composer prefill for a new chat tab ─────────────────────────────────────

/**
 * How long parked text waits for its tab.
 *
 * Long enough for a slow load or a sign-in bounce, short enough that a tab which never
 * got its overlay (platform disabled, closed early) cannot surprise anyone later.
 */
const PREFILL_TTL_MS = 2 * 60 * 1000;

const prefillKey = (tabId: number) => `composerPrefill:${tabId}`;

/** Only our two chat hosts, over https — this handler opens whatever it is given. */
function isNewChatUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'gemini.google.com' || parsed.hostname === 'aistudio.google.com')
    );
  } catch {
    return false;
  }
}

/**
 * `storage.session` rather than a module-level map: the service worker can be put to
 * sleep between opening the tab and the tab asking, and a map would go with it.
 */
async function parkPrefill(tabId: number, prompt: string): Promise<void> {
  await chrome.storage.session.set({
    [prefillKey(tabId)]: { prompt, createdAt: Date.now() },
  });
}

/** Hand the parked text over once, and forget it either way. */
async function claimPrefill(tabId: number): Promise<string | null> {
  const key = prefillKey(tabId);
  const stored = (await chrome.storage.session.get(key))[key] as
    | { prompt?: string; createdAt?: number }
    | undefined;
  if (!stored) return null;
  await chrome.storage.session.remove(key);
  if (!stored.prompt || Date.now() - (stored.createdAt ?? 0) > PREFILL_TTL_MS) return null;
  return stored.prompt;
}
