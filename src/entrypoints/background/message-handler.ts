import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from './types';
import { ensureDbReady } from './db';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { removeTab, resolveTabDb, UNBOUND } from './tab-profile-map';
import { withDb } from '@/shared/db';
import { handleBrowserAgent } from './handlers/browser-agent';
import { handleWebAgent } from './handlers/web-agent';
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

// `handleProfile` is deliberately absent: it runs ahead of the tab lease.
const handlers = [
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

/** Messages whose handlers pin an explicitly named database themselves */
const SELF_PINNED = new Set([
  'BACKUP_LIST',
  'BACKUP_CREATE',
  'BACKUP_DELETE',
  'BACKUP_RESTORE',
]);

// Clean up tab→db mapping when tabs are closed
browser.tabs.onRemoved.addListener((tabId) => {
  removeTab(tabId);
});

export async function handleMessage(
  message: ExtensionMessage,
  sender: MessageSender,
): Promise<ExtensionResponse> {
  try {
    // First, before anything awaits: a handoff opens the side panel, and the user gesture
    // it rides on does not survive a single `await` (see handlers/web-agent.ts).
    if (message.type === 'WEB_AGENT') return await handleWebAgent(message.payload, sender);
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

    // Detect platform from sender tab and inject into message payload if not present.
    // `sender.url` covers the Web Agent side panel, whose Gemini iframe is not in a tab.
    const senderPageUrl = sender.tab?.url ?? sender.url;
    if (senderPageUrl) {
      try {
        const url = new URL(senderPageUrl);
        const platform = detectPlatform(url.hostname);
        if (platform !== Platform.UNKNOWN) {
          message.platform = platform;
        }
      } catch (e) {
        // Ignore URL parsing errors
      }
    }

    // Profile messages decide which database a tab belongs to and switch it
    // themselves, so they run before — and outside — any tab lease. Inside one,
    // their `switchDB` would wait for the lease it is running in.
    const profileResult = await handleProfile(message, sender);
    if (profileResult !== null) return profileResult;

    const runHandlers = async (): Promise<ExtensionResponse> => {
      for (const handler of handlers) {
        const result = await handler(message, sender);
        if (result !== null) return result;
      }
      return { success: false, error: 'Unknown message type' };
    };

    // Backups name their database explicitly and pin it themselves; it need not
    // be the sender tab's, and pinning another one inside the tab's lease would
    // wait on itself.
    if (sender.tab?.id == null || SELF_PINNED.has(type)) {
      return await runHandlers();
    }

    // Run the whole handler against the sender tab's database. A lease rather
    // than a one-off switch: a handler awaits several queries, and another tab's
    // message used to switch the database between them, landing the rest of the
    // writes in the other account's profile.
    const tabDb = await resolveTabDb(sender.tab.id, sender.tab.url);
    if (tabDb === UNBOUND) {
      return {
        success: false,
        error: 'This account is not linked to a profile yet. Choose a profile first.',
      };
    }
    if (tabDb === null) return await runHandlers();
    return await withDb(tabDb, runHandlers);
  } catch (err: unknown) {
    console.error('Error handling message:', message, err);
    return { success: false, error: (err as Error).message };
  }
}
