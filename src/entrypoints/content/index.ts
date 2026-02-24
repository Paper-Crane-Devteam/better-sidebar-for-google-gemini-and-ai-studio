// Content script entry point - routes to platform-specific implementations

import { detectPlatform, Platform } from '@/shared/types/platform';
import { isPlatformEnabled } from '@/shared/lib/platform-enabled-store';
import { initAiStudio } from './aistudio';
import { initGemini } from './gemini';
import { initChatGPT } from './chatgpt';

export default defineContentScript({
  matches: [
    'https://aistudio.google.com/*',
    'https://gemini.google.com/*',
    // 'https://chatgpt.com/*',
  ],
  runAt: 'document_start',
  async main() {
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
