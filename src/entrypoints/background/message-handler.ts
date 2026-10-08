import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from './types';
import { ensureDbReady } from './db';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { ensureDbForTab, removeTab } from './tab-profile-map';
import { handleBrowserAgent } from './handlers/browser-agent';
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
  handleExtensionUpdate,
  handleProfile,
  handleGdriveSync,
  handleGems,
  handleNotebooks,
  handleSnippets,
  handleNotionProxy,
  handleBackup,
  handleBackfill,
  handleAgentLedger,
  handleWorkspace,
  handleDocument,
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
  handleSnippets,
  handleNotionProxy,
  handleGdriveSync,
  handleBackup,
  handleBackfill,
  handleAgentLedger,
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
    if (message.type === 'BROWSER_AGENT') return await handleBrowserAgent(message.payload, sender);
    // The DB bridge broadcasts these to the offscreen document, and
    // runtime.sendMessage reaches every extension context including this one.
    // Answer immediately: they are none of our business, and queueing them
    // behind ensureDbReady() would park them on the very thing they are
    // initializing.
    const type = message.type as string;
    if (type === 'DB_REQUEST' || type === 'DB_RESPONSE') {
      return { success: true };
    }
    // Same story for the document worker's channel: these are addressed to the offscreen
    // document, and `sendMessage` delivers them here as well. Answering immediately keeps
    // them off `ensureDbReady()`, which they have nothing to do with.
    if (type === 'DOC_REQUEST' || type === 'DOC_RESPONSE') {
      return { success: true };
    }

    // Handle messages that don't need DB before waiting for the database
    // OPEN_PERMISSION_PAGE and OPEN_URL just need to interact with browser APIs
    const miscResult = await handleMisc(message, sender);
    if (miscResult !== null) return miscResult;

    // Store update checks touch no data, and must keep working when the DB fails to
    // open — updating may be exactly what fixes it.
    const updateResult = await handleExtensionUpdate(message);
    if (updateResult !== null) return updateResult;

    // The agent workspace is OPFS, not SQLite. Answering it before
    // `ensureDbReady()` keeps file operations working while the database is still
    // opening (or has failed to open), and avoids `ensureDbForTab` switching
    // profiles for a call that reads no profile-scoped data.
    const workspaceResult = await handleWorkspace(message);
    if (workspaceResult !== null) return workspaceResult;

    // Documents are OPFS too, and the parsing happens in the offscreen worker. Answering
    // before `ensureDbReady()` for the same reason as the workspace above.
    const documentResult = await handleDocument(message);
    if (documentResult !== null) return documentResult;

    await ensureDbReady();

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
