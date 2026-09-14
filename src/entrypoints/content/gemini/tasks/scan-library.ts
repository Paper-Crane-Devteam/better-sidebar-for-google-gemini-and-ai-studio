import { Platform } from '@/shared/types/platform';
import { apiScanner } from './scan-api';
import { scrollHistoryToEnd, waitForHistoryScroller } from './history-scroller';
import i18n from '@/locale/i18n';
import { trace } from '@/shared/lib/trace';

/**
 * Full library scan for Gemini.
 *
 * Used to run on the `/search` history page, but that page stopped
 * lazy-loading more conversations on scroll. The native sidebar's
 * `infinite-scroller` is the only surface that still pages through history, so
 * the scan drives that instead and lets the API scanner collect whatever
 * Gemini requests along the way.
 */
export async function scanLibrary() {
  console.log('Starting Gemini library scan...');

  // Ensure scanner is listening (idempotent check inside start)
  apiScanner.start();

  // Hold back the incremental sync flush for the whole scan. If it saves the
  // batches as they arrive, the DB diff in SAVE_SCANNED_ITEMS finds nothing new
  // and the "imported N conversations" toast always reports 0.
  const resumeNotifications = apiScanner.pauseNotifications();

  try {
    return await runScan();
  } finally {
    resumeNotifications();
  }
}

async function runScan() {
  try {
    const scroller = await waitForHistoryScroller(10000);

    if (!scroller) {
      console.error(
        'Gemini Scan: sidebar history scroller not found — keeping whatever was already captured.',
      );
    } else {
      const before = apiScanner.getItems().length;
      await scrollHistoryToEnd(scroller, {
        logPrefix: 'Gemini Scan',
        onBatchLoaded: () => {
          trace(
            `Gemini Scan: captured ${apiScanner.getItems().length} raw items so far`,
          );
        },
      });
      console.log(
        `Gemini Scan: scroll finished, raw items ${before} → ${apiScanner.getItems().length}`,
      );
    }

    // Wait a bit more for any final pending requests
    await new Promise((r) => setTimeout(r, 2000));
  } catch (err) {
    console.error('Gemini Scan: Error during scan', err);
  }

  // Process and Send
  const items = apiScanner.getItems();
  console.log(`Gemini Scan: Collected ${items.length} raw items.`);

  const uniqueItems = new Map<string, any>();
  for (const item of items) {
      if (item && item.id) {
          const existing = uniqueItems.get(item.id);
          if (existing) {
              uniqueItems.set(item.id, {
                  ...existing,
                  ...item,
                  gem_id: item.gem_id || existing.gem_id,
                  notebook_id: item.notebook_id || existing.notebook_id,
                  type: (item.notebook_id ? 'notebook' : item.gem_id ? 'gem' : null)
                      || (existing.notebook_id ? 'notebook' : existing.gem_id ? 'gem' : null)
                      || item.type || existing.type || 'conversation',
              });
          } else {
              uniqueItems.set(item.id, item);
          }
      }
  }

  const payloadItems = Array.from(uniqueItems.values()).map((item) => ({
    id: item.id,
    title: item.title || i18n.t('common.untitled'),
    external_id: item.id,
    external_url: `https://gemini.google.com/app/${item.id}`,
    // The list endpoint only exposes a last-active timestamp (already in
    // seconds). `created_at` is intentionally omitted so the DB upsert's
    // COALESCE keeps any real creation time captured on the create path.
    updated_at: item.last_active_at ?? Math.floor(Date.now() / 1000),
    last_active_at: item.last_active_at ?? Math.floor(Date.now() / 1000),
    platform: Platform.GEMINI,
    type: item.type || 'conversation',
    gem_id: item.gem_id || null,
    notebook_id: item.notebook_id || null,
  }));

  console.log(`Sending ${payloadItems.length} scanned items to background...`);
  try {
    await browser.runtime.sendMessage({
      type: 'SAVE_SCANNED_ITEMS',
      payload: { items: payloadItems },
    });
    console.log('Gemini Scan: Sent items to background.');
  } catch (err) {
    console.error('Gemini Scan: Failed to send items:', err);
  }

  return payloadItems.length;
}
