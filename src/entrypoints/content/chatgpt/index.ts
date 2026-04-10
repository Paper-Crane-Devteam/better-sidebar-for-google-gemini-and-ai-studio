// ChatGPT specific content script initialization

import { Platform } from '@/shared/types/platform';
import { ExtensionMessage } from '@/shared/types/messages';
import { apiScanner } from './tasks/scan-api';
import { scanConversations } from './tasks/scan-conversations';
import { syncConversations } from './tasks/sync-conversations';
import { detectAccount } from '../shared/detect-account';

/**
 * Initialize ChatGPT content script
 * This handles all ChatGPT specific logic
 */
export async function initChatGPT() {
  console.log('Better Sidebar: ChatGPT Content Script Initialized');

  // Profile check: detect current account and verify against profile
  // Returns true if profile is resolved and sync is safe
  const profileReady = (async (): Promise<boolean> => {
    try {
      const username = await detectAccount(Platform.CHATGPT);
      if (username) {
        const response = await browser.runtime.sendMessage({
          type: 'DETECT_ACCOUNT',
          payload: { platform: Platform.CHATGPT, username },
        });
        if (response?.data?.action === 'unbound') {
          (window as any).__PROFILE_UNBOUND_PENDING = response.data;
          window.dispatchEvent(
            new CustomEvent('PROFILE_ACCOUNT_UNBOUND', {
              detail: response.data,
            }),
          );
          return false;
        } else if (response?.data?.action === 'switched') {
          console.log(
            'Better Sidebar: Profile switched to',
            response.data.profileName,
          );
        }
      }
      return true;
    } catch (e) {
      console.warn(
        'Better Sidebar: Profile check failed, continuing anyway',
        e,
      );
      return true;
    }
  })();

  // Start API Scanner immediately to catch early requests (no DB dependency)
  apiScanner.start();

  // Inject Main World Script
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('/main-world.js');
  script.type = 'module';
  script.onload = () => {
    script.remove();
  };
  (document.head || document.documentElement).prepend(script);

  // Auto-start sync when page is fully loaded AND profile DB is resolved
  const startSync = async () => {
    const canSync = await profileReady;
    if (!canSync) {
      console.log(
        'Better Sidebar: Skipping sync — profile not resolved (unbound account)',
      );
      return;
    }
    syncConversations().catch((err) => {
      console.error('Better Sidebar: Auto-sync failed', err);
    });
  };

  if (document.readyState === 'complete') {
    startSync();
  } else {
    window.addEventListener('load', () => startSync());
  }

  // Listen for new conversation creation from main-world script
  window.addEventListener(
    'BETTER_SIDEBAR_PROMPT_CREATE',
    async (event: any) => {
      const data = event.detail;
      console.log(
        'Better Sidebar: Content Script received BETTER_SIDEBAR_PROMPT_CREATE',
        data,
      );

      try {
        await browser.runtime.sendMessage({
          type: 'SAVE_CONVERSATION',
          payload: {
            id: data.id,
            title: data.title,
            external_id: data.id,
            external_url: `https://chatgpt.com/c/${data.id}`,
            last_active_at: data.created_at ?? Math.floor(Date.now() / 1000),
            created_at: data.created_at,
            messages: data.messages,
          },
        });
      } catch (e) {
        console.error(
          'Better Sidebar: Failed to handle BETTER_SIDEBAR_PROMPT_CREATE',
          e,
        );
      }
    },
  );

  // Listen for follow-up messages in existing conversations
  window.addEventListener(
    'CHATGPT_CHAT_CONTENT_RESPONSE',
    async (event: any) => {
      const data = event.detail;
      console.log(
        'Better Sidebar: Content Script received CHATGPT_CHAT_CONTENT_RESPONSE',
        data,
      );

      try {
        // Upsert messages for the conversation
        await browser.runtime.sendMessage({
          type: 'UPSERT_MESSAGES',
          payload: {
            conversationId: data.conversationId,
            messages: data.messages,
          },
        });
      } catch (e) {
        console.error(
          'Better Sidebar: Failed to handle CHATGPT_CHAT_CONTENT_RESPONSE',
          e,
        );
      }
    },
  );

  window.addEventListener('CHATGPT_CHAT_DELETE', async (event: any) => {
    const { id } = event.detail;
    console.log(
      'Better Sidebar: Content Script received CHATGPT_CHAT_DELETE',
      id,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'DELETE_CONVERSATION',
        payload: { id },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle CHATGPT_CHAT_DELETE', e);
    }
  });

  // Message listener for scan operations
  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'START_LIBRARY_SCAN') {
        scanConversations()
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
