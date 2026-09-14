// Gemini specific content script initialization
// TODO: Implement Gemini content script logic

import { Platform } from '@/shared/types/platform';
import { ExtensionMessage } from '@/shared/types/messages';
import { scanLibrary } from './tasks/scan-library';
import { apiScanner } from './tasks/scan-api';
import { chatContentScanner } from './tasks/scan-chat-content';
import { gemCreationScanner } from './tasks/scan-gem-creation';
import { promptCreateScanner } from './tasks/scan-prompt-create';
import { scanGems } from './tasks/scan-gems';
import { notebookListScanner, scanNotebooks } from './tasks/scan-notebooks';

import { syncConversations } from './tasks/sync-conversations';
import { initImageProcessor } from './tasks/process-images';
import { detectAccount } from '../shared/detect-account';
import { getExternalUrl } from '@/entrypoints/overlay.content/shared/utils';
import i18n from '@/locale/i18n';

/**
 * Initialize Gemini content script
 * This handles all Gemini specific logic
 */
export async function initGemini() {
  console.log('Better Sidebar: Gemini Content Script Initialized');

  // Profile check: detect current account and verify against profile
  // Returns true if profile is resolved and sync is safe
  const profileReady = (async (): Promise<boolean> => {
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
          // Profile not resolved — don't sync to avoid writing to wrong DB
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
      return true; // On error, assume safe (legacy behavior)
    }
  })();

  // Start API Scanner immediately to catch early requests (no DB dependency)
  apiScanner.start();
  chatContentScanner.start();
  gemCreationScanner.start();
  promptCreateScanner.start();
  notebookListScanner.start();

  // Start image watermark processor (MutationObserver on img tags)
  initImageProcessor().catch((e) => {
    console.error('Better Sidebar: Image processor init failed', e);
  });

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
    syncConversations({ scroll: false }).catch((err) => {
      console.error('Better Sidebar: Auto-sync failed', err);
    });
  };

  if (document.readyState === 'complete') {
    startSync();
  } else {
    window.addEventListener('load', () => startSync());
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

  window.addEventListener('GEMINI_GEM_DELETE', async (event: any) => {
    const { id } = event.detail;
    console.log(
      'Better Sidebar: Content Script received GEMINI_GEM_DELETE',
      id,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'DELETE_GEM',
        payload: { id },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle GEMINI_GEM_DELETE', e);
    }
  });

  window.addEventListener('GEMINI_NOTEBOOK_DELETE', async (event: any) => {
    const { id } = event.detail;
    console.log(
      'Better Sidebar: Content Script received GEMINI_NOTEBOOK_DELETE',
      id,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'DELETE_NOTEBOOK',
        payload: { id },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle GEMINI_NOTEBOOK_DELETE', e);
    }
  });

  window.addEventListener('GEMINI_NOTEBOOK_RENAME', async (event: any) => {
    const { id, newName } = event.detail;
    console.log(
      'Better Sidebar: Content Script received GEMINI_NOTEBOOK_RENAME',
      id,
      newName,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'UPDATE_NOTEBOOK',
        payload: { id, updates: { name: newName } },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle GEMINI_NOTEBOOK_RENAME', e);
    }
  });

  window.addEventListener('GEMINI_NOTEBOOK_CREATED', async (event: any) => {
    const { id, name } = event.detail;
    if (!id) return;
    console.log(
      'Better Sidebar: Content Script received GEMINI_NOTEBOOK_CREATED',
      id,
      name,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'SAVE_NOTEBOOK',
        payload: {
          id,
          name: name || i18n.t('notebooks.untitledNotebook'),
          external_id: id,
          external_url: `https://gemini.google.com/notebook/notebooks%2F${id}`,
          platform: 'gemini',
        },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle GEMINI_NOTEBOOK_CREATED', e);
    }
  });

  /**
   * A branch is a brand new conversation, so it needs its own row or it stays
   * missing from the tree until a reload.
   *
   * `branched_from_conversation_id` rather than a resolved folder: placement is the
   * background's job (it already owns gem/notebook → inbox fallback), and it is the
   * only side that can read the parent row. Passing the lineage lets it put the
   * branch wherever the parent lives, which is where anyone would look for it.
   *
   * No messages here on purpose. The branch page load triggers the chat-content
   * endpoint, and that path already captures the transcript.
   */
  window.addEventListener('GEMINI_CHAT_BRANCH', async (event: any) => {
    const { id, title, createdAt, sourceConversationId, sourceTitle } = event.detail || {};
    if (!id) return;

    console.log(
      'Better Sidebar: Content Script received GEMINI_CHAT_BRANCH',
      id,
      'from',
      sourceConversationId,
    );

    try {
      await browser.runtime.sendMessage({
        type: 'SAVE_CONVERSATION',
        payload: {
          id,
          title: title || sourceTitle || i18n.t('common.untitled'),
          created_at: createdAt,
          updated_at: createdAt,
          last_active_at: createdAt,
          external_id: id,
          external_url: getExternalUrl(id),
          folder_id: null,
          messages: [],
          platform: 'gemini',
          branched_from_conversation_id: sourceConversationId || undefined,
        },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle GEMINI_CHAT_BRANCH', e);
    }
  });

  window.addEventListener('GEMINI_CHAT_RENAME', async (event: any) => {
    const { id, newName } = event.detail;
    console.log(
      'Better Sidebar: Content Script received GEMINI_CHAT_RENAME',
      id,
      newName,
    );
    try {
      await browser.runtime.sendMessage({
        type: 'UPDATE_CONVERSATION',
        payload: { id, title: newName },
      });
    } catch (e) {
      console.error('Better Sidebar: Failed to handle GEMINI_CHAT_RENAME', e);
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
      if (message.type === 'START_GEM_SCAN') {
        scanGems()
          .then((count) => {
            sendResponse({ success: true, data: { count } });
          })
          .catch((err) => {
            sendResponse({ success: false, error: err.message });
          });
        return true;
      }
      if (message.type === 'START_NOTEBOOK_SCAN') {
        scanNotebooks()
          .then((count) => {
            sendResponse({ success: true, data: { count } });
          })
          .catch((err) => {
            sendResponse({ success: false, error: err.message });
          });
        return true;
      }
      if (message.type === 'START_SYNC_CONVERSATIONS') {
        syncConversations({ scroll: true })
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
