/**
 * Background handler for Google Drive sync operations.
 * Handles auth, sync up (backup), sync down (restore), and status queries.
 * Each profile syncs to a separate file on Drive (namespaced by dbName).
 */

import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import {
  authenticate,
  disconnect,
  getAuthStatus,
  getAccessToken,
  findFile,
  uploadFile,
  downloadFile,
  exportSyncData,
  importSyncData,
} from '@/shared/lib/gdrive';
import { notifyDataUpdated } from '../notify';
import { getCurrentDbName } from '../tab-profile-map';

/**
 * Build a Drive filename namespaced by the current profile's dbName.
 * e.g. "better-sidebar-sync__prompt-manager-for-google-ai-studio.db.json"
 */
function getSyncFileName(): string {
  const dbName = getCurrentDbName();
  return `better-sidebar-sync__${dbName}.json`;
}

/** Storage key for last sync time, scoped by dbName */
function getSyncMetaKey(): string {
  const dbName = getCurrentDbName();
  return `gdrive_last_sync_time__${dbName}`;
}

export async function handleGdriveSync(
  message: ExtensionMessage,
  sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'GDRIVE_AUTH': {
      try {
        await authenticate();
        const status = await getAuthStatus();
        return { success: true, data: status };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GDRIVE_DISCONNECT': {
      try {
        await disconnect();
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GDRIVE_GET_STATUS': {
      try {
        const authStatus = await getAuthStatus();
        const metaKey = getSyncMetaKey();
        const meta = await browser.storage.local.get(metaKey);
        return {
          success: true,
          data: {
            ...authStatus,
            lastSyncTime: meta[metaKey] || null,
          },
        };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GDRIVE_SYNC_UP': {
      try {
        const token = await getAccessToken();
        const syncFileName = getSyncFileName();
        const metaKey = getSyncMetaKey();

        // Export local data
        const syncData = await exportSyncData();

        // Check if sync file already exists on Drive
        const existing = await findFile(token, syncFileName);

        // Upload or update
        await uploadFile(token, syncFileName, syncData, existing?.id);

        // Save last sync time
        const now = Math.floor(Date.now() / 1000);
        await browser.storage.local.set({ [metaKey]: now });

        return { success: true, data: { lastSyncTime: now } };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GDRIVE_SYNC_DOWN': {
      try {
        const token = await getAccessToken();
        const syncFileName = getSyncFileName();
        const metaKey = getSyncMetaKey();

        // Find the sync file for this profile
        const file = await findFile(token, syncFileName);
        if (!file) {
          return {
            success: false,
            error: 'No backup found on Google Drive for this profile',
          };
        }

        // Download and import
        const content = await downloadFile(token, file.id);
        await importSyncData(content);

        // Save last sync time
        const now = Math.floor(Date.now() / 1000);
        await browser.storage.local.set({ [metaKey]: now });

        // Notify UI to refresh
        await notifyDataUpdated();

        return { success: true, data: { lastSyncTime: now } };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GDRIVE_CHECK_SUPPORT': {
      return {
        success: true,
        data:
          typeof chrome !== 'undefined' && !!chrome.identity?.launchWebAuthFlow,
      };
    }

    default:
      return null;
  }
}
