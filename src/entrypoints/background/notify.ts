import type { DataScope } from '@/shared/types/data-scope';

/**
 * Notify all parts of the extension about data updates (sidepanel, content scripts).
 *
 * `scopes` names the datasets the write touched, so receivers refresh only
 * those. Leave it out when the change is broad or unknown (restore, import,
 * Drive sync, profile switch, raw SQL) and everything is refreshed.
 */
export async function notifyDataUpdated(
  updateType?: string,
  payload?: unknown,
  scopes?: DataScope[],
): Promise<void> {
  const message: {
    type: string;
    updateType?: string;
    payload?: unknown;
    scopes?: DataScope[];
  } = {
    type: 'DATA_UPDATED',
  };
  if (updateType) message.updateType = updateType;
  if (payload !== undefined) message.payload = payload;
  if (scopes?.length) message.scopes = scopes;

  browser.runtime.sendMessage(message).catch(() => {
    // Expected if no listeners (e.g. sidepanel closed)
  });

  try {
    const tabs = await browser.tabs.query({
      url: ['https://aistudio.google.com/*', 'https://gemini.google.com/*', 'https://chatgpt.com/*'],
    });
    for (const tab of tabs) {
      if (tab.id) {
        browser.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  } catch (e) {
    console.error('Error notifying tabs:', e);
  }
}

/** `notifyDataUpdated` for a write that touched exactly these datasets. */
export function notifyDataChanged(...scopes: DataScope[]): Promise<void> {
  return notifyDataUpdated(undefined, undefined, scopes);
}
