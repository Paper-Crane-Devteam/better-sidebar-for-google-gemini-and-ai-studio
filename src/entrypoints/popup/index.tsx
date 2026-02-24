import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.scss';
import '@/locale/i18n';
import { useI18n } from '@/shared/hooks/useI18n';
import { Switch } from '@/shared/components/ui/switch';
import { Platform, PLATFORM_CONFIG } from '@/shared/types/platform';
import {
  getPlatformEnabledState,
  setPlatformEnabled,
  PlatformEnabledState,
} from '@/shared/lib/platform-enabled-store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { cn } from '@/shared/lib/utils/utils';

const Options = () => {
  const { t } = useI18n();
  const [enabledState, setEnabledState] = useState<PlatformEnabledState | null>(
    null,
  );

  // To handle theme correctly in standalone pages, we subscribe to settings store
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    // Apply theme
    const isDark =
      theme === 'dark' ||
      (theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Read initial configuration
  useEffect(() => {
    getPlatformEnabledState().then(setEnabledState);
  }, []);

  const togglePlatform = async (platform: Platform, enabled: boolean) => {
    if (!enabledState) return;

    // Optimistic UI update
    setEnabledState((prev) => (prev ? { ...prev, [platform]: enabled } : null));

    // Persist to storage
    await setPlatformEnabled(platform, enabled);
  };

  if (!enabledState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground animate-pulse">
        {t('common.loading')}
      </div>
    );
  }

  // The extensions officially supports these platforms currently
  const platformsToConfigure = [
    Platform.AI_STUDIO,
    Platform.GEMINI,
    Platform.CHATGPT,
    Platform.CLAUDE,
  ];

  return (
    <div className="w-[400px] min-h-[500px] bg-background text-foreground flex flex-col items-center py-6 px-4 relative overflow-hidden font-sans selection:bg-purple-500/30">
      {/* Decorative gradient background */}
      <div className="absolute top-0 left-0 w-full h-[400px] pointer-events-none overflow-hidden z-0 select-none">
        <div className="absolute -top-[100px] -left-[80px] w-[300px] h-[300px] rounded-full bg-cyan-400/10 dark:bg-cyan-500/10 blur-[80px]" />
        <div className="absolute top-[20px] -right-[100px] w-[350px] h-[350px] rounded-full bg-purple-500/10 dark:bg-purple-600/10 blur-[90px]" />
      </div>

      <div className="relative z-10 w-full flex flex-col items-center space-y-6 mt-2">
        {/* Header section */}
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-xl shadow-indigo-500/20 flex items-center justify-center overflow-hidden transition-transform duration-500 hover:scale-[1.02]">
            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
            <img
              src="/icons/icon128.png"
              className="w-12 h-12 relative z-10 drop-shadow-lg"
              alt="Logo"
            />
          </div>

          <div className="space-y-1.5 px-2">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              {t('popup.title')}
            </h1>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              {t('popup.description')}
            </p>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="w-full bg-card/60 dark:bg-card/40 backdrop-blur-xl border border-border/60 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
            <h2 className="text-[14px] font-bold tracking-tight text-foreground/90">
              {t('popup.platforms')}
            </h2>
          </div>

          <div className="flex flex-col divide-y divide-border/40">
            {platformsToConfigure.map((platform) => {
              const config = PLATFORM_CONFIG[platform];
              if (!config) return null;

              const isSupported = config.supported !== false;
              const isEnabled =
                enabledState[platform as keyof PlatformEnabledState] ?? true;

              const platformColorStr = config.color;

              return (
                <div
                  key={platform}
                  className={cn(
                    'group flex items-center justify-between px-4 py-3 transition-all duration-300 relative',
                    !isSupported
                      ? 'bg-muted/10 opacity-60 grayscale'
                      : isEnabled
                        ? 'bg-transparent hover:bg-muted/10'
                        : 'bg-muted/5 opacity-75 grayscale-[20%]',
                  )}
                >
                  <a
                    href={isSupported ? config.urlPattern : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'flex items-center gap-3 flex-1 min-w-0 pr-4 group/link transition-opacity',
                      isSupported
                        ? 'cursor-pointer hover:opacity-80'
                        : 'cursor-default pointer-events-none',
                    )}
                    onClick={(e) => !isSupported && e.preventDefault()}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border border-border/50 transition-all duration-300 relative overflow-hidden shrink-0',
                        isSupported && isEnabled
                          ? 'bg-background scale-100'
                          : 'bg-muted/50 scale-[0.98]',
                      )}
                    >
                      {/* Subdued platform color background glow if enabled */}
                      {isSupported && isEnabled && (
                        <div
                          className="absolute inset-0 opacity-15 dark:opacity-20 transition-opacity group-hover/link:opacity-25"
                          style={{
                            backgroundColor:
                              platformColorStr === 'blue'
                                ? '#06b6d4' // Cyan to match icon
                                : platformColorStr === 'purple'
                                  ? '#8b5cf6'
                                  : platformColorStr === 'green'
                                    ? '#10b981'
                                    : platformColorStr === 'orange'
                                      ? '#f97316'
                                      : '#888',
                          }}
                        />
                      )}
                      <img
                        src={config.icon}
                        alt={config.name}
                        className={cn(
                          'w-5 h-5 object-contain relative z-10 transition-transform duration-300',
                          isSupported && isEnabled
                            ? 'scale-100'
                            : 'scale-90 opacity-80',
                        )}
                      />
                    </div>

                    <div className="flex flex-col min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold leading-tight text-foreground truncate group-hover/link:underline decoration-foreground/30 underline-offset-2">
                          {config.name}
                        </span>
                        {!isSupported && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50 tracking-tighter uppercase whitespace-nowrap">
                            {t('onboarding.comingSoon')}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                        {config.hostname}
                      </span>
                    </div>
                  </a>

                  <Switch
                    checked={isSupported ? isEnabled : false}
                    disabled={!isSupported}
                    onCheckedChange={(checked) =>
                      isSupported && togglePlatform(platform, checked)
                    }
                    aria-label={t('popup.enablePlatform').replace(
                      '{{platform}}',
                      config.name,
                    )}
                    className={cn(
                      'shrink-0 shadow-md relative',
                      // Custom switch styling for checked state to match branding
                      // Use solid color instead of gradient to fix subpixel edge bleeding bug
                      'data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500',
                      'dark:data-[state=checked]:bg-indigo-500 dark:data-[state=checked]:border-indigo-500',
                      // The thumb shadow adjustment
                      '[&>span]:shadow-sm',
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center pt-2 pb-2">
          <p className="text-[11px] text-muted-foreground/60 font-medium tracking-wide">
            Better Sidebar • Made with ♥️ by Paper Crane Dev
          </p>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
);
