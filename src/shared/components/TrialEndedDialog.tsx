/**
 * One-time prompt when a Power Pack trial ends: the 3-day install trial, or a
 * time-limited code (Reddit campaign, promo key).
 *
 * Two ways forward, a feedback form or buying, and a plain close. Shown once
 * per trial across every tab and surface: the "shown" flag is written to shared
 * storage before the dialog opens, and other tabs pick it up through the store's
 * storage sync.
 */
import { useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import { Z_INDEX } from '@/shared/lib/z-index';
import { isPowerPackUser, useLicenseStore } from '@/shared/lib/license-store';
import {
  LOCAL_TRIAL_PROMPT_ID,
  localTrialEndsAt,
  useTrialStore,
  waitForStoreHydration,
} from '@/shared/lib/trial-store';
import { openPurchasePage, TRIAL_FEEDBACK_FORM_URL } from '@/shared/lib/license-links';
import { usePaywallStore } from '@/shared/lib/powerpack-paywall';
import { useWhatsNewStore } from '@/entrypoints/overlay.content/shared/modules/whats-new/whats-new-store';
import { frameRole } from '@/shared/web-agent/contracts';

/** Let the page settle before interrupting. */
const FIRST_CHECK_DELAY_MS = 8_000;
/** Tabs stay open for days; catch a trial that ends while one is open. */
const RECHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Ended trials that haven't been prompted for yet. Empty while the user still
 * has Power Pack from anything (paid license, another trial).
 */
function pendingEndedTrials(): string[] {
  if (isPowerPackUser()) return [];

  const license = useLicenseStore.getState();
  const trial = useTrialStore.getState();
  const shown = new Set(trial.endPromptsShown);
  const now = Date.now();
  const pending: string[] = [];

  const codeEnded =
    !!license.token &&
    (license.lastRenewError === 'trial_expired' || (!!license.endsAt && now >= license.endsAt));
  if (codeEnded && license.token && !shown.has(license.token)) {
    pending.push(license.token);
  }

  const localEnd = localTrialEndsAt(trial);
  if (localEnd && now >= localEnd && !shown.has(LOCAL_TRIAL_PROMPT_ID)) {
    pending.push(LOCAL_TRIAL_PROMPT_ID);
  }

  return pending;
}

export const TrialEndedDialog = () => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // The Web Agent side panel hosts its own copy of the page; the tab is enough.
    if (frameRole() !== 'top') return;

    let cancelled = false;

    const check = async () => {
      await Promise.all([
        waitForStoreHydration(useTrialStore),
        waitForStoreHydration(useLicenseStore),
      ]);
      if (cancelled) return;
      // Don't stack on top of another dialog; try again on the next tick.
      if (usePaywallStore.getState().isOpen || useWhatsNewStore.getState().isOpen) return;

      const pending = pendingEndedTrials();
      if (pending.length === 0) return;

      // Claim before showing, so other tabs don't show it too. One prompt
      // covers every trial that has ended so far.
      useTrialStore.getState().markEndPromptsShown(pending);
      setIsOpen(true);
    };

    const first = setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    const interval = setInterval(() => void check(), RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const close = () => setIsOpen(false);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center animate-in fade-in-0 duration-200"
      style={{
        zIndex: Z_INDEX.MODAL,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-trial-ended-title"
        className={cn(
          'relative w-full max-w-sm mx-4 rounded-2xl border-2 border-violet-500/40 shadow-2xl',
          'bg-background',
          'animate-in zoom-in-95 slide-in-from-bottom-4 duration-300',
        )}
      >
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" />
        </div>

        <button
          type="button"
          onClick={close}
          aria-label={t('trial.close')}
          className="absolute top-3 right-3 z-10 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6 space-y-4">
          <div className="flex items-center gap-3">
            <UIcon icon="fluent-color:premium-24" width={28} height={28} />
            <div>
              <h3 id="bs-trial-ended-title" className="text-base font-bold tracking-tight">
                {t('trial.endedTitle')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('trial.endedDesc')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                window.open(TRIAL_FEEDBACK_FORM_URL, '_blank');
                close();
              }}
              className="w-full flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
            >
              <MessageSquare className="h-[18px] w-[18px] shrink-0 mt-0.5 text-violet-500" />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t('trial.feedback')}</span>
                <span className="block text-xs text-muted-foreground">{t('trial.feedbackHint')}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                openPurchasePage('power_pack');
                close();
              }}
              className={cn(
                'w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold',
                'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700',
                'text-white shadow-md shadow-violet-500/25 transition-all hover:shadow-lg hover:shadow-violet-500/30',
                'active:scale-[0.98]',
              )}
            >
              <UIcon icon="fluent-color:star-24" width={16} height={16} />
              {t('trial.buy')}
            </button>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/70">
            {t('paywall.refundPolicy')} · {t('paywall.dismissHint')}
          </p>
        </div>
      </div>
    </div>
  );
};
