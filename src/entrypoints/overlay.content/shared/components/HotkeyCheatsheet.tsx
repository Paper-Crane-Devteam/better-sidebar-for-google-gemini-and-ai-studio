import React, { useState } from 'react';
import { Keyboard, X, EyeOff } from 'lucide-react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  HOTKEY_DEFINITIONS,
  HotkeyActionId,
  HotkeyCategory,
  useHotkeyStore,
} from '@/shared/lib/hotkey-store';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { modal } from '@/shared/lib/modal';

// ─── Kbd Component ───────────────────────────────────────────────────────────

const isMac =
  typeof navigator !== 'undefined' &&
  (navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac'));

const MODIFIER_SYMBOLS: Record<string, string> = {
  Ctrl: isMac ? '⌘' : 'Ctrl',
  Alt: isMac ? '⌥' : 'Alt',
  Shift: isMac ? '⇧' : 'Shift',
};

/** Renders a single key as a keyboard cap */
const Kbd = ({ children }: { children: string }) => (
  <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-[11px] font-medium font-sans rounded border border-border/80 bg-muted/60 text-foreground shadow-[0_1px_0_1px_rgba(0,0,0,0.05)] leading-none">
    {children}
  </kbd>
);

/** Renders a full binding like Alt+Shift+S as keyboard caps */
const KeyBindingCaps = ({ binding }: { binding: string | null }) => {
  if (!binding) return <span className="text-muted-foreground text-xs">—</span>;

  const parts = binding.split('+');
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, i) => {
        const display = MODIFIER_SYMBOLS[part] || part;
        return <Kbd key={i}>{display}</Kbd>;
      })}
    </span>
  );
};

// ─── Category Labels ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<HotkeyCategory, string> = {
  general: 'hotkeys.categoryGeneral',
  navigation: 'hotkeys.categoryNavigation',
  actions: 'hotkeys.categoryActions',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const HotkeyCheatsheet = () => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const platform = detectPlatform();
  const bindings = useHotkeyStore((s) => s.bindings);

  const showHelper =
    platform === Platform.GEMINI
      ? useSettingsStore((s) => s.enhancedFeatures.gemini.showHotkeyHelper)
      : useSettingsStore((s) => s.enhancedFeatures.aistudio?.showHotkeyHelper ?? true);

  const setGeminiFeature = useSettingsStore((s) => s.setGeminiFeature);
  const setAIStudioFeature = useSettingsStore((s) => s.setAIStudioFeature);

  if (!showHelper) return null;

  const handleHide = async () => {
    const confirmed = await modal.confirm({
      title: t('hotkeyHelper.hideTitle'),
      content: t('hotkeyHelper.hideConfirm'),
    });
    if (confirmed) {
      setIsOpen(false);
      if (platform === Platform.GEMINI) {
        setGeminiFeature('showHotkeyHelper', false);
      } else {
        setAIStudioFeature('showHotkeyHelper', false);
      }
    }
  };

  // Group by category, filtering out hotkeys not available on current platform
  const platformKey = platform === Platform.GEMINI ? 'gemini' : 'aistudio';

  const isAvailable = (id: HotkeyActionId) => {
    const def = HOTKEY_DEFINITIONS[id];
    return !def.platforms || def.platforms.includes(platformKey);
  };

  const categories: { category: HotkeyCategory; ids: HotkeyActionId[] }[] = [
    {
      category: 'general',
      ids: Object.entries(HOTKEY_DEFINITIONS)
        .filter(([id, def]) => def.category === 'general' && isAvailable(id as HotkeyActionId))
        .map(([id]) => id as HotkeyActionId),
    },
    {
      category: 'navigation',
      ids: Object.entries(HOTKEY_DEFINITIONS)
        .filter(([id, def]) => def.category === 'navigation' && isAvailable(id as HotkeyActionId))
        .map(([id]) => id as HotkeyActionId),
    },
    {
      category: 'actions',
      ids: Object.entries(HOTKEY_DEFINITIONS)
        .filter(([id, def]) => def.category === 'actions' && isAvailable(id as HotkeyActionId))
        .map(([id]) => id as HotkeyActionId),
    },
  ];

  return (
    <>
      {/* Floating icon button + panel wrapper */}
      <HotkeyCheatsheetInner
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        categories={categories}
        bindings={bindings}
        onHide={handleHide}
      />
    </>
  );
};

/** Inner component to use ref for click-outside detection */
const HotkeyCheatsheetInner = ({
  isOpen,
  setIsOpen,
  categories,
  bindings,
  onHide,
}: {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  categories: { category: HotkeyCategory; ids: HotkeyActionId[] }[];
  bindings: Record<HotkeyActionId, string | null>;
  onHide: () => void;
}) => {
  const { t } = useI18n();

  return (
    <div className="fixed bottom-8 right-8 z-40">
      {/* Cheatsheet panel (above the icon) */}
      {isOpen && (
        <div className="absolute bottom-12 right-0 w-[320px] rounded-lg border border-border bg-background/95 backdrop-blur-md shadow-xl p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{t('hotkeyHelper.title')}</h3>
            <div className="flex items-center gap-1">
              <button
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                onClick={(e) => { e.stopPropagation(); onHide(); }}
                title={t('hotkeyHelper.hide')}
              >
                <EyeOff className="w-3.5 h-3.5" />
              </button>
              <button
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setIsOpen(false)}
                title={t('common.close')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Shortcut list */}
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {categories.map(({ category, ids }) => (
              <div key={category}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                  {t(CATEGORY_LABELS[category])}
                </p>
                <div className="space-y-1">
                  {ids.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-xs text-foreground/90">
                        {t(HOTKEY_DEFINITIONS[id].labelKey)}
                      </span>
                      <KeyBindingCaps binding={bindings[id]} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Icon button */}
      <button
        className="w-9 h-9 rounded-lg border border-border/60 bg-background/90 backdrop-blur-sm shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border transition-all hover:shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
        title={t('hotkeyHelper.title')}
      >
        <Keyboard className="w-4 h-4" />
      </button>
    </div>
  );
};
