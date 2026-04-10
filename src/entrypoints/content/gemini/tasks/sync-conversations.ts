import { Platform } from '@/shared/types/platform';
import { apiScanner } from './scan-api';
import i18n from '@/locale/i18n';

function waitForElement(selector: string, timeout = 10000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver((_mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function waitForSpinnerStopLoading(selector: string, timeout = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    // If element doesn't exist, we consider it "not loading"
    if (!el) return resolve(true);
    // If element exists but doesn't have class, it's not loading
    if (!el.classList.contains('is-loading')) return resolve(true);

    const observer = new MutationObserver((mutations) => {
      const el = document.querySelector(selector);
      // If element is gone, good
      if (!el) {
        observer.disconnect();
        resolve(true);
        return;
      }
      // If element exists but lost the class
      if (!el.classList.contains('is-loading')) {
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(el, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Fallback: observe parent for removal just in case
    observer.observe(el.parentElement || document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      const finalEl = document.querySelector(selector);
      resolve(!finalEl || !finalEl.classList.contains('is-loading'));
    }, timeout);
  });
}

async function processAndSendItems() {
    const items = apiScanner.getItems();
    if (items.length === 0) return 0;

    console.log(`Gemini Sync: Processing ${items.length} new raw items.`);
    
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
        external_url: `https://gemini.google.com/app/${item.id}`,
        last_active_at: item.created_at ?? Math.floor(Date.now() / 1000),
        created_at: item.created_at,
        platform: Platform.GEMINI,
        type: item.type || 'conversation',
        gem_id: item.gem_id || null,
    }));

    if (payloadItems.length > 0) {
        console.log(`Gemini Sync: Sending ${payloadItems.length} items to background...`);
        try {
            await browser.runtime.sendMessage({
                type: 'SYNC_CONVERSATIONS',
                platform: Platform.GEMINI,
                payload: { items: payloadItems },
            });
            // Clear items from scanner after successful send so we don't send them again
            // apiScanner.clear();
        } catch (err) {
            console.error('Gemini Sync: Failed to send items:', err);
        }
    }
    return payloadItems.length;
}

export interface SyncConversationsOptions {
  /** Whether to scroll through the entire list. Defaults to false (first page only). */
  scroll?: boolean;
}

export async function syncConversations(options: SyncConversationsOptions = {}) {
  const { scroll = false } = options;
  console.log(`Starting Gemini conversation sync (scroll=${scroll})...`);
  
  // Start scanner to capture API responses
  apiScanner.start();

  let totalSynced = 0;

  try {
    // Find the infinite scroller element
    // User mentioned "element is infinite-scroller", so we try tag name first, then class
    let scroller = (await waitForElement('infinite-scroller')) as HTMLElement;
    if (!scroller) {
      console.log('Could not find <infinite-scroller>, trying .infinite-scroller');
      scroller = (await waitForElement('.infinite-scroller')) as HTMLElement;
    }

    if (!scroller) {
      console.error('Gemini Sync: Could not find infinite-scroller element');
    } else {
        // Always sync whatever is already loaded (first page)
        totalSynced += await processAndSendItems();

        if (!scroll) {
          console.log('Gemini Sync: scroll=false, synced first page only.');
        } else {
        console.log('Found infinite-scroller, starting scroll loop...');
        
        let previousScrollHeight = 0;
        let noChangeCount = 0;

        // Scroll loop
        while (true) {
            const { scrollHeight } = scroller;
            
            // Scroll to bottom
            scroller.scrollTop = scrollHeight;

            // Wait a bit for the spinner state to update or scroll to happen
            await new Promise(r => setTimeout(r, 800));

            // Check if spinner exists and has is-loading class
            const spinner = scroller.querySelector('.loading-history-spinner-container');
            const isLoading = spinner && spinner.classList.contains('is-loading');

            if (isLoading) {
                console.log('Gemini Sync: Spinner is loading, waiting for completion...');
                // Wait for is-loading class to be removed (max 20s)
                await waitForSpinnerStopLoading('.loading-history-spinner-container', 20000);
                
                // Reset no change count since we were loading
                noChangeCount = 0;
                
                // Give a small buffer for DOM to settle
                await new Promise(r => setTimeout(r, 500));

                // Process items after each successful load
                totalSynced += await processAndSendItems();

            } else {
                // Not loading.
                // Check if scroll height has changed since last check
                const currentScrollHeight = scroller.scrollHeight;
                
                if (currentScrollHeight === previousScrollHeight) {
                    // Height didn't change and not loading
                    noChangeCount++;
                    console.log(`Gemini Sync: Not loading and no height change (count: ${noChangeCount})`);
                    
                    if (noChangeCount >= 2) {
                        // Double check with a longer delay
                        await new Promise(r => setTimeout(r, 1500));
                        const finalSpinner = scroller.querySelector('.loading-history-spinner-container');
                        const finalIsLoading = finalSpinner && finalSpinner.classList.contains('is-loading');
                        const finalScrollHeight = scroller.scrollHeight;
                        
                        if (!finalIsLoading && finalScrollHeight === currentScrollHeight) {
                            console.log('Gemini Sync: Reached end of list.');
                            break;
                        }
                    }
                } else {
                     // Height changed (content loaded fast?)
                     noChangeCount = 0;
                     console.log('Gemini Sync: Height changed without seeing loading state, continuing...');
                     
                     // Even if we didn't see the spinner, if height changed, new content might have loaded
                     totalSynced += await processAndSendItems();
                }
                
                previousScrollHeight = currentScrollHeight;
            }
        }
        } // end if (scroll)
    }
    
    // Wait a bit more for any final pending requests
    await new Promise((r) => setTimeout(r, 2000));
    // Final sync
    totalSynced += await processAndSendItems();

  } catch (err) {
      console.error('Gemini Sync: Error during scrolling', err);
  }

  // Stop scanner
  apiScanner.stop();
  // apiScanner.clear();

  return totalSynced;
}
