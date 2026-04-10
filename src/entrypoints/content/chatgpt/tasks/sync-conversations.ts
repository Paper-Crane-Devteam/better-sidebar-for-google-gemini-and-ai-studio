import { Platform } from '@/shared/types/platform';
import { apiScanner } from './scan-api';
import i18n from '@/locale/i18n';

async function processAndSendItems() {
  const items = apiScanner.getItems();
  if (items.length === 0) return 0;

  console.log(`ChatGPT Sync: Processing ${items.length} new raw items.`);
  
  // Deduplicate items based on ID
  const uniqueItems = new Map();
  for (const item of items) {
    if (item && item.id) {
      uniqueItems.set(item.id, item);
    }
  }

  // Transform to Conversation format
  const payloadItems = Array.from(uniqueItems.values()).map((item) => ({
    id: item.id,
    title: item.title || i18n.t('common.untitled'),
    external_id: item.id,
    external_url: `https://chatgpt.com/c/${item.id}`,
    last_active_at: item.updated_at ?? item.created_at ?? Math.floor(Date.now() / 1000),
    created_at: item.created_at,
    platform: Platform.CHATGPT,
  }));

  if (payloadItems.length > 0) {
    console.log(`ChatGPT Sync: Sending ${payloadItems.length} items to background...`);
    try {
      await browser.runtime.sendMessage({
        type: 'SYNC_CONVERSATIONS',
        platform: Platform.CHATGPT,
        payload: { items: payloadItems },
      });
    } catch (err) {
      console.error('ChatGPT Sync: Failed to send items:', err);
    }
  }
  return payloadItems.length;
}

export async function syncConversations() {
  console.log('Starting ChatGPT conversation sync (first page only)...');
  
  // Start scanner to capture API responses
  apiScanner.start();

  // Wait for initial API calls to complete
  await new Promise(r => setTimeout(r, 2000));

  // Process whatever items were captured from the first page load
  const count = await processAndSendItems();

  console.log(`ChatGPT Sync: Synced ${count} conversations from first page.`);
  
  return count;
}
