// Content script entry point - routes to platform-specific implementations

import { detectPlatform, Platform } from '@/shared/types/platform';
import { isPlatformEnabled } from '@/shared/lib/platform-enabled-store';
import { initPegasusTransport } from '@webext-pegasus/transport/content-script';
import { getPegasusStoreReady, mirrorPegasusStoreFromStorage } from '@/shared/lib/pegasus-store';

import { initAiStudio } from './aistudio';
import { initGemini } from './gemini';
import { initChatGPT } from './chatgpt';
import {
  frameRole,
  PANEL_HASH_PARAM,
  PANEL_TOKEN_STORAGE_KEY,
} from '@/shared/web-agent/contracts';

/**
 * In the Web Agent side panel, take the session token out of the URL hash.
 *
 * Here, at `document_start`, because Gemini rewrites its URL as it boots and the hash would
 * not survive until the overlay runs. Stripped right away so it never ends up in history or
 * in a link the user copies; `sessionStorage` keeps it across reloads of the frame.
 */
function capturePanelToken() {
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get(PANEL_HASH_PARAM);
  if (!token) return;
  try { sessionStorage.setItem(PANEL_TOKEN_STORAGE_KEY, token); } catch { /* storage blocked */ }
  history.replaceState(history.state, '', location.pathname + location.search);
}

export default defineContentScript({
  matches: [
    'https://aistudio.google.com/*',
    'https://gemini.google.com/*',
    // 'https://chatgpt.com/*',
  ],
  runAt: 'document_start',
  // For the Web Agent side panel, which hosts Gemini in an iframe. Every other frame on these
  // pages is turned away on the first line of `main`.
  allFrames: true,
  async main() {
    const role = frameRole();
    if (role === 'other') return;
    if (role === 'panel') capturePanelToken();
    const platform = detectPlatform();
    console.log(
      `Better Sidebar: Content Script Initialized (Platform: ${platform})`,
    );

    // Check if this platform is enabled in options
    const enabled = await isPlatformEnabled(platform);
    if (!enabled) {
      console.log(
        `Better Sidebar: Platform ${platform} is disabled, skipping content script initialization`,
      );
      return;
    }

    if (role === 'panel') {
      // Pegasus routes by tab id and the side panel has none; see `mirrorPegasusStoreFromStorage`.
      void mirrorPegasusStoreFromStorage();
    } else {
      initPegasusTransport({
        allowWindowMessagingForNamespace: 'better-sidebar',
      });
      getPegasusStoreReady();
    }

    switch (platform) {
      case Platform.AI_STUDIO: {
        initAiStudio();
        break;
      }
      case Platform.GEMINI: {
        initGemini();
        break;
      }
      case Platform.CHATGPT: {
        initChatGPT();
        break;
      }
      default:
        console.warn(
          `Better Sidebar: Unknown platform (${platform}), no content script loaded`,
        );
    }
  },
});
