import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import { Button } from '../../../components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  useHotkeyStore,
  HOTKEY_DEFINITIONS,
  HotkeyActionId,
  HotkeyCategory,
  HotkeyBinding,
  keyEventToBindingString,
} from '@/shared/lib/hotkey-store';
import { detectPlatform, Platform } from '@/shared/types/platform';

// ─── Key Binding Display Component ───────────────────────────────────────────

const isMac = typeof navigator !== 'undefined' && (navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac'));

/** Maps modifier names to macOS symbols */
const MODIFIER_SYMBOLS: Record<string, string> = {
  Ctrl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
};

/**
 * Renders a hotkey binding with properly sized modifier symbols.
 * On macOS, shows ⌥⇧S with larger modifier symbols.
 * On other platforms, shows Alt+Shift+S as text.
 */
const KeyBindingDisplay = ({ binding }: { binding: HotkeyBinding }) => {
  if (!binding) return <span className="text-muted-foreground">—</span>;

  if (!isMac) {
    return <span>{binding}</span>;
  }

  // Split binding into parts and render each
  const parts = binding.split('+');
  return (
    <span className="inline-flex items-center gap-0.5">
      {parts.map((part, i) => {
        const symbol = MODIFIER_SYMBOLS[part];
        if (symbol) {
          return (
            <kbd key={i} className="text-sm leading-none font-sans">
              {symbol}
            </kbd>
          );
        }
        // Regular key
        return (
          <kbd key={i} className="text-xs leading-none">
            {part}
          </kbd>
        );
      })}
    </span>
  );
};

// ─── Hotkey Recorder Component ───────────────────────────────────────────────

interface HotkeyRecorderProps {
  actionId: HotkeyActionId;
  binding: HotkeyBinding;
  onRecord: (actionId: HotkeyActionId, binding: HotkeyBinding) => void;
  onReset: (actionId: HotkeyActionId) => void;
  conflict: string | null;
}

const HotkeyRecorder = ({
  actionId,
  binding,
  onRecord,
  onReset,
  conflict,
}: HotkeyRecorderProps) => {
  const { t } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<HTMLButtonElement>(null);

  // Set global flag so the hotkey listener skips events while recording
  useEffect(() => {
    (window as any).__BETTER_SIDEBAR_HOTKEY_RECORDING__ = isRecording;
    return () => {
      (window as any).__BETTER_SIDEBAR_HOTKEY_RECORDING__ = false;
    };
  }, [isRecording]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecording) return;

      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.code === 'Escape') {
        setIsRecording(false);
        return;
      }

      // Backspace/Delete unbinds the shortcut
      if (e.code === 'Backspace' || e.code === 'Delete') {
        onRecord(actionId, null);
        setIsRecording(false);
        return;
      }

      const bindingStr = keyEventToBindingString(e);
      if (bindingStr) {
        onRecord(actionId, bindingStr);
        setIsRecording(false);
      }
    },
    [isRecording, actionId, onRecord],
  );

  useEffect(() => {
    if (isRecording) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isRecording, handleKeyDown]);

  // Click outside to cancel recording
  useEffect(() => {
    if (!isRecording) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        recorderRef.current &&
        !recorderRef.current.contains(e.target as Node)
      ) {
        setIsRecording(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isRecording]);

  const defaultBinding = HOTKEY_DEFINITIONS[actionId].defaultBinding;
  const isModified = binding !== defaultBinding;

  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={recorderRef}
        data-hotkey-recording={isRecording ? 'true' : undefined}
        className={`
          inline-flex items-center justify-center
          min-w-[120px] h-7 px-3
          text-xs font-mono rounded-md border transition-all
          ${
            isRecording
              ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20 animate-pulse'
              : conflict
                ? 'border-destructive/50 bg-destructive/5 text-destructive'
                : 'border-border bg-muted/50 text-foreground hover:bg-muted'
          }
        `}
        onClick={() => setIsRecording(true)}
        title={
          isRecording
            ? t('hotkeys.pressKeys')
            : t('hotkeys.clickToRecord')
        }
      >
        {isRecording ? (
          <span className="text-xs">{t('hotkeys.recording')}</span>
        ) : (
          <KeyBindingDisplay binding={binding} />
        )}
      </button>
      {isModified && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => onReset(actionId)}
          title={t('hotkeys.resetToDefault')}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

// ─── Hotkey Row ──────────────────────────────────────────────────────────────

interface HotkeyRowProps {
  actionId: HotkeyActionId;
  onRecord: (actionId: HotkeyActionId, binding: HotkeyBinding) => void;
  onReset: (actionId: HotkeyActionId) => void;
}

const HotkeyRow = ({ actionId, onRecord, onReset }: HotkeyRowProps) => {
  const { t } = useI18n();
  const binding = useHotkeyStore((s) => s.getBinding(actionId));
  const isConflict = useHotkeyStore((s) => s.isConflict);

  const conflict = binding ? isConflict(binding, actionId) : null;
  const conflictLabel = conflict
    ? t(HOTKEY_DEFINITIONS[conflict].labelKey)
    : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">
            {t(HOTKEY_DEFINITIONS[actionId].labelKey)}
          </span>
        </div>
        <HotkeyRecorder
          actionId={actionId}
          binding={binding}
          onRecord={onRecord}
          onReset={onReset}
          conflict={conflictLabel}
        />
      </div>
      {conflictLabel && (
        <p className="text-xs text-destructive pl-0.5">
          {t('hotkeys.conflictWith', { action: conflictLabel })}
        </p>
      )}
    </div>
  );
};

// ─── Category Section ────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: HotkeyCategory;
  actionIds: HotkeyActionId[];
  onRecord: (actionId: HotkeyActionId, binding: HotkeyBinding) => void;
  onReset: (actionId: HotkeyActionId) => void;
}

const CATEGORY_LABEL_KEYS: Record<HotkeyCategory, string> = {
  general: 'hotkeys.categoryGeneral',
  navigation: 'hotkeys.categoryNavigation',
  actions: 'hotkeys.categoryActions',
};

const CategorySection = ({
  category,
  actionIds,
  onRecord,
  onReset,
}: CategorySectionProps) => {
  const { t } = useI18n();

  return (
    <div className="space-y-2">
      <h3 className="text-lg font-medium">
        {t(CATEGORY_LABEL_KEYS[category])}
      </h3>
      <Separator />
      <div className="grid gap-3 py-3">
        {actionIds.map((id) => (
          <HotkeyRow key={id} actionId={id} onRecord={onRecord} onReset={onReset} />
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const HotkeySettings = () => {
  const { t } = useI18n();
  const setBinding = useHotkeyStore((s) => s.setBinding);
  const resetBinding = useHotkeyStore((s) => s.resetBinding);
  const resetAll = useHotkeyStore((s) => s.resetAll);

  const handleRecord = useCallback(
    (actionId: HotkeyActionId, binding: HotkeyBinding) => {
      setBinding(actionId, binding);
    },
    [setBinding],
  );

  const handleReset = useCallback(
    (actionId: HotkeyActionId) => {
      resetBinding(actionId);
    },
    [resetBinding],
  );

  // Group actions by category, filtering by platform
  const platform = detectPlatform();
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
    <div className="space-y-6">
      {/* Header with description and reset all button */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {t('hotkeys.description')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs shrink-0"
          onClick={resetAll}
        >
          <RotateCcw className="h-3 w-3 mr-1.5" />
          {t('hotkeys.resetAll')}
        </Button>
      </div>

      {/* Category sections */}
      {categories.map(({ category, ids }) => (
        <CategorySection
          key={category}
          category={category}
          actionIds={ids}
          onRecord={handleRecord}
          onReset={handleReset}
        />
      ))}

      {/* Helper text */}
      <div className="rounded-md bg-muted/50 border p-3 space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {t('hotkeys.helpRecording')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('hotkeys.helpUnbind')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('hotkeys.helpEscape')}
        </p>
      </div>
    </div>
  );
};
