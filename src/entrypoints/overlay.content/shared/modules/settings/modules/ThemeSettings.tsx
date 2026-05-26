import React, { useCallback, useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Moon, Sun, Monitor, Check, Sparkles, Eye, ShoppingCart } from 'lucide-react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { openPurchasePage } from '@/shared/lib/license-links';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '@/shared/hooks/useI18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import {
  themeRegistry,
  themePresetIds,
  type ThemePresetId,
} from '@/themes';

/** Preview duration: 5 minutes */
const PREVIEW_DURATION_MS = 5 * 60 * 1000;

/**
 * Theme card preview colors for each preset
 */
const themePreviewColors: Record<
  ThemePresetId,
  { bg: string; fg: string; accent: string; secondary: string }
> = {
  grimoire: {
    bg: '#f5f0e8',
    fg: '#3b2f20',
    accent: '#8b2020',
    secondary: '#8b6914',
  },
  'cupertino-glass': {
    bg: '#ffffff',
    fg: '#1d1d1f',
    accent: '#007aff',
    secondary: '#e5e5ea',
  },
  'retro-terminal': {
    bg: '#0a0a0a',
    fg: '#00ff41',
    accent: '#00ff41',
    secondary: '#ffb000',
  },
};

export const ThemeSettings = () => {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { customTheme, setCustomTheme, geminiStyle, setGeminiStyle } = useSettingsStore();
  const licenseState = useLicenseStore();
  const hasLicense = isLicenseValid(licenseState);

  const platform = detectPlatform();
  const isGemini = platform === Platform.GEMINI;
  const isDefaultTheme = customTheme === null && geminiStyle === 'default';
  const isClassicTheme = customTheme === null && geminiStyle === 'classic';

  // Preview timer — resets to default after 5 min for unlicensed premium themes
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isPreviewActive, previewThemeId, startPreview, endPreview } = licenseState;

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }, []);

  const handlePreviewExpired = useCallback(() => {
    clearPreviewTimer();
    endPreview();
    // Reset to default theme via the store (triggers the platform subscriber)
    setCustomTheme(null);
    setGeminiStyle('default');
  }, [clearPreviewTimer, endPreview, setCustomTheme, setGeminiStyle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearPreviewTimer();
  }, [clearPreviewTimer]);

  const handleThemeClick = (themeId: ThemePresetId) => {
    const preset = themeRegistry[themeId];

    if (preset.isPremium && !hasLicense) {
      // Apply theme normally via store (triggers platform subscriber)
      setCustomTheme(themeId);
      setGeminiStyle('default');
      // Start preview tracking
      startPreview(themeId);
      // Set auto-revert timer
      clearPreviewTimer();
      previewTimerRef.current = setTimeout(handlePreviewExpired, PREVIEW_DURATION_MS);
    } else {
      // Normal apply — clear any active preview
      if (isPreviewActive) {
        clearPreviewTimer();
        endPreview();
      }
      setCustomTheme(themeId);
      setGeminiStyle('default');
    }
  };

  const handleDefaultClick = () => {
    if (isPreviewActive) {
      clearPreviewTimer();
      endPreview();
    }
    setCustomTheme(null);
    setGeminiStyle('default');
  };

  const handleClassicClick = () => {
    if (isPreviewActive) {
      clearPreviewTimer();
      endPreview();
    }
    setCustomTheme(null);
    setGeminiStyle('classic');
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('themeSettings.title')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('themeSettings.customThemesDescription')}
        </p>
        <Separator />
      </div>

      {/* Preview Banner */}
      {isPreviewActive && (
        <PreviewBanner t={t} />
      )}

      {/* All themes in a unified grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Default Theme Card (v2) */}
        <ThemeCard
          name={t('themeSettings.default')}
          description={t('themeSettings.defaultDescription')}
          colors={{
            bg: '#faf9f9',
            fg: '#1f1f1f',
            accent: '#0b57d0',
            secondary: '#f0f4f9',
          }}
          isActive={isDefaultTheme}
          onClick={handleDefaultClick}
        />

        {/* Gemini Classic Card — only on Gemini platform */}
        {isGemini && (
          <ThemeCard
            name="Gemini Classic"
            description={t('themeSettings.classicDescription')}
            colors={{
              bg: '#e9eef6',
              fg: '#1f1f1f',
              accent: '#0b57d0',
              secondary: '#dde3ea',
            }}
            isActive={isClassicTheme}
            onClick={handleClassicClick}
          />
        )}

        {/* Custom presets */}
        {themePresetIds.map((id) => {
          const preset = themeRegistry[id];
          const colors = themePreviewColors[id];
          const isPreviewing = isPreviewActive && previewThemeId === id;
          return (
            <ThemeCard
              key={id}
              name={preset.nameZh}
              description={preset.descriptionZh}
              colors={colors}
              isActive={customTheme === id}
              isPremium={preset.isPremium}
              hasLicense={hasLicense}
              isPreviewing={isPreviewing}
              onClick={() => handleThemeClick(id)}
            />
          );
        })}
      </div>

      {/* Light/Dark/System Toggle — only shown when no custom preset is active */}
      {(isDefaultTheme || isClassicTheme) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                {t('settings.theme')}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('settings.themeDescription')}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
              <SimpleTooltip content={t('settings.light')}>
                <Button
                  variant={theme === 'light' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setTheme('light')}
                >
                  <Sun className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip content={t('settings.system')}>
                <Button
                  variant={theme === 'system' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setTheme('system')}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip content={t('settings.dark')}>
                <Button
                  variant={theme === 'dark' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setTheme('dark')}
                >
                  <Moon className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Preview banner — tells user the theme will revert in 5 min, with a purchase CTA */
function PreviewBanner({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-xs text-amber-800 dark:text-amber-300 truncate">
          {t('themeSettings.previewBannerText')}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2.5 text-xs shrink-0 border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
        onClick={() => openPurchasePage()}
      >
        <ShoppingCart className="h-3 w-3 mr-1" />
        {t('themeSettings.buyNow')}
      </Button>
    </div>
  );
}

/** A clickable theme preview card */
function ThemeCard({
  name,
  description,
  colors,
  isActive,
  isPremium,
  hasLicense,
  isPreviewing,
  onClick,
}: {
  name: string;
  description: string;
  colors: { bg: string; fg: string; accent: string; secondary: string };
  isActive: boolean;
  isPremium?: boolean;
  hasLicense?: boolean;
  isPreviewing?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col rounded-lg border p-3 text-left transition-all
        hover:shadow-md hover:border-primary/50
        ${isActive ? 'border-primary ring-2 ring-primary/20' : 'border-border'}
      `}
    >
      {/* Active indicator */}
      {isActive && !isPreviewing && (
        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}

      {/* Preview indicator */}
      {isPreviewing && (
        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center">
          <Eye className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Premium badge */}
      {isPremium && !hasLicense && !isActive && !isPreviewing && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5">
          <Sparkles className="h-3 w-3 text-amber-600" />
        </div>
      )}

      {/* Color preview strip */}
      <div className="flex gap-1 mb-2">
        <div
          className="h-8 flex-1 rounded-sm border border-black/5"
          style={{ backgroundColor: colors.bg }}
        />
        <div
          className="h-8 w-8 rounded-sm"
          style={{ backgroundColor: colors.accent }}
        />
        <div
          className="h-8 w-8 rounded-sm border border-black/5"
          style={{ backgroundColor: colors.secondary }}
        />
        <div
          className="h-8 w-4 rounded-sm"
          style={{ backgroundColor: colors.fg }}
        />
      </div>

      {/* Text */}
      <span className="text-sm font-medium">{name}</span>
      <span className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
        {description}
      </span>
    </button>
  );
}
