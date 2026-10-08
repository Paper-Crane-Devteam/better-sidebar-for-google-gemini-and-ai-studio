import { useEffect, useCallback } from 'react';
import { CURRENT_VERSION, hasSeenMajorVersion } from './changelog';
import { useWhatsNewStore } from './whats-new-store';

const STORAGE_KEY = 'last_seen_version';

export const useWhatsNew = () => {
  const isOpen = useWhatsNewStore((s) => s.isOpen);
  const showAll = useWhatsNewStore((s) => s.showAll);
  const isToastOpen = useWhatsNewStore((s) => s.isToastOpen);
  const open = useWhatsNewStore((s) => s.open);
  const close = useWhatsNewStore((s) => s.close);
  const openToast = useWhatsNewStore((s) => s.openToast);
  const closeToast = useWhatsNewStore((s) => s.closeToast);
  const setShowAll = useWhatsNewStore((s) => s.setShowAll);

  const markAsSeen = useCallback(async () => {
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: CURRENT_VERSION });
    } catch (error) {
      console.error('Failed to save version:', error);
    }
  }, []);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const result = await browser.storage.local.get(STORAGE_KEY);
        const lastSeenVersion = result[STORAGE_KEY] as string | undefined;

        // Fresh install: no version has ever been recorded. A brand-new user has
        // nothing to compare against, so skip the changelog and just record the
        // current version as the baseline for future updates.
        if (lastSeenVersion === undefined) {
          await browser.storage.local.set({ [STORAGE_KEY]: CURRENT_VERSION });
          return;
        }

        if (lastSeenVersion !== CURRENT_VERSION) {
          // If the user hasn't seen the major version (e.g. new install or older version),
          // show the major version modal directly. Otherwise, show the minor update toast.
          if (!hasSeenMajorVersion(lastSeenVersion, CURRENT_VERSION)) {
            open({ showAll: false });
          } else {
            openToast();
          }
        }
      } catch (error) {
        console.error('Failed to check version for WhatsNew:', error);
      }
    };

    checkVersion();
  }, []);

  return {
    isOpen,
    showAll,
    isToastOpen,
    setIsOpen: (val: boolean) => (val ? open() : close()),
    markAsSeen,
    openWhatsNew: open,
    closeWhatsNew: () => {
      close();
      markAsSeen();
    },
    openToast,
    closeToast: () => {
      closeToast();
      markAsSeen();
    },
    setShowAll,
  };
};


