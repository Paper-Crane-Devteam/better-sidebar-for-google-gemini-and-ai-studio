// Overlay content script entry: routes to platform-specific layout

import '@/shared/lib/iconify-bundle';
import mainStyles from '@/index.scss?inline';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { isPlatformEnabled } from '@/shared/lib/platform-enabled-store';
import { warnIfNoAccount } from './shared/lib/account-guard';
import { initPegasusTransport } from '@webext-pegasus/transport/content-script';
import { getPegasusStoreReady } from '@/shared/lib/pegasus-store';
import { i18nReady } from '@/locale/i18n';
import { frameRole } from '@/shared/web-agent/contracts';

export default defineContentScript({
  matches: [
    'https://aistudio.google.com/*',
    'https://gemini.google.com/*',
    // 'https://chatgpt.com/*',
  ],
  cssInjectionMode: 'ui',
  // The Web Agent side panel hosts Gemini in an iframe; nothing else framed gets an overlay.
  allFrames: true,
  async main() {
    if (frameRole() === 'other') return;
    initPegasusTransport({
      allowWindowMessagingForNamespace: 'better-sidebar',
    });
    await getPegasusStoreReady();
    const platform = detectPlatform();
    console.log(
      `Better Sidebar: Overlay Content Script Initialized (Platform: ${platform})`,
    );

    // Check if this platform is enabled in options
    const enabled = await isPlatformEnabled(platform);
    if (!enabled) {
      console.log(
        `Better Sidebar: Platform ${platform} is disabled, skipping overlay initialization`,
      );
      return;
    }

    // Non-English locales are fetched at runtime (see @/locale/i18n). The store
    // is ready by now, so this covers its saved language, not just the browser's.
    await i18nReady();

    // Non-blocking: toast a sign-in hint if no account can be detected.
    warnIfNoAccount(platform);

    // Backstop for the background renewal alarm, in case the worker was asleep or
    // the alarm was dropped. Throttled through shared storage, so opening many
    // tabs does not mean many requests.
    const { scheduleRenewalCheckFromPage } = await import(
      '@/shared/lib/license-renewal'
    );
    scheduleRenewalCheckFromPage();

    switch (platform) {
      case Platform.AI_STUDIO: {
        const { initAiStudioOverlay } = await import('./aistudio/Layout');
        await initAiStudioOverlay(mainStyles);
        break;
      }
      case Platform.GEMINI: {
        const { initGeminiOverlay } = await import('./gemini/Layout');
        await initGeminiOverlay(mainStyles);
        // A message-sync run normally stays in one page for its whole length, but it
        // outlives the tab being closed and the page loads it falls back to. Picks up
        // an unfinished run (with a stop button), or reports one that just finished.
        const { resumeSyncRun } = await import(
          './shared/modules/agent-loop/tools/sync'
        );
        resumeSyncRun().catch((e) =>
          console.error('Better Sidebar: sync run resume failed', e),
        );
        break;
      }
      // case Platform.CHATGPT: {
      //   const { initChatGPTOverlay } = await import('./chatgpt/Layout');
      //   await initChatGPTOverlay(mainStyles);
      //   break;
      // }
      default:
        console.warn(
          `Better Sidebar: Unknown platform (${platform}), overlay not loaded`,
        );
    }

    // Text the agent's `open_new_chat` left for this tab, if this tab is one it opened.
    // After the overlay is up so the toast has somewhere to render.
    const { applyPendingComposerPrefill } = await import('./shared/lib/composer-prefill');
    applyPendingComposerPrefill(platform).catch((e) =>
      console.error('Better Sidebar: composer prefill failed', e),
    );
  },
});
