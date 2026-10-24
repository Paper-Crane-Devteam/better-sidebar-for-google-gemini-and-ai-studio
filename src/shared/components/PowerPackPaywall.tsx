/**
 * PowerPackPaywall — A rich popup overlay that appears when users
 * try to use a Power Pack feature without a license.
 *
 * Renders at the same z-index level as GlobalToast (10000+) so it
 * floats above everything. Includes feature highlights, a purchase
 * CTA, and a dismiss button.
 */

import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { usePaywallStore } from '@/shared/lib/powerpack-paywall';
import { openPurchasePage, getPurchaseLinks } from '@/shared/lib/license-links';
import { useI18n } from '@/shared/hooks/useI18n';
import { cn } from '@/shared/lib/utils/utils';
import { Z_INDEX } from '@/shared/lib/z-index';

const FEATURES: ReadonlyArray<{ icon: string; key: string; badge?: string }> = [
  { icon: 'fluent-color:bot-sparkle-24', key: 'ppFeatureSidebarAgent' },
  { icon: 'fluent-color:document-folder-24', key: 'ppFeatureWorkspaceAgent' },
  { icon: 'fluent-color:apps-24', key: 'ppFeatureBrowserAgent' },
  { icon: 'fluent-color:globe-24', key: 'ppFeatureWebAgent', badge: 'chromeOnly' },
  { icon: 'fluent-color:share-android-24', key: 'ppFeatureExport' },
];

export const PowerPackPaywall = () => {
  const { isOpen, featureName, close } = usePaywallStore();
  const { t, currentLanguage } = useI18n();

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const isChinese = currentLanguage?.startsWith('zh');

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
        className={cn(
          'relative w-full max-w-sm mx-4 rounded-2xl border-2 border-violet-500/40 shadow-2xl',
          'bg-background',
          'animate-in zoom-in-95 slide-in-from-bottom-4 duration-300',
        )}
      >
        {/* Decorative gradient background */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" />
        </div>

        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-3 right-3 z-10 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="relative p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <UIcon icon="fluent-color:premium-24" width={28} height={28} />
            <div>
              <h3 className="text-base font-bold tracking-tight">
                {t('paywall.title')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('paywall.subtitle')}
              </p>
            </div>
          </div>

          {/* Feature context — which feature triggered this */}
          {featureName && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10">
              <UIcon icon="fluent-color:bot-sparkle-24" width={14} height={14} className="shrink-0" />
              <p className="text-xs text-foreground">
                <span className="font-medium">{featureName}</span>
                {' '}{t('paywall.requiresPowerPack')}
              </p>
            </div>
          )}

          {/* Feature list */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('paywall.includedFeatures')}
            </p>
            {FEATURES.map(({ icon: iconName, key, badge }) => (
              <div key={key} className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
                  <UIcon icon={iconName} width={14} height={14} />
                </div>
                <span className="text-sm">{t(`packs.${key}`)}</span>
                {badge && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/15 text-violet-600 dark:text-violet-300 whitespace-nowrap">
                    {t(`packs.${badge}`)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={() => {
              openPurchasePage();
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
            {t('paywall.getPowerPack')}
          </button>

          {/* Secondary link */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <button
              onClick={() => {
                const links = getPurchaseLinks();
                window.open(isChinese ? links.afdianPp : links.gumroadPp, '_blank');
                close();
              }}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors underline underline-offset-2"
            >
              {isChinese ? '爱发电购买' : 'View on Gumroad'}
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>

          {/* Dismiss text */}
          <p className="text-center text-[11px] text-muted-foreground/70">
            {t('paywall.refundPolicy')} · {t('paywall.dismissHint')}
          </p>
        </div>
      </div>
    </div>
  );
};
