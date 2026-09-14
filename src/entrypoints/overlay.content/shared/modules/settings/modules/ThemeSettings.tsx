import { useCallback, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Separator } from '../../../components/ui/separator';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { Moon, Sun, Monitor, Check, Sparkles, Eye, ShoppingCart, Wand2, Download, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { openPurchasePage } from '@/shared/lib/license-links';
import { useTheme } from '../hooks/useTheme';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import { useAppStore } from '@/shared/lib/store';
import { toast } from '@/shared/lib/toast';
import { startViewTransition } from '@/shared/lib/view-transition';
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

/** Number of theme cards per page */
const THEMES_PER_PAGE = 4;

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
    secondary: '#ff9500',
  },
  'retro-terminal': {
    bg: '#0a0a0a',
    fg: '#00ff41',
    accent: '#00ff41',
    secondary: '#ffb000',
  },
  'nord-aurora': {
    bg: '#2e3440',
    fg: '#eceff4',
    accent: '#88c0d0',
    secondary: '#bf616a',
  },
  'cyberpunk-neon': {
    bg: '#0a0a0f',
    fg: '#e8e8f0',
    accent: '#ff0080',
    secondary: '#00c8ff',
  },
  'paper-ink': {
    bg: '#faf9f6',
    fg: '#1a1a1a',
    accent: '#2c3e6b',
    secondary: '#b76e2c',
  },
  solarized: {
    bg: '#002b36',
    fg: '#839496',
    accent: '#2aa198',
    secondary: '#b58900',
  },
  'rose-pine': {
    bg: '#191724',
    fg: '#e0def4',
    accent: '#ebbcba',
    secondary: '#f6c177',
  },
  'tokyo-night': {
    bg: '#1a1b26',
    fg: '#a9b1d6',
    accent: '#7aa2f7',
    secondary: '#bb9af7',
  },
  'catppuccin-mocha': {
    bg: '#1e1e2e',
    fg: '#cdd6f4',
    accent: '#b4befe',
    secondary: '#fab387',
  },
  dracula: {
    bg: '#282a36',
    fg: '#f8f8f2',
    accent: '#bd93f9',
    secondary: '#50fa7b',
  },
  'ocean-breeze': {
    bg: '#f8fbfd',
    fg: '#1e3a4c',
    accent: '#0077b6',
    secondary: '#ff6b6b',
  },
  'midnight-purple': {
    bg: '#0d0d14',
    fg: '#e4e4f0',
    accent: '#8b5cf6',
    secondary: '#6366f1',
  },
  gruvbox: {
    bg: '#282828',
    fg: '#ebdbb2',
    accent: '#fabd2f',
    secondary: '#fe8019',
  },
  everforest: {
    bg: '#2d353b',
    fg: '#d3c6aa',
    accent: '#a7c080',
    secondary: '#e69875',
  },
  'high-contrast': {
    bg: '#000000',
    fg: '#ffffff',
    accent: '#ffd400',
    secondary: '#00e5ff',
  },
  'solarized-light': {
    bg: '#fdf6e3',
    fg: '#586e75',
    accent: '#268bd2',
    secondary: '#cb4b16',
  },
  sakura: {
    bg: '#fff7f8',
    fg: '#4a3b40',
    accent: '#c04f72',
    secondary: '#7d9a76',
  },
  graphite: {
    bg: '#fafafa',
    fg: '#171717',
    accent: '#262626',
    secondary: '#8c8c8c',
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
  'nord-aurora': {
    name: 'themeSettings.nordAuroraName',
    description: 'themeSettings.nordAuroraDescription',
  },
  'cyberpunk-neon': {
    name: 'themeSettings.cyberpunkNeonName',
    description: 'themeSettings.cyberpunkNeonDescription',
  },
  'paper-ink': {
    name: 'themeSettings.paperInkName',
    description: 'themeSettings.paperInkDescription',
  },
  solarized: {
    name: 'themeSettings.solarizedName',
    description: 'themeSettings.solarizedDescription',
  },
  'rose-pine': {
    name: 'themeSettings.rosePineName',
    description: 'themeSettings.rosePineDescription',
  },
  'tokyo-night': {
    name: 'themeSettings.tokyoNightName',
    description: 'themeSettings.tokyoNightDescription',
  },
  'catppuccin-mocha': {
    name: 'themeSettings.catppuccinMochaName',
    description: 'themeSettings.catppuccinMochaDescription',
  },
  dracula: {
    name: 'themeSettings.draculaName',
    description: 'themeSettings.draculaDescription',
  },
  'ocean-breeze': {
    name: 'themeSettings.oceanBreezeName',
    description: 'themeSettings.oceanBreezeDescription',
  },
  'midnight-purple': {
    name: 'themeSettings.midnightPurpleName',
    description: 'themeSettings.midnightPurpleDescription',
  },
  gruvbox: {
    name: 'themeSettings.gruvboxName',
    description: 'themeSettings.gruvboxDescription',
  },
  everforest: {
    name: 'themeSettings.everforestName',
    description: 'themeSettings.everforestDescription',
  },
  'high-contrast': {
    name: 'themeSettings.highContrastName',
    description: 'themeSettings.highContrastDescription',
  },
  'solarized-light': {
    name: 'themeSettings.solarizedLightName',
    description: 'themeSettings.solarizedLightDescription',
  },
  sakura: {
    name: 'themeSettings.sakuraName',
    description: 'themeSettings.sakuraDescription',
  },
  graphite: {
    name: 'themeSettings.graphiteName',
    description: 'themeSettings.graphiteDescription',
  },
};

export const ThemeSettings = () => {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { customTheme, setCustomTheme } = usePegasusStore();
  const licenseState = useLicenseStore();
  const hasLicense = isLicenseValid(licenseState);
  const userThemes = useUserThemeStore((s) => s.themes);

  const isDefaultTheme = customTheme === null;

  // Preview timer — resets to default after expiry for unlicensed premium themes
  const { isPreviewActive, previewThemeId, startPreview, endPreview } = licenseState;

  const handlePreviewExpired = useCallback(() => {
    clearModulePreviewTimer();
    endPreview();
    setCustomTheme(null);
  }, [endPreview, setCustomTheme]);

  const handleThemeClick = (themeId: ThemePresetId, event: React.MouseEvent) => {
    const preset = themeRegistry[themeId];

    startViewTransition(event, () => {
      if (preset.isPremium && !hasLicense) {
        setCustomTheme(themeId);
        startPreview(themeId);
        startModulePreviewTimer(handlePreviewExpired);
      } else {
        if (isPreviewActive) {
          clearModulePreviewTimer();
          endPreview();
        }
        setCustomTheme(themeId);
      }
    }, themeId, theme);
  };

  const handleDefaultClick = (event: React.MouseEvent) => {
    startViewTransition(event, () => {
      if (isPreviewActive) {
        clearModulePreviewTimer();
        endPreview();
      }
      setCustomTheme(null);
    }, null, theme);
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
    if (usePegasusStore.getState().customTheme === themeId) {
      setCustomTheme(null);
    }
    toast.success(t('themeSettings.themeDeleted'));
  }, [setCustomTheme, t]);

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

      {/* Light/Dark/System Toggle — visible when using the default theme */}
      {isDefaultTheme && (
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
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
              <SimpleTooltip content={t('settings.light')}>
                <Button
                  variant={theme === 'light' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={(e) => startViewTransition(e, () => setTheme('light'), null, 'light')}
                >
                  <Sun className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip content={t('settings.system')}>
                <Button
                  variant={theme === 'system' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={(e) => startViewTransition(e, () => setTheme('system'), null, 'system')}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip content={t('settings.dark')}>
                <Button
                  variant={theme === 'dark' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={(e) => startViewTransition(e, () => setTheme('dark'), null, 'dark')}
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

      {/* Paginated theme grid */}
      <PaginatedThemeGrid
        t={t}
        customTheme={customTheme}
        isDefaultTheme={isDefaultTheme}
        isPreviewActive={isPreviewActive}
        previewThemeId={previewThemeId}
        hasLicense={hasLicense}
        userThemes={userThemes}
        handleDefaultClick={handleDefaultClick}
        handleThemeClick={handleThemeClick}
        handleDeleteUserTheme={handleDeleteUserTheme}
      />

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
    <div className="flex items-center justify-between gap-2 rounded-lg bg-highlight/10 px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 text-highlight shrink-0" />
        <span className="text-xs text-highlight truncate">
          {t('themeSettings.previewBannerText')}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2.5 text-xs shrink-0 border-highlight/50 text-highlight hover:bg-highlight/10"
        onClick={() => openPurchasePage()}
      >
        <ShoppingCart className="h-3 w-3 mr-1" />
        {t('themeSettings.buyNow')}
      </Button>
    </div>
  );
}

/** Paginated theme grid — shows 4 themes per page with dot indicators */
function PaginatedThemeGrid({
  t,
  customTheme,
  isDefaultTheme,
  isPreviewActive,
  previewThemeId,
  hasLicense,
  userThemes,
  handleDefaultClick,
  handleThemeClick,
  handleDeleteUserTheme,
}: {
  t: (key: string) => string;
  customTheme: string | null;
  isDefaultTheme: boolean;
  isPreviewActive: boolean;
  previewThemeId: string | null;
  hasLicense: boolean;
  userThemes: Array<{ id: string; name: string; description: string; variables: Array<{ property: string; value: string }> }>;
  handleDefaultClick: (event: React.MouseEvent) => void;
  handleThemeClick: (id: string, event: React.MouseEvent) => void;
  handleDeleteUserTheme: (id: string) => void;
}) {
  const currentPage = useSettingsStore((s) => s.themeGridPage);
  const setCurrentPage = useSettingsStore((s) => s.setThemeGridPage);

  // Build all theme card descriptors into a flat array
  const allCards = useMemo(() => {
    const cards: Array<{
      key: string;
      name: string;
      description: string;
      colors: { bg: string; fg: string; accent: string; secondary: string };
      isActive: boolean;
      isPremium?: boolean;
      isPreviewing?: boolean;
      isUserTheme?: boolean;
      onClick: (event: React.MouseEvent) => void;
      onDelete?: () => void;
    }> = [];

    // Default theme
    cards.push({
      key: '__default__',
      name: t('themeSettings.default'),
      description: t('themeSettings.defaultDescription'),
      colors: { bg: '#ffffff', fg: '#1f1f1f', accent: '#0b57d0', secondary: '#d97706' },
      isActive: isDefaultTheme,
      onClick: (e) => handleDefaultClick(e),
    });

    // Built-in presets
    for (const id of themePresetIds) {
      const preset = themeRegistry[id];
      const colors = themePreviewColors[id];
      const i18nKeys = themeI18nKeys[id];
      cards.push({
        key: id,
        name: t(i18nKeys.name),
        description: t(i18nKeys.description),
        colors,
        isActive: customTheme === id,
        isPremium: preset.isPremium,
        isPreviewing: isPreviewActive && previewThemeId === id,
        onClick: (e) => handleThemeClick(id, e),
      });
    }

    // User-created themes
    for (const ut of userThemes) {
      const getVar = (prop: string) =>
        ut.variables.find((v) => v.property === prop)?.value ?? '';
      const colors = {
        bg: getVar('--gem-sys-color--surface') || '#888',
        fg: getVar('--gem-sys-color--on-surface') || '#000',
        accent: getVar('--gem-sys-color--primary') || '#666',
        secondary: getVar('--gem-sys-color--secondary-container') || '#aaa',
      };
      cards.push({
        key: ut.id,
        name: ut.name,
        description: ut.description,
        colors,
        isActive: customTheme === ut.id,
        isUserTheme: true,
        onClick: (e) => handleThemeClick(ut.id, e),
        onDelete: () => handleDeleteUserTheme(ut.id),
      });
    }

    return cards;
  }, [t, customTheme, isDefaultTheme, isPreviewActive, previewThemeId, hasLicense, userThemes, handleDefaultClick, handleThemeClick, handleDeleteUserTheme]);

  const totalPages = Math.ceil(allCards.length / THEMES_PER_PAGE);
  const pagedCards = allCards.slice(
    currentPage * THEMES_PER_PAGE,
    (currentPage + 1) * THEMES_PER_PAGE
  );

  // Clamp page if items removed
  if (currentPage >= totalPages && totalPages > 0) {
    setCurrentPage(totalPages - 1);
  }

  return (
    <div className="space-y-3">
      {/* 2×2 Grid */}
      <div className="grid grid-cols-2 gap-3">
        {pagedCards.map((card) => (
          <ThemeCard
            key={card.key}
            name={card.name}
            description={card.description}
            colors={card.colors}
            isActive={card.isActive}
            isPremium={card.isPremium}
            hasLicense={hasLicense}
            isPreviewing={card.isPreviewing}
            isUserTheme={card.isUserTheme}
            onClick={card.onClick}
            onDelete={card.onDelete}
          />
        ))}
      </div>

      {/* Pagination dots */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === currentPage ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
                onClick={() => setCurrentPage(i)}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={currentPage === totalPages - 1}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
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
  onClick: (event: React.MouseEvent) => void;
  onDelete?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex flex-col rounded-lg p-3 text-left transition-all
        hover:shadow-md
        ${isActive ? 'bg-primary/10 ring-2 ring-primary' : 'bg-muted/40 hover:bg-muted/60'}
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
        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-highlight flex items-center justify-center">
          <Eye className="h-3 w-3 text-highlight-foreground" />
        </div>
      )}

      {/* Premium badge */}
      {isPremium && !hasLicense && !isActive && !isPreviewing && !isUserTheme && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-full bg-highlight/15 px-1.5 py-0.5">
          <Sparkles className="h-3 w-3 text-highlight" />
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
