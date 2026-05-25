import React from 'react';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Moon, Sun, Monitor, Check } from 'lucide-react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '@/shared/hooks/useI18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import {
  themeRegistry,
  themePresetIds,
  type ThemePresetId,
} from '@/themes';

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

  const platform = detectPlatform();
  const isGemini = platform === Platform.GEMINI;
  const isDefaultTheme = customTheme === null && geminiStyle === 'default';
  const isClassicTheme = customTheme === null && geminiStyle === 'classic';

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
          onClick={() => { setCustomTheme(null); setGeminiStyle('default'); }}
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
            onClick={() => { setCustomTheme(null); setGeminiStyle('classic'); }}
          />
        )}

        {/* Custom presets */}
        {themePresetIds.map((id) => {
          const preset = themeRegistry[id];
          const colors = themePreviewColors[id];
          return (
            <ThemeCard
              key={id}
              name={preset.nameZh}
              description={preset.descriptionZh}
              colors={colors}
              isActive={customTheme === id}
              onClick={() => { setCustomTheme(id); setGeminiStyle('default'); }}
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

/** A clickable theme preview card */
function ThemeCard({
  name,
  description,
  colors,
  isActive,
  onClick,
}: {
  name: string;
  description: string;
  colors: { bg: string; fg: string; accent: string; secondary: string };
  isActive: boolean;
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
      {isActive && (
        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="h-3 w-3 text-primary-foreground" />
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
