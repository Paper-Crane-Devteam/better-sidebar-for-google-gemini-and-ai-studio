import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from './types';
import { dbReady } from './db';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { ensureDbForTab, removeTab } from './tab-profile-map';
import {
  handleFolders,
  handleConversations,
  handleScan,
  handleDbAdmin,
  handleFavorites,
  handleTags,
  handleMessages,
  handlePrompts,
  handleMisc,
  handleProfile,
  handleGdriveSync,
  handleGems,
  handleNotebooks,
} from './handlers';

const handlers = [
  handleProfile,
  handleFolders,
  handleConversations,
  handleScan,
  handleDbAdmin,
  handleFavorites,
  handleTags,
  handleMessages,
  handlePrompts,
  handleGems,
  handleNotebooks,
  handleMisc,
  handleGdriveSync,
];

// Clean up tab→db mapping when tabs are closed
browser.tabs.onRemoved.addListener((tabId) => {
  removeTab(tabId);
});

export async function handleMessage(
  message: ExtensionMessage,
  sender: MessageSender,
): Promise<ExtensionResponse> {
  try {
    await dbReady;

    // Detect platform from sender tab and inject into message payload if not present
    if (sender.tab?.url) {
      try {
        const url = new URL(sender.tab.url);
        const platform = detectPlatform(url.hostname);
        if (platform !== Platform.UNKNOWN) {
          message.platform = platform;
        }
      } catch (e) {
        // Ignore URL parsing errors
      }
    }

    // Auto-switch DB if sender tab expects a different database
    // (handles multi-tab with different accounts)
    if (sender.tab?.id != null) {
      await ensureDbForTab(sender.tab.id);
    }

    for (const handler of handlers) {
      const result = await handler(message, sender);
      if (result !== null) return result;
    }

    return { success: false, error: 'Unknown message type' };
  } catch (err: unknown) {
    console.error('Error handling message:', message, err);
    return { success: false, error: (err as Error).message };
  }
}
