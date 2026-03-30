import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalStore } from '@/shared/lib/modal';
import { useAppStore } from '@/shared/lib/store';
import { Info, ListTree } from 'lucide-react';

const STORAGE_KEY = 'last_seen_version';
const FIRST_INSTALL_PROMPTED_KEY = 'first_install_prompted';

export const FirstInstallPrompt = () => {
  const { t } = useTranslation();
  const open = useModalStore((state) => state.open);
  const close = useModalStore((state) => state.close);
  const stack = useModalStore((state) => state.stack);
  const setIsScanning = useAppStore((state) => state.setIsScanning);
  const [shouldPrompt, setShouldPrompt] = useState(false);

  // Check if this is a first install
  useEffect(() => {
    const check = async () => {
      try {
        const result = await browser.storage.local.get([STORAGE_KEY, FIRST_INSTALL_PROMPTED_KEY]);
        const isFirstInstall = result[STORAGE_KEY] === undefined;
        const alreadyPrompted = result[FIRST_INSTALL_PROMPTED_KEY] === true;
        if (isFirstInstall && !alreadyPrompted) {
          setShouldPrompt(true);
        }
      } catch (e) {
        console.error('FirstInstallPrompt: failed to check storage', e);
      }
    };
    check();
  }, []);

  // Wait for modal stack to be empty (what's new closed), then show prompt after 1s
  useEffect(() => {
    if (!shouldPrompt || stack.length > 0) return;

    const timer = setTimeout(() => {
      browser.storage.local.set({ [FIRST_INSTALL_PROMPTED_KEY]: true });
      open({
        id: 'first-install-scan-prompt',
        type: 'confirm',
        title: (
          <div className="flex items-center gap-2">
            <ListTree className="w-5 h-5 text-primary" />
            {t('firstInstall.title')}
          </div>
        ),
        content: (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('firstInstall.description')}
            </p>
            <p className="text-sm text-foreground">
              {t('firstInstall.detail')}
            </p>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{t('firstInstall.hint')}</span>
            </div>
          </div>
        ),
        confirmText: t('firstInstall.importAll'),
        cancelText: t('firstInstall.skip'),
        onConfirm: () => {
          setIsScanning(true);
          browser.runtime.sendMessage({ type: 'SCAN_LIBRARY' });
          close();
        },
        onCancel: () => {
          close();
        },
      });
      setShouldPrompt(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, [shouldPrompt, stack.length, open, close, t]);

  return null;
};
