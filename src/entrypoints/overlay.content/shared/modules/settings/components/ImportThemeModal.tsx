import React, { useState, useMemo } from 'react';
import { AlertCircle, CheckCircle2, Sparkles, ShoppingCart } from 'lucide-react';
import { validateUserTheme } from '@/themes/user-themes';
import { useUserThemeStore, refreshThemeRegistry } from '@/themes';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { openPurchasePage } from '@/shared/lib/license-links';
import { toast } from '@/shared/lib/toast';
import { useI18n } from '@/shared/hooks/useI18n';
import type { ValidationResult } from '@/themes/user-themes';

/**
 * Content component for the Import Theme modal.
 * Renders a textarea for JSON input with real-time validation.
 *
 * This is used as the `content` prop of the GlobalModal.
 * The modal's built-in footer handles confirm/cancel buttons.
 */

/**
 * Handle the import action when the modal's confirm button is clicked.
 * This is called from the modal's onConfirm callback.
 * Returns true if import was successful, false otherwise.
 */
export function handleImportTheme(t: (key: string) => string): boolean {
  // We need to get the textarea value from the DOM since the modal content
  // is rendered separately from the confirm handler.
  // Instead, we use a module-level ref approach.
  const validation = getLatestValidation();
  if (!validation?.valid || !validation.theme) {
    toast.error(t('themeSettings.invalidTheme'));
    return false;
  }

  // Check license
  const licenseState = useLicenseStore.getState();
  if (!isLicenseValid(licenseState)) {
    // Show license prompt inside the modal content
    setShowLicensePromptExternal(true);
    return false;
  }

  // Check if theme id conflicts with existing
  const existing = useUserThemeStore.getState().themes;
  if (existing.some((th) => th.id === validation.theme!.id)) {
    useUserThemeStore.getState().updateTheme(validation.theme!.id, validation.theme!);
  } else {
    useUserThemeStore.getState().addTheme(validation.theme!);
  }

  // Refresh registry and apply
  refreshThemeRegistry();
  useSettingsStore.getState().setCustomTheme(validation.theme!.id);

  toast.success(t('themeSettings.importSuccess'));
  return true;
}

// ─── Module-level state bridge for modal confirm handler ────────────────────

let latestValidation: ValidationResult | null = null;
let showLicensePromptSetter: ((v: boolean) => void) | null = null;

function getLatestValidation(): ValidationResult | null {
  return latestValidation;
}

function setShowLicensePromptExternal(v: boolean): void {
  showLicensePromptSetter?.(v);
}

/**
 * Stateful version of ImportThemeModalContent that bridges state to the
 * module-level confirm handler.
 */
export function ImportThemeModalContentStateful() {
  const { t } = useI18n();
  const [jsonInput, setJsonInput] = useState('');
  const [showLicensePrompt, setShowLicensePrompt] = useState(false);

  // Bridge the setter to module level
  showLicensePromptSetter = setShowLicensePrompt;

  const validation: ValidationResult | null = useMemo(() => {
    const trimmed = jsonInput.trim();
    if (!trimmed) {
      latestValidation = null;
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      const result = validateUserTheme(parsed);
      latestValidation = result;
      return result;
    } catch (e) {
      const result: ValidationResult = { valid: false, errors: ['Invalid JSON: ' + (e as Error).message], theme: undefined };
      latestValidation = result;
      return result;
    }
  }, [jsonInput]);

  return (
    <div className="space-y-4">
      {/* JSON Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          {t('themeSettings.importJsonLabel')}
        </label>
        <textarea
          value={jsonInput}
          onChange={(e) => {
            setJsonInput(e.target.value);
            setShowLicensePrompt(false);
          }}
          placeholder={t('themeSettings.importJsonPlaceholder')}
          className="w-full h-64 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          spellCheck={false}
        />
      </div>

      {/* Validation Status */}
      {validation && (
        <div
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            validation.valid
              ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300'
              : 'border-destructive/50 bg-destructive/10 text-destructive'
          }`}
        >
          {validation.valid ? (
            <>
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t('themeSettings.validTheme')}</p>
                <p className="text-muted-foreground mt-0.5">
                  {validation.theme?.name} — {validation.theme?.description}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{t('themeSettings.invalidTheme')}</p>
                <ul className="mt-1 space-y-0.5 list-disc list-inside">
                  {validation.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {validation.errors.length > 5 && (
                    <li>...and {validation.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* License Required Prompt */}
      {showLicensePrompt && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs text-amber-800 dark:text-amber-300">
              {t('themeSettings.importRequiresLicense')}
            </span>
          </div>
          <button
            onClick={() => openPurchasePage()}
            className="flex items-center gap-1 shrink-0 rounded-md border border-amber-500/50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/10 transition-colors"
          >
            <ShoppingCart className="h-3 w-3" />
            {t('themeSettings.buyNow')}
          </button>
        </div>
      )}
    </div>
  );
}
