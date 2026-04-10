import { Platform } from '@/shared/types/platform';
import { apiScanner } from './scan-api';

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

function waitForNoLoadingElement(selector: string, timeout = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if element doesn't exist initially
    if (!document.querySelector(selector)) {
      return resolve(true);
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(!document.querySelector(selector));
    }, timeout);
  });
}

export async function scanConversations() {
  console.log('Starting ChatGPT conversation scan...');
  
  // Start scanner to capture API responses
  apiScanner.start();

  try {
    // Wait for the scroll container
    console.log('Waiting for scroll container: #stage-slideover-sidebar .group\\/scrollport');
    const container = (await waitForElement(
      '#stage-slideover-sidebar .group\\/scrollport',
      10000
    )) as HTMLElement;

    if (!container) {
      console.error('ChatGPT Scan: Could not find scroll container');
      // Even if we can't scroll, we might have captured some initial items if the page loaded them.
    } else {
      console.log('Found scroll container, starting scroll loop...');
      
      let previousScrollHeight = 0;
      let noChangeCount = 0;

      // Scroll loop
      while (true) {
        const { scrollHeight, clientHeight } = container;
        
        // Scroll to bottom - set to max scrollable position (scrollHeight - clientHeight)
        // Using a large number ensures we reach the absolute bottom
        container.scrollTop = scrollHeight - clientHeight + 1000;

        // Wait a bit for content to load
        await new Promise(r => setTimeout(r, 800));

        // Check if loading element exists
        const loadingElement = document.querySelector('#history .mb-5');
        
        if (loadingElement) {
          console.log('ChatGPT Scan: Loading element exists, waiting for it to disappear...');
          // Wait for loading element to disappear
          await waitForNoLoadingElement('#history .mb-5', 10000);
          
          // Reset no change count since we were loading
          noChangeCount = 0;
          
          // Give a small buffer for DOM to settle
          await new Promise(r => setTimeout(r, 500));

        } else {
          // Not loading, check if scroll height has changed
          const currentScrollHeight = container.scrollHeight;
          
          if (currentScrollHeight === previousScrollHeight) {
            // Height didn't change and not loading
            noChangeCount++;
            console.log(`ChatGPT Scan: Not loading and no height change (count: ${noChangeCount})`);
            
            if (noChangeCount >= 2) {
              // Double check with a longer delay
              await new Promise(r => setTimeout(r, 1500));
              const finalLoadingElement = document.querySelector('#history .mb-5');
              const finalScrollHeight = container.scrollHeight;
              
              if (!finalLoadingElement && finalScrollHeight === currentScrollHeight) {
                console.log('ChatGPT Scan: Reached end of list.');
                break;
              }
            }
          } else {
            // Height changed (content loaded fast?)
            noChangeCount = 0;
            console.log('ChatGPT Scan: Height changed, continuing...');
          }
          
          previousScrollHeight = currentScrollHeight;
        }
      }
    }
    
    // Wait a bit more for any final pending requests
    await new Promise((r) => setTimeout(r, 2000));

  } catch (err) {
    console.error('ChatGPT Scan: Error during scan', err);
  }

  // Stop scanner
  apiScanner.stop();

  // Process and send all collected items
  const items = apiScanner.getItems();
  console.log(`ChatGPT Scan: Collected ${items.length} raw items.`);
  
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
    title: item.title || 'Untitled',
    external_id: item.id,
    external_url: `https://chatgpt.com/c/${item.id}`,
    last_active_at: item.updated_at ?? item.created_at ?? Math.floor(Date.now() / 1000),
    created_at: item.created_at,
    platform: Platform.CHATGPT,
  }));

  console.log(`Sending ${payloadItems.length} scanned items to background...`);
  try {
    await browser.runtime.sendMessage({
      type: 'SAVE_SCANNED_ITEMS',
      payload: { items: payloadItems },
    });
    console.log('ChatGPT Scan: Sent items to background.');
  } catch (err) {
    console.error('ChatGPT Scan: Failed to send items:', err);
  }

  return payloadItems.length;
}
