import i18n from '@/locale/i18n';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';

/**
 * Gives the background time to finish `runtime.reload()` before this page reloads, so the
 * fresh load picks up the new content scripts rather than racing the restart.
 */
const PAGE_RELOAD_DELAY_MS = 1500;

/** Storage key for "don't show the update toast again for this version". */
export const DISMISSED_UPDATE_KEY = 'dismissedExtensionUpdate';

export type ApplyUpdateResult = 'cancelled' | 'not_ready' | 'failed' | 'reloading';

/**
 * Confirm, ask the background to reload into the downloaded update, then reload this page.
 * Shared by the About page button and the update toast.
 */
export async function applyExtensionUpdate(
  version?: string,
  /** Called once the user confirms, before the (up to 30s) wait — for a busy state. */
  onConfirmed?: () => void,
): Promise<ApplyUpdateResult> {
  const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
  const confirmed = await modal.confirm({
    title: t('about.update.confirmTitle', { version: version ?? '' }),
    content: t('about.update.confirmContent'),
    confirmText: t('about.update.updateNow'),
  });
  if (!confirmed) return 'cancelled';
  onConfirmed?.();

  try {
    const res = await browser.runtime.sendMessage({ type: 'APPLY_EXTENSION_UPDATE' });
    if (!res?.success) {
      if (res?.error === 'not_ready') {
        toast.info(t('about.update.notReady'));
        return 'not_ready';
      }
      throw new Error(res?.error);
    }
    // The extension is restarting; this content script is about to lose its context.
    setTimeout(() => window.location.reload(), PAGE_RELOAD_DELAY_MS);
    return 'reloading';
  } catch (err) {
    // Another tab already applied the update: this script is orphaned, and a page
    // reload is exactly what brings in the new version.
    if (String((err as Error)?.message).includes('Extension context invalidated')) {
      window.location.reload();
      return 'reloading';
    }
    console.error('[ExtensionUpdate] Apply failed:', err);
    toast.error(t('about.update.applyFailed'));
    return 'failed';
  }
}
