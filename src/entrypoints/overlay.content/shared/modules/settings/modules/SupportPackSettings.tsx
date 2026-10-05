import React, { useCallback, useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import { Button } from '@/shared/components/ui/button';
import {
  Check,
  Loader2,
  ExternalLink,
  KeyRound,
  ShoppingCart,
  AlertTriangle,
  RefreshCw,
  LogOut,
} from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  useLicenseStore,
  isLicenseValid,
  isLicenseInGracePeriod,
  type LicenseTier,
} from '@/shared/lib/license-store';
import {
  activateLicense,
  identifyTokenSource,
  releaseLicense,
} from '@/shared/lib/license-api';
import { renewLicenseIfNeeded } from '@/shared/lib/license-renewal';
import { openPurchasePage, getPurchaseLinks } from '@/shared/lib/license-links';
import { Fireworks } from '../../../components/Fireworks';

export const SupportPackSettings = () => {
  const { t } = useI18n();
  const licenseState = useLicenseStore();
  const hasLicense = isLicenseValid(licenseState);
  const inGracePeriod = isLicenseInGracePeriod(licenseState);
  // Set only by a successful activation in this panel, so renewals and other tabs
  // syncing the license never set off the fireworks.
  const [celebrating, setCelebrating] = useState(false);
  const [justActivated, setJustActivated] = useState(false);

  const handleActivated = useCallback(() => {
    setCelebrating(true);
    setJustActivated(true);
  }, []);

  return (
    <div className="space-y-6">
      {celebrating && <Fireworks onDone={() => setCelebrating(false)} />}

      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <UIcon icon="fluent-color:trophy-24" width={20} height={20} />
          {t('packs.title')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t('packs.subtitle')}
        </p>
        <Separator />
      </div>

      {hasLicense ? (
        <ActivatedView
          t={t}
          tier={licenseState.tier}
          inGracePeriod={inGracePeriod}
          justActivated={justActivated}
        />
      ) : (
        <PurchaseView t={t} onActivated={handleActivated} />
      )}
    </div>
  );
};

/**
 * Banner shown while the license is only alive thanks to the grace window, i.e.
 * renewal keeps failing. Explains it and offers a manual retry, so the user isn't
 * left guessing why the license eventually stops working.
 */
function RenewalWarning({ t }: { t: (key: string) => string }) {
  const graceUntil = useLicenseStore((s) => s.graceUntil);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await renewLicenseIfNeeded({ force: true });
    setRetrying(false);
  };

  return (
    <div className="rounded-xl bg-amber-500/10 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('supportPack.renewalWarningTitle')}</p>
          <p className="text-xs text-muted-foreground">
            {t('supportPack.renewalWarningDesc')}
          </p>
          {graceUntil && (
            <p className="text-xs text-muted-foreground">
              {t('supportPack.renewalGraceUntil')}{' '}
              {new Date(graceUntil).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {t('supportPack.retryNow')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Banner shown when the server told us the token is no longer valid (refund,
 * chargeback, manual revoke, or the device slot was taken). Silently reverting to
 * the sales page would just look like a bug.
 */
function RenewalRejected({ t }: { t: (key: string) => string }) {
  const { lastRenewError, token, deactivate } = useLicenseStore();
  const [retrying, setRetrying] = useState(false);

  const reasonKey =
    lastRenewError === 'license_revoked'
      ? 'supportPack.rejectedRevoked'
      : lastRenewError === 'max_devices_reached'
        ? 'supportPack.rejectedMaxDevices'
        : 'supportPack.rejectedGeneric';

  const handleRetry = async () => {
    setRetrying(true);
    await renewLicenseIfNeeded({ force: true });
    setRetrying(false);
  };

  return (
    <div className="rounded-xl bg-destructive/10 p-4 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('supportPack.rejectedTitle')}</p>
          <p className="text-xs text-muted-foreground">{t(reasonKey)}</p>
          {token && (
            <p className="text-xs font-mono text-muted-foreground">
              {token.slice(0, 12)}...
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground"
          onClick={deactivate}
        >
          {t('supportPack.dismiss')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {t('supportPack.retryNow')}
        </Button>
      </div>
    </div>
  );
}

/** View shown when the user already has an active license */
function ActivatedView({
  t,
  tier,
  inGracePeriod,
  justActivated,
}: {
  t: (key: string) => string;
  tier: LicenseTier;
  inGracePeriod: boolean;
  justActivated?: boolean;
}) {
  const token = useLicenseStore((s) => s.token);

  const tierLabel = tier === 'pro' ? 'Pro' : tier === 'power_pack' ? 'Power Pack' : 'Support Pack';
  const isPowerOrPro = tier === 'power_pack' || tier === 'pro';

  return (
    <div className="space-y-6">
      {inGracePeriod && <RenewalWarning t={t} />}

      {/* Welcome line, only right after activating in this panel */}
      {justActivated && (
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <UIcon icon="fluent-color:ribbon-star-24" width={20} height={20} />
          <p className="text-sm font-medium">{t('packs.welcomeAboard')}</p>
        </div>
      )}

      {/* Success card */}
      <div
        className={`rounded-xl bg-primary/10 p-6 ${
          justActivated ? 'animate-in fade-in zoom-in-95 duration-500' : ''
        }`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Check className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-primary">
              {tierLabel} {t('packs.active')}
            </p>
            <p className="text-xs text-muted-foreground">
              {token?.slice(0, 12)}...
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {isPowerOrPro
            ? t('packs.activatedDescriptionPower')
            : t('packs.activatedDescriptionSupport')}
        </p>
      </div>

      {/* If only support pack, show upgrade prompt */}
      {tier === 'support_pack' && (
        <div className="rounded-xl bg-highlight/10 p-5">
          <div className="flex items-start gap-3">
            <UIcon icon="fluent-color:ribbon-star-24" width={20} height={20} className="shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('packs.upgradePrompt')}</p>
              <p className="text-xs text-muted-foreground">{t('packs.upgradePromptDesc')}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 gap-2"
                onClick={() => openPurchasePage('power_pack')}
              >
                <UIcon icon="fluent-color:star-24" width={14} height={14} />
                {t('packs.upgradeToPower')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ReleaseDeviceSection t={t} />
    </div>
  );
}

/**
 * Self-service release of this install's activation slot.
 *
 * This replaces a button that only cleared local state: it looked like it freed a
 * slot, but the server kept counting the device forever, so a user moving to a new
 * profile still hit the limit and had no way to tell why.
 */
function ReleaseDeviceSection({ t }: { t: (key: string) => string }) {
  const { token, signedPayload, deactivate } = useLicenseStore();
  const [confirming, setConfirming] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRelease = async () => {
    if (!token) return;
    setReleasing(true);
    setError(null);

    const result = await releaseLicense(token, signedPayload || '');
    setReleasing(false);

    if (result.success) {
      // Only drop local state once the slot is actually back, so a failed call
      // can't leave the user locked out of a slot they still occupy.
      deactivate();
      setConfirming(false);
      return;
    }

    setError(
      result.error === 'network_error'
        ? t('supportPack.releaseNetworkError')
        : t('supportPack.releaseFailed'),
    );
  };

  if (!confirming) {
    return (
      <div className="space-y-2">
        <Separator />
        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-xs text-muted-foreground">
            {t('supportPack.releaseHint')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground shrink-0"
            onClick={() => setConfirming(true)}
          >
            {t('supportPack.releaseDevice')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Separator />
      <div className="rounded-xl bg-accent/20 p-4 space-y-3 mt-2">
        <p className="text-sm font-medium">{t('supportPack.releaseConfirmTitle')}</p>
        <p className="text-xs text-muted-foreground">
          {t('supportPack.releaseConfirmDesc')}
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            disabled={releasing}
          >
            {t('supportPack.cancel')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleRelease}
            disabled={releasing}
          >
            {releasing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <LogOut className="h-3 w-3" />
            )}
            {t('supportPack.releaseConfirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** View shown when the user hasn't purchased yet */
function PurchaseView({
  t,
  onActivated,
}: {
  t: (key: string) => string;
  onActivated: () => void;
}) {
  const links = getPurchaseLinks();
  // A leftover token means a previously working license was rejected on renewal,
  // rather than this being a first-time visitor.
  const wasRejected = useLicenseStore((s) => !!s.token && !!s.lastRenewError);

  return (
    <div className="space-y-6">
      {wasRejected && <RenewalRejected t={t} />}

      {/* Two-pack layout */}
      <div className="grid gap-4">
        {/* Support Pack Card */}
        <div className="rounded-xl bg-accent/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <UIcon icon="fluent-color:paint-brush-24" width={24} height={24} />
            <div>
              <h4 className="text-sm font-semibold">{t('packs.supportPackTitle')}</h4>
              <p className="text-xs text-muted-foreground">{t('packs.supportPackTagline')}</p>
            </div>
          </div>
          <div className="space-y-2 ml-0.5">
            <FeatureItem
              icon={<UIcon icon="fluent-color:paint-brush-24" width={14} height={14} />}
              text={t('packs.spFeature1')}
            />
            <FeatureItem
              icon={<UIcon icon="fluent-color:arrow-sync-24" width={14} height={14} />}
              text={t('packs.spFeature2')}
            />
            <FeatureItem
              icon={<UIcon icon="fluent-color:wrench-24" width={14} height={14} />}
              text={t('packs.spFeature3')}
            />
            <FeatureItem
              icon={<UIcon icon="fluent-color:laptop-24" width={14} height={14} />}
              text={t('packs.spFeature4')}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-4 gap-2"
            onClick={() => openPurchasePage('support_pack')}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            {t('packs.getSupportPack')}
          </Button>
        </div>

        {/* Power Pack Card — featured/highlighted with bold gradient */}
        <div className="rounded-xl bg-gradient-to-br from-violet-500/20 via-purple-500/10 to-fuchsia-500/20 p-5 relative overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-fuchsia-500/10 blur-2xl pointer-events-none" />

          {/* Popular badge */}
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/20 text-violet-600 dark:text-violet-300">
              <UIcon icon="fluent-color:star-24" width={10} height={10} />
              {t('packs.popular')}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-3 relative">
            <UIcon icon="fluent-color:premium-24" width={24} height={24} />
            <div>
              <h4 className="text-sm font-semibold">{t('packs.powerPackTitle')}</h4>
              <p className="text-xs text-muted-foreground">{t('packs.powerPackTagline')}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-3 relative">
            {t('packs.powerPackDescription')}
          </p>
          <div className="space-y-2 ml-0.5 relative">
            <FeatureItem
              icon={<UIcon icon="fluent-color:paint-brush-24" width={14} height={14} />}
              text={t('packs.ppFeatureThemes')}
            />
            <FeatureItem
              icon={<UIcon icon="fluent-color:bot-sparkle-24" width={14} height={14} />}
              text={t('packs.ppFeatureAgent')}
            />
            <FeatureItem
              icon={<UIcon icon="fluent-color:database-24" width={14} height={14} />}
              text={t('packs.ppFeatureWrite')}
            />
            <FeatureItem
              icon={<UIcon icon="fluent-color:history-24" width={14} height={14} />}
              text={t('packs.ppFeatureHistory')}
            />
            <FeatureItem
              icon={<UIcon icon="fluent-color:share-android-24" width={14} height={14} />}
              text={t('packs.ppFeatureExport')}
            />
          </div>
          <Button
            className="w-full mt-4 gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-md shadow-violet-500/20 border-0"
            onClick={() => openPurchasePage('power_pack')}
          >
            <UIcon icon="fluent-color:star-24" width={14} height={14} />
            {t('packs.getPowerPack')}
          </Button>
        </div>
      </div>

      {/* Platform links by product */}
      <div className="space-y-2 text-xs text-muted-foreground">
        <p className="text-center text-xs text-muted-foreground">
          {t('packs.refundPolicy')}
        </p>
        <div className="flex items-center justify-center gap-3">
          <span>Power Pack:</span>
          <button
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={() => window.open(links.gumroadPp, '_blank')}
          >
            Gumroad
            <ExternalLink className="h-3 w-3" />
          </button>
          {links.afdianPp && (
            <>
              <span>|</span>
              <button
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
                onClick={() => window.open(links.afdianPp, '_blank')}
              >
                {t('supportPack.afdian')}
                <ExternalLink className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <span>Support Pack:</span>
          <button
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={() => window.open(links.gumroadSp, '_blank')}
          >
            Gumroad
            <ExternalLink className="h-3 w-3" />
          </button>
          <span>|</span>
          <button
            className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={() => window.open(links.afdianSp, '_blank')}
          >
            {t('supportPack.afdian')}
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>

      <Separator />

      {/* Token activation section */}
      <ActivationInput t={t} onActivated={onActivated} />
    </div>
  );
}

/** Token input and activation form */
function ActivationInput({
  t,
  onActivated,
}: {
  t: (key: string) => string;
  onActivated: () => void;
}) {
  const { deviceId, activate } = useLicenseStore();
  const [inputToken, setInputToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleActivate = async () => {
    const trimmed = inputToken.trim();
    if (!trimmed) return;

    const source = identifyTokenSource(trimmed);
    if (source === 'unknown') {
      setError(t('supportPack.invalidToken'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    const result = await activateLicense(trimmed, deviceId);

    setLoading(false);

    if (result.success) {
      activate(trimmed, result.signedPayload, result.expiresAt, result.tier);
      setSuccess(true);
      setInputToken('');
      onActivated();
    } else {
      const errorMsg =
        result.error === 'network_error'
          ? t('supportPack.networkError')
          : result.error === 'max_devices_reached'
            ? t('supportPack.maxDevices')
            : t('supportPack.activationFailed');
      setError(errorMsg);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">{t('supportPack.alreadyPurchased')}</h4>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('supportPack.enterToken')}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputToken}
          onChange={(e) => {
            setInputToken(e.target.value.toUpperCase());
            setError(null);
            setSuccess(false);
          }}
          placeholder={t('supportPack.tokenPlaceholder')}
          className="flex-1 h-9 rounded-md border border-border/60 bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleActivate();
          }}
        />
        <Button
          size="sm"
          className="h-9 px-4"
          onClick={handleActivate}
          disabled={loading || !inputToken.trim()}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            t('supportPack.activate')
          )}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      {success && (
        <p className="text-xs text-primary flex items-center gap-1">
          <Check className="h-3 w-3" />
          {t('supportPack.activationSuccess')}
        </p>
      )}
    </div>
  );
}

/** A single feature bullet point */
function FeatureItem({ icon, text, badge }: { icon: React.ReactNode; text: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="shrink-0">{icon}</div>
      <span className="text-xs">{text}</span>
      {badge && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-highlight/20 text-highlight whitespace-nowrap">
          {badge}
        </span>
      )}
    </div>
  );
}
