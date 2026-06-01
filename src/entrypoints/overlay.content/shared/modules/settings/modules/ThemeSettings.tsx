import React, { useCallback } from 'react';
import { Button } from '../../../components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Moon, Sun, Monitor, Check, Sparkles, Eye, ShoppingCart, Wand2, Download, Trash2 } from 'lucide-react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { openPurchasePage } from '@/shared/lib/license-links';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '@/shared/hooks/useI18n';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { useModalStore } from '@/shared/lib/modal';
import { useAppStore } from '@/shared/lib/store';
import { toast } from '@/shared/lib/toast';
import {
  themeRegistry,
  themePresetIds,
  useUserThemeStore,
  refreshThemeRegistry,
  type ThemePresetId,
  type BuiltinThemePresetId,
} from '@/themes';
import { AI_THEME_PROMPT_TITLE, AI_THEME_PROMPT_CONTENT } from '@/themes/ai-theme-prompt';
import { ImportThemeModalContentStateful, handleImportTheme } from '../components/ImportThemeModal';

/** Preview duration: 5 minutes */
const PREVIEW_DURATION_MS = 5 * 60 * 1000;

/**
 * Module-level preview timer — survives component unmount/remount.
 */
let modulePreviewTimer: ReturnType<typeof setTimeout> | null = null;

function startModulePreviewTimer(onExpire: () => void) {
  clearModulePreviewTimer();
  modulePreviewTimer = setTimeout(onExpire, PREVIEW_DURATION_MS);
}

function clearModulePreviewTimer() {
  if (modulePreviewTimer) {
    clearTimeout(modulePreviewTimer);
    modulePreviewTimer = null;
  }
}

/**
 * Theme card preview colors for each preset
 */
const themePreviewColors: Record<
  BuiltinThemePresetId,
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

/** Map theme preset ID to i18n keys */
const themeI18nKeys: Record<BuiltinThemePresetId, { name: string; description: string }> = {
  'cupertino-glass': {
    name: 'themeSettings.cupertinoGlassName',
    description: 'themeSettings.cupertinoGlassDescription',
  },
  grimoire: {
    name: 'themeSettings.grimoireName',
    description: 'themeSettings.grimoireDescription',
  },
  'retro-terminal': {
    name: 'themeSettings.retroTerminalName',
    description: 'themeSettings.retroTerminalDescription',
  },
};

export const ThemeSettings = () => {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { customTheme, setCustomTheme, geminiStyle, setGeminiStyle } = useSettingsStore();
  const licenseState = useLicenseStore();
  const hasLicense = isLicenseValid(licenseState);
  const userThemes = useUserThemeStore((s) => s.themes);

  const platform = detectPlatform();
  const isGemini = platform === Platform.GEMINI;
  const isDefaultTheme = customTheme === null && geminiStyle === 'default';
  const isClassicTheme = customTheme === null && geminiStyle === 'classic';

  // Preview timer — resets to default after expiry for unlicensed premium themes
  const { isPreviewActive, previewThemeId, startPreview, endPreview } = licenseState;

  const handlePreviewExpired = useCallback(() => {
    clearModulePreviewTimer();
    endPreview();
    setCustomTheme(null);
    setGeminiStyle('default');
  }, [endPreview, setCustomTheme, setGeminiStyle]);

  const handleThemeClick = (themeId: ThemePresetId) => {
    const preset = themeRegistry[themeId];

    if (preset.isPremium && !hasLicense) {
      // Apply theme normally via store (triggers platform subscriber)
      setCustomTheme(themeId);
      setGeminiStyle('default');
      // Start preview tracking
      startPreview(themeId);
      // Set auto-revert timer (module-level, survives unmount)
      startModulePreviewTimer(handlePreviewExpired);
    } else {
      // Normal apply — clear any active preview
      if (isPreviewActive) {
        clearModulePreviewTimer();
        endPreview();
      }
      setCustomTheme(themeId);
      setGeminiStyle('default');
    }
  };

  const handleDefaultClick = () => {
    if (isPreviewActive) {
      clearModulePreviewTimer();
      endPreview();
    }
    setCustomTheme(null);
    setGeminiStyle('default');
  };

  const handleClassicClick = () => {
    if (isPreviewActive) {
      clearModulePreviewTimer();
      endPreview();
    }
    setCustomTheme(null);
    setGeminiStyle('classic');
  };

  /** Create the AI theme generator prompt in Prompt Manager */
  const handleCreatePrompt = useCallback(async () => {
    const { prompts, createPrompt, setSettingsOpen, setActiveTab } = useAppStore.getState();
    // Check if prompt already exists
    const existing = prompts.find((p) => p.title === AI_THEME_PROMPT_TITLE);
    if (existing) {
      // Already exists — just navigate to prompts tab
      setSettingsOpen(false);
      setActiveTab('prompts');
      toast.info(t('themeSettings.promptAlreadyExists'));
      return;
    }
    await createPrompt(AI_THEME_PROMPT_TITLE, AI_THEME_PROMPT_CONTENT, 'normal', 'Palette', null);
    // Close settings and switch to prompts tab
    setSettingsOpen(false);
    setActiveTab('prompts');
    toast.success(t('themeSettings.promptCreated'));
  }, [t]);

  /** Open the import theme modal */
  const handleOpenImportModal = useCallback(() => {
    useModalStore.getState().open({
      type: 'confirm',
      title: t('themeSettings.importThemeTitle'),
      content: <ImportThemeModalContentStateful />,
      confirmText: t('themeSettings.importAndApply'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        const success = handleImportTheme(t);
        if (success) {
          useModalStore.getState().close();
        }
      },
      onCancel: () => useModalStore.getState().close(),
      modalClassName: 'max-w-2xl',
    });
  }, [t]);

  /** Delete a user theme */
  const handleDeleteUserTheme = useCallback((themeId: string) => {
    useUserThemeStore.getState().removeTheme(themeId);
    refreshThemeRegistry();
    // If the deleted theme was active, revert to default
    if (useSettingsStore.getState().customTheme === themeId) {
      setCustomTheme(null);
      setGeminiStyle('default');
    }
    toast.success(t('themeSettings.themeDeleted'));
  }, [setCustomTheme, setGeminiStyle, t]);

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

      {/* Light/Dark/System Toggle — always visible when using default/classic */}
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
            name={t('themeSettings.classic')}
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
          const i18nKeys = themeI18nKeys[id];
          return (
            <ThemeCard
              key={id}
              name={t(i18nKeys.name)}
              description={t(i18nKeys.description)}
              colors={colors}
              isActive={customTheme === id}
              isPremium={preset.isPremium}
              hasLicense={hasLicense}
              isPreviewing={isPreviewing}
              onClick={() => handleThemeClick(id)}
            />
          );
        })}

        {/* User-created themes */}
        {userThemes.map((ut) => {
          // Extract preview colors from the theme's variables
          const getVar = (prop: string) =>
            ut.variables.find((v) => v.property === prop)?.value ?? '';
          const colors = {
            bg: getVar('--gem-sys-color--surface') || '#888',
            fg: getVar('--gem-sys-color--on-surface') || '#000',
            accent: getVar('--gem-sys-color--primary') || '#666',
            secondary: getVar('--gem-sys-color--secondary-container') || '#aaa',
          };
          return (
            <ThemeCard
              key={ut.id}
              name={ut.name}
              description={ut.description}
              colors={colors}
              isActive={customTheme === ut.id}
              isUserTheme
              onClick={() => handleThemeClick(ut.id)}
              onDelete={() => handleDeleteUserTheme(ut.id)}
            />
          );
        })}
      </div>

      {/* AI Theme Generator Section */}
      <div className="space-y-3">
        <Separator />
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-medium">{t('themeSettings.aiGeneratorTitle')}</h4>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('themeSettings.aiGeneratorDescription')}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 text-xs"
            onClick={handleCreatePrompt}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {t('themeSettings.createPromptButton')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 text-xs"
            onClick={handleOpenImportModal}
          >
            <Download className="h-3.5 w-3.5" />
            {t('themeSettings.importThemeButton')}
          </Button>
        </div>
      </div>
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
  isUserTheme,
  onClick,
  onDelete,
}: {
  name: string;
  description: string;
  colors: { bg: string; fg: string; accent: string; secondary: string };
  isActive: boolean;
  isPremium?: boolean;
  hasLicense?: boolean;
  isPreviewing?: boolean;
  isUserTheme?: boolean;
  onClick: () => void;
  onDelete?: () => void;
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
      {isPremium && !hasLicense && !isActive && !isPreviewing && !isUserTheme && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5">
          <Sparkles className="h-3 w-3 text-amber-600" />
        </div>
      )}

      {/* User theme delete button */}
      {isUserTheme && onDelete && !isActive && (
        <div
          className="absolute top-2 right-2 h-5 w-5 rounded-full bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3 w-3 text-destructive" />
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
