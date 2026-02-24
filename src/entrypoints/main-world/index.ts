// Main-world script entry: routes to platform-specific interceptors
// Note: main-world runs in page context; use detectPlatform() from window.location
// Note: The content script sets window.__BETTER_SIDEBAR_DISABLED when the platform
// is disabled. However, since the main-world script is injected by the content script,
// if the content script skips injection (early return), this script won't run at all.

import { detectPlatform, Platform } from '@/shared/types/platform';
import { initAiStudioInterceptors } from './aistudio';
import { initGeminiInterceptors } from './gemini';
import { initChatGPTInterceptors } from './chatgpt';

export default defineUnlistedScript(() => {
  const platform = detectPlatform();
  console.log(`Better Sidebar: Main World Script Initialized (Platform: ${platform})`);

  switch (platform) {
    case Platform.AI_STUDIO: {
      initAiStudioInterceptors();
      break;
    }
    case Platform.GEMINI: {
      initGeminiInterceptors();
      break;
    }
    case Platform.CHATGPT: {
      initChatGPTInterceptors();
      break;
    }
    default:
      console.warn(`Better Sidebar: Unknown platform (${platform}), no main-world interceptors loaded`);
  }
});
