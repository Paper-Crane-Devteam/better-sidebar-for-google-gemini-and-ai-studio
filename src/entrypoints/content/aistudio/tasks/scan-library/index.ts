import { scanLibraryDom } from './scan-dom';
import { apiScanner } from './scan-api';
import { autoSyncHandler } from './sync-library';
import { Platform } from '@/shared/types/platform';

/**
 * Manual library scan (user-initiated)
 * This performs a full DOM scan and collects API data
 * New items will be saved to the "Inbox" folder
 */
export async function scanLibrary() {
  console.log('=== Starting Manual Library Scan ===');

  // Temporarily stop auto-sync to avoid conflicts
  const wasAutoSyncActive = autoSyncHandler.isActive();
  if (wasAutoSyncActive) {
    console.log('Temporarily pausing auto-sync during manual scan...');
    autoSyncHandler.stop();
  }

  // Start API scanner for this manual scan session
  apiScanner.start();

  try {
    // Run DOM scan - this will trigger scrolls and API requests
    const domItems = await scanLibraryDom();

    // Give a small buffer for any pending requests to finish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get API items collected during the scan
    const apiItems = apiScanner.getItems();

    console.log(
      `Manual Scan - DOM Items: ${domItems.length}, API Items: ${apiItems.length}`,
    );

    // Create a map of API items by ID for fast lookup
    const apiMap = new Map();
    for (const item of apiItems) {
      if (item && item.id) {
        apiMap.set(item.id, item);
      }
    }

    // Merge DOM data with API data
    const mergedItems = domItems.map((item) => {
      const apiItem = apiMap.get(item.id);
      if (apiItem) {
        return {
          ...item,
          created_at: apiItem.created_at,
          last_active_at: apiItem.created_at,
          prompt_metadata: apiItem.prompt_metadata,
          type: apiItem.type,
          platform: Platform.AI_STUDIO,
        };
      }
      return {
        ...item,
        platform: Platform.AI_STUDIO,
      };
    });

    // Send to background - new items will go to "Inbox" folder
    console.log(
      `Sending ${mergedItems.length} items to background (manual scan)...`,
    );
    try {
      const response = await browser.runtime.sendMessage({
        type: 'SAVE_SCANNED_ITEMS',
        payload: { items: mergedItems },
        platform: Platform.AI_STUDIO,
      });
      console.log('Manual scan complete. Response:', response);
    } catch (err) {
      console.error('Failed to send scanned items:', err);
    }

    return mergedItems.length;
  } finally {
    // Stop the manual scan's API scanner
    apiScanner.stop();

    // Resume auto-sync if it was active before
    if (wasAutoSyncActive) {
      console.log('Resuming auto-sync...');
      autoSyncHandler.start();
    }
  }
}
