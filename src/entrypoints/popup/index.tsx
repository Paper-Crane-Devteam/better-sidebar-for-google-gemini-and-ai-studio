import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@/index.scss';
import { initPegasusTransport } from '@webext-pegasus/transport/popup';
import {
  hydratePegasusStoreFromCache,
  startPegasusStoreSync,
  usePegasusStore,
  whenPegasusStoreReady,
} from '@/shared/lib/pegasus-store';
import { initI18nLite } from '@/locale/i18n-lite';
import { useI18n } from '@/shared/hooks/useI18n';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/label';
import { Platform, PLATFORM_CONFIG, detectPlatform } from '@/shared/types/platform';
import {
  getPlatformEnabledState,
  setPlatformEnabled,
  PlatformEnabledState,
} from '@/shared/lib/platform-enabled-store';
import { cn } from '@/shared/lib/utils/utils';
import { SlidersHorizontal, Settings2, Globe2, Crown } from 'lucide-react';
import {
  isLicenseValid,
  useLicenseStore,
  type LicenseState,
} from '@/shared/lib/license-store';
import { localTrialEndsAt, useTrialStore } from '@/shared/lib/trial-store';
import { browser } from 'wxt/browser';
import {
  applyCachedExtensionPageTheme,
  applyExtensionPageTheme,
  resolveExtensionPageTheme,
} from '@/shared/lib/extension-page-theme';

// Replay the cached theme synchronously, before anything is painted.
// Must stay above any `await` so it lands in the first frame.
applyCachedExtensionPageTheme();

type Tab = 'platforms' | 'gemini' | 'aistudio';

// Debounce utility
function useDebouncedCallback<T extends (...args: any[]) => any>(fn: T, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]) as T;
}

/**
 * Wraps a store setter so it only runs once the background handshake is done.
 *
 * The UI paints from the cached snapshot before the service worker is up; a
 * write made in that window would not be forwarded to the background (and would
 * be overwritten once the handshake completes), so we hold it until then.
 */
function useSyncedSetter<T extends (...args: any[]) => void>(setter: T): T {
  return useCallback(
    ((...args: Parameters<T>) => {
      void whenPegasusStoreReady().then(() => setter(...args));
    }) as T,
    [setter],
  );
}

// Slider with local state + debounced store write
function DebouncedSlider({ value, min, max, step = 1, onChange }: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const debouncedOnChange = useDebouncedCallback(onChange, 200);

  return (
    <input
      type="range"
      min={min} max={max} step={step}
      value={local}
      onChange={(e) => {
        const v = Number(e.target.value);
        setLocal(v);
        debouncedOnChange(v);
      }}
      className="ui-slider w-full"
    />
  );
}

/**
 * `pro` folds into `power`: it is a superset, and a third badge would be noise.
 * `trial` is Power Pack on the clock: the local install trial or a time-limited
 * code. It wears the power lockup, slightly understated, plus a countdown.
 */
type MemberTier = 'support' | 'power' | 'trial' | null;

const DAY_MS = 24 * 60 * 60 * 1000;

function selectPaidTier(state: LicenseState): 'support' | 'power' | null {
  if (!isLicenseValid(state)) return null;
  if (state.tier === 'support_pack') return 'support';
  // A time-limited code is a trial, not a membership.
  if ((state.tier === 'power_pack' || state.tier === 'pro') && !state.endsAt) return 'power';
  return null;
}

/** End (ms) of the Power Pack trial currently running, if any. */
function selectTrialEndsAt(license: LicenseState, localTrialEnd: number | null): number | null {
  const now = Date.now();
  const codeEnd =
    isLicenseValid(license) &&
    (license.tier === 'power_pack' || license.tier === 'pro') &&
    license.endsAt
      ? license.endsAt
      : null;
  const ends = [codeEnd, localTrialEnd].filter((t): t is number => !!t && t > now);
  return ends.length ? Math.max(...ends) : null;
}

/**
 * Title-text fill for members: starts as plain foreground and only turns toward
 * the theme accent over the last stretch of the word, so the title stays as
 * legible as the plain one on every preset. Power runs on into --ring, which
 * gives the higher tier a second hue without making it any louder.
 */
const MEMBER_TITLE_GRADIENT: Record<Exclude<MemberTier, null>, string> = {
  support:
    'linear-gradient(90deg, rgb(var(--foreground)) 40%, rgb(var(--highlight)) 100%)',
  power:
    'linear-gradient(90deg, rgb(var(--foreground)) 30%, rgb(var(--highlight)) 72%, rgb(var(--ring)) 100%)',
  trial:
    'linear-gradient(90deg, rgb(var(--foreground)) 30%, rgb(var(--highlight)) 72%, rgb(var(--ring)) 100%)',
};

/** Crown fill per tier: trial gets an outline only, the "not yet yours" crown. */
const CROWN_FILL: Record<Exclude<MemberTier, null>, number> = {
  support: 0.2,
  power: 0.45,
  trial: 0,
};

/**
 * Popup header lockup: logo tile + title.
 *
 * Pack owners get the same lockup, dressed rather than annotated — a small
 * crown tipped onto the logo tile's corner, an accent hairline around the tile,
 * the title fading into the accent, and the tier set in small caps beneath it.
 * Every colour is a theme token (--highlight, --ring, --background), so it
 * follows whichever preset is active.
 */
function HeaderLockup({ tier, trialEndsAt }: { tier: MemberTier; trialEndsAt: number | null }) {
  const { t } = useI18n();
  const isTrial = tier === 'trial' && !!trialEndsAt;
  const daysLeft = isTrial ? Math.max(1, Math.ceil((trialEndsAt - Date.now()) / DAY_MS)) : 0;

  const tooltip = isTrial
    ? t('popup.trialTooltip', { date: new Date(trialEndsAt).toLocaleString() })
    : tier
      ? t('popup.badgeThanks')
      : undefined;

  return (
    <div className="flex items-center gap-3" title={tooltip}>
      <div className="relative shrink-0">
        <div
          className={cn(
            'w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary shadow-md flex items-center justify-center',
            tier && 'ring-1 ring-offset-2 ring-offset-background',
            tier && (isTrial ? 'ring-highlight/25' : 'ring-highlight/40'),
          )}
        >
          <img src="/icons/icon128.png" className="w-6 h-6 object-contain drop-shadow-sm" alt="Logo" />
        </div>
        {tier && (
          // Background-filled disc so the crown reads cleanly over the tile's
          // gradient, whatever --primary happens to be.
          <span
            aria-hidden
            className="absolute -top-2 -right-2 w-[18px] h-[18px] rounded-full bg-background shadow-sm ring-1 ring-highlight/30 flex items-center justify-center rotate-[18deg]"
          >
            <Crown
              className="w-[11px] h-[11px] text-highlight"
              strokeWidth={2.25}
              fill="currentColor"
              fillOpacity={CROWN_FILL[tier]}
            />
          </span>
        )}
      </div>

      <div className="flex flex-col">
        <h1
          className="text-base font-bold tracking-tight text-foreground leading-tight"
          style={
            tier
              ? {
                  backgroundImage: MEMBER_TITLE_GRADIENT[tier],
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }
              : undefined
          }
        >
          {t('popup.title')}
        </h1>
        {isTrial ? (
          <span className="mt-0.5 flex items-center gap-1.5 leading-none">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-highlight/90">
              {t('popup.badgeTrial')}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              · {t('popup.trialDaysLeft', { count: daysLeft })}
            </span>
          </span>
        ) : (
          tier &&
          tier !== 'trial' && (
            <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] leading-none text-highlight/90">
              {t(tier === 'power' ? 'popup.badgePower' : 'popup.badgeSupporter')}
            </span>
          )
        )}
      </div>
    </div>
  );
}

interface OptionsProps {
  initialEnabledState: PlatformEnabledState;
  detectedPlatform: Platform;
}

const Options = ({ initialEnabledState, detectedPlatform }: OptionsProps) => {
  const { t } = useI18n();
  const [enabledState, setEnabledState] =
    useState<PlatformEnabledState>(initialEnabledState);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (detectedPlatform === Platform.GEMINI) return 'gemini';
    if (detectedPlatform === Platform.AI_STUDIO) return 'aistudio';
    return 'platforms';
  });

  const paidTier = useLicenseStore(selectPaidTier);
  const localTrialEnd = useTrialStore((s) => localTrialEndsAt(s));
  const trialEndsAt = useLicenseStore((s) => selectTrialEndsAt(s, localTrialEnd));
  // Paid Power Pack never shows the trial; anyone else in a trial does.
  const memberTier: MemberTier =
    paidTier === 'power' ? 'power' : trialEndsAt ? 'trial' : paidTier;
  const theme = usePegasusStore((state) => state.theme);
  const customTheme = usePegasusStore((state) => state.customTheme);

  // Drop the static boot shell once the real UI is committed to the DOM
  useEffect(() => {
    document.getElementById('boot')?.remove();
  }, []);

  const geminiSettings = usePegasusStore((s) => s.enhancedFeatures.gemini);
  const aistudioSettings = usePegasusStore((s) => s.enhancedFeatures.aistudio);
  const setGeminiFeature = useSyncedSetter(
    usePegasusStore((s) => s.setGeminiEnhancedFeature),
  );
  const setAIStudioFeature = useSyncedSetter(
    usePegasusStore((s) => s.setAIStudioEnhancedFeature),
  );

  // Resolve the real theme and refresh the boot cache.
  // The `theme-gemini` class and (usually) the correct dark/light state are
  // already applied by applyCachedExtensionPageTheme() above, so this normally
  // results in no visual change at all.
  useEffect(() => {
    let cancelled = false;
    void resolveExtensionPageTheme(theme, customTheme).then((snapshot) => {
      if (!cancelled) applyExtensionPageTheme(snapshot);
    });
    return () => {
      cancelled = true;
    };
  }, [theme, customTheme]);

  const togglePlatform = async (platform: Platform, enabled: boolean) => {
    setEnabledState((prev) => ({ ...prev, [platform]: enabled }));
    await setPlatformEnabled(platform, enabled);
  };

  const platformsToConfigure = [Platform.AI_STUDIO, Platform.GEMINI];

  return (
    <div className="w-[420px] h-[600px] flex flex-col bg-background text-foreground overflow-hidden font-sans selection:bg-primary/30">
      <div className="absolute top-0 left-0 w-full h-[400px] pointer-events-none overflow-hidden z-0 select-none">
        <div className="absolute -top-[100px] -left-[80px] w-[300px] h-[300px] rounded-full bg-primary/5 blur-[80px]" />
        {/* Members get one of the two ambient glows warmed by the accent, so the
            lockup's tint carries into the page instead of sitting on top of it. */}
        <div className={cn('absolute top-[20px] -right-[100px] w-[350px] h-[350px] rounded-full blur-[90px]', memberTier ? 'bg-highlight/[0.07]' : 'bg-primary/5')} />
      </div>

      {/* Header */}
      <div className="relative z-10 w-full flex-shrink-0 flex flex-col items-center pt-6 pb-4 space-y-4 bg-background/50 backdrop-blur-sm">
        <HeaderLockup tier={memberTier} trialEndsAt={trialEndsAt} />

        <div className="flex bg-muted/50 p-1 rounded-lg w-[85%]">
          <button
            onClick={() => setActiveTab('platforms')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-all duration-200",
              activeTab === 'platforms' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Globe2 className="w-4 h-4" />
            {t('popup.platforms')}
          </button>
          
          {(detectedPlatform === Platform.GEMINI || activeTab === 'gemini') && (
            <button
              onClick={() => setActiveTab('gemini')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-all duration-200",
                activeTab === 'gemini' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Settings2 className="w-4 h-4" />
              {t('geminiUI.title')}
            </button>
          )}

          {(detectedPlatform === Platform.AI_STUDIO || activeTab === 'aistudio') && (
            <button
              onClick={() => setActiveTab('aistudio')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md transition-all duration-200",
                activeTab === 'aistudio' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Settings2 className="w-4 h-4" />
              {t('aistudioUI.title')}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {activeTab === 'platforms' && (
          <div className="w-full bg-card/60 backdrop-blur-xl rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs text-muted-foreground">{t('popup.description')}</p>
            </div>
            <div className="flex flex-col">
              {platformsToConfigure.map((platform) => {
                const config = PLATFORM_CONFIG[platform];
                if (!config) return null;
                const isSupported = config.supported !== false;
                const isEnabled = enabledState[platform as keyof PlatformEnabledState] ?? true;
                const platformColorStr = config.color;

                return (
                  <div
                    key={platform}
                    className={cn(
                      'group flex items-center justify-between p-4 transition-all duration-300 relative',
                      !isSupported ? 'bg-muted/10 opacity-60 grayscale' : isEnabled ? 'bg-transparent hover:bg-muted/10' : 'bg-muted/5 opacity-75 grayscale-[20%]'
                    )}
                  >
                    <a
                      href={isSupported ? config.urlPattern : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'flex items-center gap-3 flex-1 min-w-0 pr-4 transition-opacity',
                        isSupported ? 'cursor-pointer hover:opacity-80' : 'cursor-default pointer-events-none'
                      )}
                      onClick={(e) => !isSupported && e.preventDefault()}
                    >
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden shrink-0',
                        isSupported && isEnabled ? 'bg-background shadow-sm scale-100' : 'bg-muted/50 scale-[0.98]'
                      )}>
                        {isSupported && isEnabled && (
                          <div className="absolute inset-0 opacity-15 dark:opacity-20" style={{ backgroundColor: platformColorStr }} />
                        )}
                        <img src={config.icon} alt={config.name} className="w-5 h-5 relative z-10" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate group-hover:underline underline-offset-2 decoration-foreground/30">{config.name}</span>
                          {!isSupported && <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-muted text-muted-foreground uppercase leading-none">{t('onboarding.comingSoon')}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground truncate mt-1">{config.hostname}</span>
                      </div>
                    </a>
                    <Switch
                      checked={isSupported ? isEnabled : false}
                      disabled={!isSupported}
                      onCheckedChange={(c) => isSupported && togglePlatform(platform, c)}
                      className="data-[state=checked]:bg-primary data-[state=checked]:border-primary shrink-0"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'gemini' && (
          <div className="space-y-6 pb-4">
            {!geminiSettings ? (
              <div className="text-sm text-muted-foreground text-center py-8">{t('common.loading')}</div>
            ) : (
              <>
                {/* Layout Dimensions */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{t('geminiUI.layoutDimensions')}</h3>
                  </div>
                  <div className="bg-card/40 rounded-xl p-4 space-y-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">{t('geminiUI.sidebarWidth')}</Label>
                        <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-2 py-1 rounded leading-none">{geminiSettings.sidebarWidth}px</span>
                      </div>
                      <DebouncedSlider value={geminiSettings.sidebarWidth} min={300} max={550} onChange={(v) => setGeminiFeature('sidebarWidth', v)} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">{t('geminiUI.chatContentWidth')}</Label>
                        <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-2 py-1 rounded leading-none">{geminiSettings.chatWidth}%</span>
                      </div>
                      <DebouncedSlider value={geminiSettings.chatWidth} min={40} max={100} onChange={(v) => setGeminiFeature('chatWidth', v)} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">{t('geminiUI.inputBoxWidth')}</Label>
                        <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-2 py-1 rounded leading-none">{geminiSettings.inputWidth}%</span>
                      </div>
                      <DebouncedSlider value={geminiSettings.inputWidth} min={40} max={100} onChange={(v) => setGeminiFeature('inputWidth', v)} />
                    </div>
                  </div>
                </div>

                {/* Element Visibility */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{t('geminiUI.elementVisibility')}</h3>
                  </div>
                  <div className="bg-card/40 rounded-xl">
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.aiDisclaimer')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.aiDisclaimerDesc')}</p>
                      </div>
                      <Switch checked={!geminiSettings.hideDisclaimer} onCheckedChange={(c) => setGeminiFeature('hideDisclaimer', !c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.upgradeButton')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.upgradeButtonDesc')}</p>
                      </div>
                      <Switch checked={!geminiSettings.hideUpgrade} onCheckedChange={(c) => setGeminiFeature('hideUpgrade', !c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.hotkeyHelper')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.hotkeyHelperDesc')}</p>
                      </div>
                      <Switch checked={geminiSettings.showHotkeyHelper} onCheckedChange={(c) => setGeminiFeature('showHotkeyHelper', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                  </div>
                </div>

                {/* Additional Features */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{t('geminiUI.additionalFeatures')}</h3>
                  </div>
                  <div className="bg-card/40 rounded-xl">
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.zenMode')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.zenModeDesc')}</p>
                      </div>
                      <Switch checked={geminiSettings.zenMode} onCheckedChange={(c) => setGeminiFeature('zenMode', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.smartScrollbar')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.smartScrollbarDesc')}</p>
                      </div>
                      <Switch checked={geminiSettings.showSmartScrollbar} onCheckedChange={(c) => setGeminiFeature('showSmartScrollbar', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.autoHideInput')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.autoHideInputDesc')}</p>
                      </div>
                      <Switch checked={geminiSettings.autoHideInput} onCheckedChange={(c) => setGeminiFeature('autoHideInput', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.slashCommand')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.slashCommandDesc')}</p>
                      </div>
                      <Switch checked={geminiSettings.slashCommand} onCheckedChange={(c) => setGeminiFeature('slashCommand', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('geminiUI.agentTrigger')}</Label>
                        <p className="text-xs text-muted-foreground">{t('geminiUI.agentTriggerDesc')}</p>
                      </div>
                      <Switch checked={geminiSettings.agentTrigger ?? true} onCheckedChange={(c) => setGeminiFeature('agentTrigger', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'aistudio' && (
          <div className="space-y-6 pb-4">
            {!aistudioSettings ? (
              <div className="text-sm text-muted-foreground text-center py-8">{t('common.loading')}</div>
            ) : (
              <>
                {/* Layout Dimensions */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{t('aistudioUI.layoutDimensions')}</h3>
                  </div>
                  <div className="bg-card/40 rounded-xl p-4 space-y-5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">{t('aistudioUI.sidebarWidth')}</Label>
                        <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-2 py-1 rounded leading-none">{aistudioSettings.sidebarWidth}px</span>
                      </div>
                      <DebouncedSlider value={aistudioSettings.sidebarWidth} min={280} max={500} onChange={(v) => setAIStudioFeature('sidebarWidth', v)} />
                    </div>
                  </div>
                </div>

                {/* Additional Features */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">{t('aistudioUI.additionalFeatures')}</h3>
                  </div>
                  <div className="bg-card/40 rounded-xl">
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('aistudioUI.autoHideInput')}</Label>
                        <p className="text-xs text-muted-foreground">{t('aistudioUI.autoHideInputDesc')}</p>
                      </div>
                      <Switch checked={aistudioSettings.autoHideInput} onCheckedChange={(c) => setAIStudioFeature('autoHideInput', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('aistudioUI.autoHideRunSettings')}</Label>
                        <p className="text-xs text-muted-foreground">{t('aistudioUI.autoHideRunSettingsDesc')}</p>
                      </div>
                      <Switch checked={aistudioSettings.autoHideRunSettings} onCheckedChange={(c) => setAIStudioFeature('autoHideRunSettings', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('aistudioUI.smartScrollbar')}</Label>
                        <p className="text-xs text-muted-foreground">{t('aistudioUI.smartScrollbarDesc')}</p>
                      </div>
                      <Switch checked={aistudioSettings.showSmartScrollbar ?? true} onCheckedChange={(c) => setAIStudioFeature('showSmartScrollbar', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('aistudioUI.slashCommand')}</Label>
                        <p className="text-xs text-muted-foreground">{t('aistudioUI.slashCommandDesc')}</p>
                      </div>
                      <Switch checked={aistudioSettings.slashCommand} onCheckedChange={(c) => setAIStudioFeature('slashCommand', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('aistudioUI.agentTrigger')}</Label>
                        <p className="text-xs text-muted-foreground">{t('aistudioUI.agentTriggerDesc')}</p>
                      </div>
                      <Switch checked={aistudioSettings.agentTrigger ?? true} onCheckedChange={(c) => setAIStudioFeature('agentTrigger', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                    <div className="flex items-center justify-between p-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">{t('aistudioUI.hotkeyHelper')}</Label>
                        <p className="text-xs text-muted-foreground">{t('aistudioUI.hotkeyHelperDesc')}</p>
                      </div>
                      <Switch checked={aistudioSettings.showHotkeyHelper} onCheckedChange={(c) => setAIStudioFeature('showHotkeyHelper', c)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 flex-shrink-0 text-center py-2 bg-background/80 backdrop-blur-sm">
        <p className="text-[10px] text-muted-foreground font-medium tracking-wide">
          {t('footer.madeWith')}
        </p>
      </div>
    </div>
  );
};

const detectActivePlatform = async (): Promise<Platform> => {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;
    if (!url) return Platform.UNKNOWN;
    return detectPlatform(new URL(url).hostname);
  } catch {
    return Platform.UNKNOWN;
  }
};

/**
 * Boot the popup off local storage only.
 *
 * Previously this awaited `getPegasusStoreReady()`, which needs the MV3 service
 * worker to be running. On the first click after the worker idled out that meant
 * waiting for a full worker cold start (which also races the sqlite/WASM init)
 * before anything was rendered — the popup looked unresponsive. Now every value
 * needed for the first paint comes from `storage.local`, and the background
 * handshake happens in parallel, only gating writes.
 */
const bootstrap = async () => {
  initPegasusTransport();

  const enabledStatePromise = getPlatformEnabledState();
  const platformPromise = detectActivePlatform();

  await hydratePegasusStoreFromCache();
  // Started after hydration on purpose: the proxy store snapshots local state
  // when it is created, and seeding it with the cached values (instead of the
  // hardcoded defaults) keeps the handshake from repainting the UI.
  startPegasusStoreSync();
  await initI18nLite(usePegasusStore.getState().language);

  const [enabledState, detected] = await Promise.all([
    enabledStatePromise,
    platformPromise,
  ]);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Options initialEnabledState={enabledState} detectedPlatform={detected} />
    </React.StrictMode>,
  );
};

bootstrap();
