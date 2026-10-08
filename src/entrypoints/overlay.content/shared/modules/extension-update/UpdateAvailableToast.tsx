import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Z_INDEX } from '@/shared/lib/z-index';
import { applyExtensionUpdate, DISMISSED_UPDATE_KEY } from './apply-update';

/**
 * Bottom-right "new version ready" toast.
 *
 * Shown when the background has a store update downloaded: asked once on load (the
 * download may have landed before this page opened) and pushed live via
 * `EXTENSION_UPDATE_READY`. Closing it hides that version for good; the About page
 * button still works.
 */
export const UpdateAvailableToast: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const offer = async (next: string | null | undefined) => {
      if (!next) return;
      const dismissed = (await browser.storage.local.get(DISMISSED_UPDATE_KEY))[
        DISMISSED_UPDATE_KEY
      ];
      if (!cancelled && dismissed !== next) setVersion(next);
    };

    browser.runtime
      .sendMessage({ type: 'GET_PENDING_EXTENSION_UPDATE' })
      .then((res) => offer(res?.success ? res.data?.version : null))
      .catch(() => {});

    const listener = (message: any) => {
      if (message?.type === 'EXTENSION_UPDATE_READY') offer(message.payload?.version);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      cancelled = true;
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  if (!version) return null;

  const dismiss = () => {
    browser.storage.local.set({ [DISMISSED_UPDATE_KEY]: version }).catch(() => {});
    setVersion(null);
  };

  const update = async () => {
    const outcome = await applyExtensionUpdate(version, () => setApplying(true));
    if (outcome !== 'reloading') setApplying(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl animate-in slide-in-from-bottom-5 fade-in duration-300"
      style={{
        zIndex: Z_INDEX.TOAST,
        backgroundColor: 'var(--panel-bg)',
        boxShadow: 'var(--shadow-panel)',
        color: 'var(--foreground)',
      }}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
        <Download className="w-4 h-4 text-primary" aria-hidden="true" />
      </div>
      <div className="text-xs font-medium pr-1">
        {t('about.update.toastTitle', { version })}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="h-7 px-2.5 text-xs font-semibold shrink-0 flex items-center gap-1.5"
        onClick={update}
        disabled={applying}
      >
        {applying && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
        {applying ? t('about.update.applying') : t('about.update.updateNow')}
      </Button>
      <button
        onClick={dismiss}
        disabled={applying}
        aria-label={t('about.update.dismiss')}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50 ml-1"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};
