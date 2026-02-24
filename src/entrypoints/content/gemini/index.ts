// Gemini specific content script initialization
// TODO: Implement Gemini content script logic

import { Platform } from '@/shared/types/platform';
import { ExtensionMessage } from '@/shared/types/messages';
import { scanLibrary } from './tasks/scan-library';
import { apiScanner } from './tasks/scan-api';
import { chatContentScanner } from './tasks/scan-chat-content';

import { syncConversations } from './tasks/sync-conversations';
import { detectAccount } from '../shared/detect-account';

/**
 * Initialize Gemini content script
 * This handles all Gemini specific logic
 */
export async function initGemini() {
  console.log('Better Sidebar: Gemini Content Script Initialized');

  // Profile check: detect current account and verify against profile (non-blocking)
  (async () => {
    try {
      const username = await detectAccount(Platform.GEMINI);
      if (username) {
        const response = await browser.runtime.sendMessage({
          type: 'DETECT_ACCOUNT',
          payload: { platform: Platform.GEMINI, username },
        });
        if (response?.data?.action === 'unbound') {
          (window as any).__PROFILE_UNBOUND_PENDING = response.data;
          window.dispatchEvent(
            new CustomEvent('PROFILE_ACCOUNT_UNBOUND', {
              detail: response.data,
            }),
          );
        } else if (response?.data?.action === 'switched') {
          console.log(
            'Better Sidebar: Profile switched to',
            response.data.profileName,
          );
        }
      }
    } catch (e) {
      console.warn(
        'Better Sidebar: Profile check failed, continuing anyway',
        e,
      );
    }
  })();

  // Start API Scanner immediately to catch early requests
  apiScanner.start();
  chatContentScanner.start();

  // Inject Main World Script
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('/main-world.js');
  script.type = 'module';
  script.onload = () => {
    script.remove();
  };
  (document.head || document.documentElement).prepend(script);

  // Auto-start sync when page is fully loaded
  const startSync = () => {
    syncConversations().catch((err) => {
      console.error('Better Sidebar: Auto-sync failed', err);
    });
  };

  if (document.readyState === 'complete') {
    startSync();
  } else {
    window.addEventListener('load', startSync);
  }

  window.addEventListener('GEMINI_CHAT_DELETE', async (event: any) => {
    const { id } = event.detail;
    console.log(
      'Better Sidebar: Content Script received GEMINI_CHAT_DELETE',
      id,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'DELETE_CONVERSATION',
        payload: { id },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle GEMINI_CHAT_DELETE', e);
    }
  });

  // Message listener for library scan
  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'START_LIBRARY_SCAN') {
        scanLibrary()
          .then((count) => {
            sendResponse({ success: true, data: { count } });
          })
          .catch((err) => {
            sendResponse({ success: false, error: err.message });
          });
        return true;
      }
      // if (message.type === 'START_SYNC_CONVERSATIONS') {
      //   syncConversations()
      //     .then((count) => {
      //       sendResponse({ success: true, data: { count } });
      //     })
      //     .catch((err) => {
      //       sendResponse({ success: false, error: err.message });
      //     });
      //   return true;
      // }
    },
  );
}
