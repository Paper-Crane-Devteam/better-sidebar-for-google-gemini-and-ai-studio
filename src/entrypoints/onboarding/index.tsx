import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.scss';
import '@/locale/i18n';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { cn } from '@/shared/lib/utils/utils';
import { PLATFORM_CONFIG } from '@/shared/types/platform';
import { useI18n } from '@/shared/hooks/useI18n';

const Onboarding = () => {
  const theme = useSettingsStore((state) => state.theme);
  const { t } = useI18n();

  useEffect(() => {
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

  // Handle get started
  const handleGetStarted = () => {
    // Open AI Studio by default
    window.location.href =
      PLATFORM_CONFIG.aistudio.urlPattern + '/app/prompts/new_chat';
  };

  // Filter out unknown platforms
  const platformsToShow = Object.values(PLATFORM_CONFIG).filter(
    (config) => config.id !== 'unknown',
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center relative overflow-hidden font-sans selection:bg-purple-500/30">
      {/* Decorative gradient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-cyan-400/10 dark:bg-cyan-500/10 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-purple-500/10 dark:bg-purple-600/10 blur-[140px]" />
        <div className="absolute -bottom-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 dark:bg-indigo-600/10 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl w-full px-6 py-12 flex flex-col items-center">
        {/* Header section */}
        <div className="flex flex-col items-center text-center space-y-8 mb-16 max-w-2xl">
          <div className="relative w-28 h-28 rounded-3xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-2xl shadow-indigo-500/30 flex items-center justify-center overflow-hidden animate-in zoom-in duration-700">
            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm" />
            <img
              src="/icons/icon128.png"
              className="w-16 h-16 relative z-10 drop-shadow-xl"
              alt="Logo"
            />
          </div>

          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              {t('onboarding.welcome')}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed font-medium">
              {t('onboarding.description')}
            </p>
          </div>
        </div>

        {/* Features / Platforms Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mb-16 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 fill-mode-both">
          {platformsToShow.map((config) => {
            const isSupported = config.supported;

            return (
              <a
                key={config.name}
                href={isSupported ? config.urlPattern : undefined}
                target={isSupported ? '_blank' : undefined}
                rel={isSupported ? 'noreferrer' : undefined}
                onClick={!isSupported ? (e) => e.preventDefault() : undefined}
                className={cn(
                  'group relative flex items-center p-6 bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl transition-all duration-300 shadow-sm',
                  isSupported
                    ? 'hover:bg-card/80 dark:hover:bg-card/40 hover:border-border hover:shadow-xl hover:-translate-y-1 cursor-pointer'
                    : 'opacity-60 grayscale cursor-not-allowed',
                )}
              >
                {isSupported && (
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity rounded-2xl"
                    style={{ backgroundColor: config.color }}
                  />
                )}
                <div className="w-14 h-14 rounded-xl shadow-sm border border-border/50 flex items-center justify-center bg-background shrink-0 mr-5 relative z-10">
                  <img
                    src={config.icon}
                    alt={config.name}
                    className="w-8 h-8 object-contain"
                  />
                </div>
                <div className="flex flex-col relative z-10">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                      {config.name}
                    </h3>
                    {!isSupported && (
                      <span className="px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground border border-border">
                        {t('onboarding.unsupported')}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {config.hostname}
                  </span>
                </div>
                {isSupported && (
                  <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity relative z-10">
                    <svg
                      className="w-5 h-5 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 5l7 7m0 0l-7 7m7-7H3"
                      />
                    </svg>
                  </div>
                )}
              </a>
            );
          })}
        </div>

        {/* Call to Action */}
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 fill-mode-both flex flex-col items-center">
          <button
            onClick={handleGetStarted}
            className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-300 bg-gradient-to-r from-cyan-500 to-indigo-600 rounded-full hover:from-cyan-400 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-background shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5"
          >
            <span>{t('onboarding.getStarted')}</span>
            <svg
              className="w-5 h-5 ml-2 transition-transform duration-300 group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </button>

          <div className="mt-12 opacity-60">
            <p className="text-sm text-muted-foreground font-medium tracking-wide">
              Better Sidebar • Made with ♥️ by Paper Crane Dev
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Onboarding />
  </React.StrictMode>,
);
