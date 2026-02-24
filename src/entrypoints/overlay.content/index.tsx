// Overlay content script entry: routes to platform-specific layout

import mainStyles from '@/index.scss?inline';
import { detectPlatform, Platform } from '@/shared/types/platform';
import '@/locale/i18n';

export default defineContentScript({
  matches: [
    'https://aistudio.google.com/*',
    'https://gemini.google.com/*',
    // 'https://chatgpt.com/*',
  ],
  cssInjectionMode: 'ui',
  async main() {
    const platform = detectPlatform();
    console.log(
      `Better Sidebar: Overlay Content Script Initialized (Platform: ${platform})`,
    );

    switch (platform) {
      case Platform.AI_STUDIO: {
        const { initAiStudioOverlay } = await import('./aistudio/Layout');
        await initAiStudioOverlay(mainStyles);
        break;
      }
      case Platform.GEMINI: {
        const { initGeminiOverlay } = await import('./gemini/Layout');
        await initGeminiOverlay(mainStyles);
        break;
      }
      case Platform.CHATGPT: {
        const { initChatGPTOverlay } = await import('./chatgpt/Layout');
        await initChatGPTOverlay(mainStyles);
        break;
      }
      default:
        console.warn(
          `Better Sidebar: Unknown platform (${platform}), overlay not loaded`,
        );
    }
  },
});
