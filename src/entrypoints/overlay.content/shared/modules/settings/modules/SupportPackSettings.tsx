import React, { useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import { Button } from '../../../components/ui/button';
import {
  Sparkles,
  Palette,
  ShoppingCart,
  Check,
  Loader2,
  KeyRound,
  Infinity,
  Monitor,
  Heart,
} from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { activateLicense, identifyTokenSource } from '@/shared/lib/license-api';
import { openPurchasePage } from '@/shared/lib/license-links';

export const SupportPackSettings = () => {
  const { t } = useI18n();
  const licenseState = useLicenseStore();
  const hasLicense = isLicenseValid(licenseState);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          {t('supportPack.title')}
        </h3>
        <Separator />
      </div>

      {hasLicense ? (
        <ActivatedView t={t} />
      ) : (
        <PurchaseView t={t} />
      )}
    </div>
  );
};

/** View shown when the user already has an active license */
function ActivatedView({ t }: { t: (key: string) => string }) {
  const { tier, token, deactivate } = useLicenseStore();

  return (
    <div className="space-y-6">
      {/* Success card */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Check className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-primary">
              {t('supportPack.activatedTitle')}
            </p>
            <p className="text-xs text-muted-foreground">
              {tier === 'pro' ? 'Pro' : 'Support Pack'} • {token?.slice(0, 12)}...
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('supportPack.activatedDescription')}
        </p>
      </div>

      {/* Deactivate */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={deactivate}
        >
          {t('supportPack.deactivate')}
        </Button>
      </div>
    </div>
  );
}

/** View shown when the user hasn't purchased yet — designed for conversion */
function PurchaseView({ t }: { t: (key: string) => string }) {
  return (
    <div className="space-y-6">
      {/* Hero section — uses theme tokens for colors */}
      <div className="rounded-xl border bg-accent/30 p-6 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
          <Palette className="h-7 w-7 text-primary" />
        </div>
        <h4 className="text-lg font-semibold mb-2">
          {t('supportPack.heroTitle')}
        </h4>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {t('supportPack.heroDescription')}
        </p>
      </div>

      {/* Features list */}
      <div className="space-y-3">
        <FeatureItem
          icon={<Palette className="h-4 w-4 text-primary" />}
          text={t('supportPack.feature1')}
        />
        <FeatureItem
          icon={<Monitor className="h-4 w-4 text-primary" />}
          text={t('supportPack.feature3')}
        />
        <FeatureItem
          icon={<Heart className="h-4 w-4 text-primary" />}
          text={t('supportPack.feature4')}
        />
      </div>

      {/* Purchase button */}
      <div className="space-y-3">
        <Button
          className="w-full h-10 gap-2"
          onClick={() => openPurchasePage()}
        >
          <ShoppingCart className="h-4 w-4" />
          {t('supportPack.buyButton')}
        </Button>
      </div>

      <Separator />

      {/* Token activation section */}
      <ActivationInput t={t} />
    </div>
  );
}

/** Token input and activation form */
function ActivationInput({ t }: { t: (key: string) => string }) {
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
          placeholder="BS-SP-XXXXXXXX"
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
function FeatureItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="shrink-0">{icon}</div>
      <span className="text-sm">{text}</span>
    </div>
  );
}
