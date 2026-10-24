import type { ExtensionMessage } from '@/shared/types/messages';
import { handleMessage } from './message-handler';
import { initPegasusTransport } from '@webext-pegasus/transport/background';
import { initPegasusBackendStore } from '@/shared/lib/pegasus-store';
import { ensureDbReady } from './db';
import { seedDefaultPrompts } from './seed-prompts';
import {
  registerAutoSyncAlarm,
  handleAutoSyncAlarm,
  flushPendingSync,
  onSyncingChange,
} from '@/shared/lib/gdrive';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import {
  getActiveDbName,
  setActiveTabId,
} from './tab-profile-map';
import { notifyDataUpdated } from './notify';
import { purgeExpiredTemporaryChats } from '@/shared/lib/temporary-chat-cleanup';
import {
  registerLicenseRenewalAlarm,
  handleLicenseRenewalAlarm,
  LICENSE_RENEWAL_ALARM,
} from '@/shared/lib/license-renewal';
import { trace } from '@/shared/lib/trace';
import { TRIAL_WELCOME_PENDING_KEY } from '@/shared/lib/trial-store';
import { initWebAgent } from './handlers/web-agent';
import {
  registerUpdateAvailableListener,
  registerUpdateCheckAlarm,
  handleUpdateCheckAlarm,
  UPDATE_CHECK_ALARM,
} from './handlers/extension-update';

console.log(
  'Better Sidebar for Gemini & AI Studio: Background Service Worker Starting...',
);

export default defineBackground(() => {
  initPegasusTransport();
  initPegasusBackendStore();

  // Keeps the 14-day validation window rolling forward. Registered outside the
  // DB-ready chain below because license renewal doesn't touch the database and
  // must not be skipped when the DB fails to open.
  registerLicenseRenewalAlarm();

  // Remembers a downloaded store update so the About page can offer "Update now".
  registerUpdateAvailableListener();
  registerUpdateCheckAlarm();
  // Side panel, context menu, frame rule and debugger listeners. Chrome only; a no-op elsewhere.
  initWebAgent();

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
      // New installs only: the overlay shows the Power Pack trial welcome once.
      browser.storage.local
        .set({ [TRIAL_WELCOME_PENDING_KEY]: true })
        .catch((err) => console.error('[Background] Failed to flag trial welcome:', err));
      // Seed default prompts after DB is ready
      ensureDbReady()
        .then(() => seedDefaultPrompts())
        .catch((err) =>
          console.error('[Background] Prompt seeding skipped:', err),
        );
    }
  });

  browser.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse) => {
      trace(
        '[Background] Received message:',
        message.type,
        sender.tab ? `from tab ${sender.tab.id}` : 'from extension',
      );
      handleMessage(message, sender).then(sendResponse);
      return true;
    },
  );

  // Track active tab for auto-sync profile resolution.
  // When switching tabs, flush any pending debounced upload first
  // so it runs against the OLD tab's profile before we switch.
  browser.tabs.onActivated.addListener((activeInfo) => {
    flushPendingSync(() => notifyDataUpdated()).then(() => {
      setActiveTabId(activeInfo.tabId);
    });
  });

  // Register auto-sync alarm after DB is ready
  ensureDbReady()
    .then(() => {
      registerAutoSyncAlarm();

      // Wire syncing state to pegasus store so UI can show loading indicator
      onSyncingChange((syncing) => {
        usePegasusStore.getState().setGdriveSyncing(syncing);
      });

      // Expired Gemini temporary chats are invisible rows nobody can ever reach,
      // so they are swept here rather than on demand. The sweep self-throttles, so
      // calling it on every worker startup is cheap.
      return purgeExpiredTemporaryChats().catch((err) =>
        console.error('[Background] Temporary chat purge skipped:', err),
      );
    })
    .catch((err) =>
      console.error('[Background] Auto-sync setup skipped:', err),
    );

  // Handle alarm events for periodic auto-sync.
  // Respects the gdriveAutoSync setting from pegasus store.
  browser.alarms.onAlarm.addListener((alarm) => {
    // Handled first and returned early: the auto-sync branch below bails out when
    // gdriveAutoSync is off, which would otherwise swallow this alarm entirely.
    if (alarm.name === LICENSE_RENEWAL_ALARM) {
      handleLicenseRenewalAlarm(alarm).catch((err) =>
        console.error('[Background] License renewal skipped:', err),
      );
      return;
    }

    // Same reason: no DB involved, and the auto-sync gate below must not swallow it.
    if (alarm.name === UPDATE_CHECK_ALARM) {
      handleUpdateCheckAlarm().catch((err) =>
        console.error('[Background] Update check skipped:', err),
      );
      return;
    }

    ensureDbReady()
      .then(() => {
        const { gdriveAutoSync } = usePegasusStore.getState();
        if (!gdriveAutoSync) {
          console.log('[Background] Auto-sync disabled, skipping alarm');
          return;
        }
        handleAutoSyncAlarm(alarm, getActiveDbName, () => notifyDataUpdated());
      })
      .catch((err) =>
        console.error('[Background] Auto-sync alarm skipped:', err),
      );
  });
});
