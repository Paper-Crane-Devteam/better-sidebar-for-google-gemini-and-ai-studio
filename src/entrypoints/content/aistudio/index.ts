// AI Studio specific content script initialization

import { ExtensionMessage } from '@/shared/types/messages';
import { scanLibrary } from './tasks/scan-library';
import { autoSyncHandler } from './tasks/scan-library/sync-library';
import { apiScanner } from './tasks/scan-library/scan-api';
import { promptCreateScanner } from './tasks/scan-prompt-create';
import { Platform } from '@/shared/types/platform';
import { detectAccount } from '../shared/detect-account';

/**
 * Initialize AI Studio content script
 * This handles all AI Studio specific logic
 */
export async function initAiStudio() {
  console.log('Better Sidebar: AI Studio Content Script Initialized');

  // Profile check: detect current account and verify against profile (non-blocking)
  (async () => {
    try {
      const username = await detectAccount(Platform.AI_STUDIO);
      if (username) {
        const response = await browser.runtime.sendMessage({
          type: 'DETECT_ACCOUNT',
          payload: { platform: Platform.AI_STUDIO, username },
        });
        if (response?.data?.action === 'unbound') {
          // Store on window in case overlay hasn't mounted yet (race condition)
          (window as any).__PROFILE_UNBOUND_PENDING = response.data;
          // Also dispatch event for already-mounted listeners
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

  // Start auto-sync handler to automatically sync conversations as they load
  autoSyncHandler.start();
  apiScanner.start();
  // Register early so it runs before the overlay's ExplorerTab handler,
  // ensuring the conversation row exists before a MOVE_CONVERSATION is issued.
  promptCreateScanner.start();

  // Inject Main World Script
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('/main-world.js');
  script.type = 'module';
  script.onload = () => {
    script.remove();
  };
  (document.head || document.documentElement).prepend(script);

  // New Event Listener for parsed chat data
  window.addEventListener('AI_STUDIO_RESPONSE', async (event: any) => {
    const data = event.detail;
    console.log(
      'Better Sidebar: Content Script received AI_STUDIO_RESPONSE',
      data,
    );

    try {
      await browser.runtime.sendMessage({
        type: 'SAVE_CONVERSATION',
        payload: {
          id: data.id,
          title: data.title,
          external_id: data.id,
          external_url: `https://aistudio.google.com/prompts/${data.id}`,
          model_name: data.model_name,
          last_active_at: data.updated_at,
          messages: data.messages,
          platform: Platform.AI_STUDIO,
        },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle AI_STUDIO_RESPONSE', e);
    }
  });

  window.addEventListener('AI_STUDIO_PROMPT_UPDATE', async (event: any) => {
    const { id, title, updated_at } = event.detail;
    console.log(
      'Better Sidebar: Content Script received AI_STUDIO_PROMPT_UPDATE',
      id,
      title,
      updated_at,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'UPDATE_CONVERSATION',
        payload: { id, title, updated_at },
      });
    } catch (e) {
      console.error(
        'Better Sidebar: Failed to handle AI_STUDIO_PROMPT_UPDATE',
        e,
      );
    }
  });

  window.addEventListener('AI_STUDIO_PROMPT_DELETE', async (event: any) => {
    const { id } = event.detail;
    console.log(
      'Better Sidebar: Content Script received AI_STUDIO_PROMPT_DELETE',
      id,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'DELETE_CONVERSATION',
        payload: { id },
      });
    } catch (e) {
      console.error(
        'Better Sidebar: Failed to handle AI_STUDIO_PROMPT_DELETE',
        e,
      );
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
    },
  );
}
