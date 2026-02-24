import type { ExtensionMessage } from '@/shared/types/messages';
import { handleMessage } from './message-handler';

console.log(
  'Better Sidebar for Gemini & AI Studio: Background Service Worker Starting...',
);

export default defineBackground(() => {
  const setupUninstallUrl = async () => {
    try {
      const manifest = browser.runtime.getManifest();
      const version = manifest.version;
      const platformInfo = await browser.runtime.getPlatformInfo();
      const os = platformInfo.os;

      const uninstallUrl = `https://docs.google.com/forms/d/e/1FAIpQLScsdAGOY7EccBP-RRyE-x-8kZWYMHMaL4dgREPLeuvJRnLtlA/viewform?usp=pp_url&entry.576566957=${version}&entry.1274489181=${os}`;

      await browser.runtime.setUninstallURL(uninstallUrl);
    } catch (error) {
      console.error('[Background] Failed to set uninstall URL:', error);
    }
  };

  browser.runtime.onInstalled.addListener((details) => {
    setupUninstallUrl();
    if (details.reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }
  });

  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse) => {
      console.log(
        '[Background] Received message:',
        message.type,
        sender.tab ? `from tab ${sender.tab.id}` : 'from extension',
      );
      handleMessage(message, sender).then(sendResponse);
      return true;
    },
  );
});
