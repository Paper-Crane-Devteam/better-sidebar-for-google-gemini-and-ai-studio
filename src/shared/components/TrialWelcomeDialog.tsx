/**
 * One-time welcome for brand-new installs: introduces what Better Sidebar does
 * for free, what Power Pack adds on top, and that the first 3 days of Power
 * Pack are already unlocked.
 *
 * Only shown when the background flagged a fresh install
 * (TRIAL_WELCOME_PENDING_KEY). Updated users never get the flag; they hear
 * about the trial from the changelog instead. On Gemini it waits until the
 * guided tour has been finished or skipped, so the two never overlap.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { FileText, FolderTree, Globe, LayoutGrid, Share2, X } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import { Z_INDEX } from '@/shared/lib/z-index';
import { hasLicensePowerPack, useLicenseStore } from '@/shared/lib/license-store';
import {
  TRIAL_WELCOME_PENDING_KEY,
  isLocalTrialActive,
  useTrialStore,
  waitForStoreHydration,
} from '@/shared/lib/trial-store';
import { usePaywallStore } from '@/shared/lib/powerpack-paywall';
import { useAppStore } from '@/shared/lib/store';
import { useWhatsNewStore } from '@/entrypoints/overlay.content/shared/modules/whats-new/whats-new-store';
import { GUIDED_TOUR_STORAGE_KEY } from '@/entrypoints/overlay.content/shared/modules/guided-tour/useGuidedTour';
import { frameRole } from '@/shared/web-agent/contracts';

/** Let the page settle before the first check. */
const FIRST_CHECK_DELAY_MS = 5_000;
/** Breathing room between the tour closing and this dialog opening. */
const AFTER_TOUR_DELAY_MS = 1_500;
/** Retry interval while another dialog is in the way. */
const RETRY_DELAY_MS = 5_000;

interface TrialWelcomeDialogProps {
  /** Wait for the guided tour to be finished or skipped (Gemini). */
  afterGuidedTour?: boolean;
}

type CheckResult = 'done' | 'wait-tour' | 'retry';

export const TrialWelcomeDialog = ({ afterGuidedTour = false }: TrialWelcomeDialogProps) => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // The Web Agent side panel hosts its own copy of the page; the tab is enough.
    if (frameRole() !== 'top') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async (): Promise<CheckResult> => {
      const keys = afterGuidedTour
        ? [TRIAL_WELCOME_PENDING_KEY, GUIDED_TOUR_STORAGE_KEY]
        : [TRIAL_WELCOME_PENDING_KEY];
      const stored = await browser.storage.local.get(keys);
      if (!stored[TRIAL_WELCOME_PENDING_KEY]) return 'done';
      if (afterGuidedTour && !stored[GUIDED_TOUR_STORAGE_KEY]) return 'wait-tour';

      await Promise.all([
        waitForStoreHydration(useTrialStore),
        waitForStoreHydration(useLicenseStore),
      ]);
      if (cancelled) return 'done';

      // Already has Power Pack, or the trial is somehow over: nothing to offer.
      if (hasLicensePowerPack(useLicenseStore.getState()) || !isLocalTrialActive()) {
        await browser.storage.local.remove(TRIAL_WELCOME_PENDING_KEY);
        return 'done';
      }

      if (usePaywallStore.getState().isOpen || useWhatsNewStore.getState().isOpen) {
        return 'retry';
      }

      // Claim before showing, so other tabs don't show it too.
      await browser.storage.local.remove(TRIAL_WELCOME_PENDING_KEY);
      if (!cancelled) setIsOpen(true);
      return 'done';
    };

    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const result = await check();
          if (!cancelled && result === 'retry') schedule(RETRY_DELAY_MS);
        } catch (err) {
          console.error('[TrialWelcome] Check failed:', err);
        }
      }, delay);
    };

    // The tour writes its key when finished or skipped; pick that up right away.
    const onStorageChanged = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (changes[GUIDED_TOUR_STORAGE_KEY]?.newValue) schedule(AFTER_TOUR_DELAY_MS);
    };
    if (afterGuidedTour) browser.storage.onChanged.addListener(onStorageChanged);

    schedule(FIRST_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (afterGuidedTour) browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [afterGuidedTour]);

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

  const openPackDetails = () => {
    useAppStore.getState().setSettingsOpen(true, 'supportpack');
    close();
  };

  const features: { icon: ReactNode; name: string; desc: string; note?: string }[] = [
    {
      icon: <FolderTree className="h-4 w-4" />,
      name: t('trial.welcome.sidebarAgentName'),
      desc: t('trial.welcome.sidebarAgentDesc'),
    },
    {
      icon: <FileText className="h-4 w-4" />,
      name: t('trial.welcome.workspaceAgentName'),
      desc: t('trial.welcome.workspaceAgentDesc'),
    },
    {
      icon: <LayoutGrid className="h-4 w-4" />,
      name: t('trial.welcome.browserAgentName'),
      desc: t('trial.welcome.browserAgentDesc'),
    },
    {
      icon: <Globe className="h-4 w-4" />,
      name: t('trial.welcome.webAgentName'),
      desc: t('trial.welcome.webAgentDesc'),
      note: t('trial.welcome.chromeOnly'),
    },
    {
      icon: <Share2 className="h-4 w-4" />,
      name: t('trial.welcome.exportName'),
      desc: t('trial.welcome.exportDesc'),
    },
  ];

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
        aria-labelledby="bs-trial-welcome-title"
        className={cn(
          'relative w-full max-w-md mx-4 rounded-2xl border-2 border-violet-500/40 shadow-2xl',
          'bg-background max-h-[90vh] flex flex-col',
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

        <div className="relative p-6 space-y-4 overflow-y-auto">
          <div className="flex items-start gap-3 pr-6">
            <UIcon icon="fluent-color:premium-24" width={28} height={28} className="shrink-0" />
            <h3 id="bs-trial-welcome-title" className="text-base font-bold tracking-tight leading-snug">
              {t('trial.welcome.title')}
            </h3>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>{t('trial.welcome.intro')}</p>
            <p>{t('trial.welcome.powerPack')}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
              {t('trial.welcome.unlockedTitle')}
            </p>
            <ul className="space-y-2">
              {features.map((f) => (
                <li key={f.name} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 text-violet-500">{f.icon}</span>
                  <span className="text-sm leading-snug">
                    <span className="font-medium">{f.name}</span>
                    {f.note && (
                      <span className="ml-1.5 inline-block rounded px-1.5 py-px text-[10px] font-medium align-middle bg-muted text-muted-foreground">
                        {f.note}
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground mt-0.5">{f.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2 leading-relaxed">
            {t('trial.welcome.reassurance')}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={openPackDetails}
              className="flex-1 h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/60 transition-colors"
            >
              {t('trial.welcome.details')}
            </button>
            <button
              type="button"
              onClick={close}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-semibold',
                'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700',
                'text-white shadow-md shadow-violet-500/25 transition-all hover:shadow-lg hover:shadow-violet-500/30',
                'active:scale-[0.98]',
              )}
            >
              {t('trial.welcome.start')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
