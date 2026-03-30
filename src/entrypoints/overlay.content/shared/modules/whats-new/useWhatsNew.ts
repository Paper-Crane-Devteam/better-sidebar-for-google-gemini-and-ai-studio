import { useState, useEffect } from 'react';
import { CURRENT_VERSION } from './changelog';

const STORAGE_KEY = 'last_seen_version';

export const useWhatsNew = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      // debug
      // setIsOpen(true);
      try {
        const result = await browser.storage.local.get(STORAGE_KEY);
        const lastSeenVersion = result[STORAGE_KEY];

        if (lastSeenVersion !== CURRENT_VERSION) {
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Failed to check version for WhatsNew:', error);
      }
    };

    checkVersion();
  }, []);

  const markAsSeen = async () => {
    setIsOpen(false);
    try {
      await browser.storage.local.set({ [STORAGE_KEY]: CURRENT_VERSION });
    } catch (error) {
      console.error('Failed to save version:', error);
    }
  };

  return {
    isOpen,
    setIsOpen, // Exposed for manual toggling if needed (e.g. from "About" menu)
    markAsSeen,
  };
};
