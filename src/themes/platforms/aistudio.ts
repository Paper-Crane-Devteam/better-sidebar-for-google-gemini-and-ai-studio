/**
 * AI Studio platform theme adapter.
 *
 * AI Studio uses different CSS variable naming from Gemini:
 *   - --color-v3-* (custom design tokens)
 *   - --mat-* (Angular Material tokens)
 *   - --color-* (legacy tokens)
 *
 * This adapter maps ThemePreset colors to AI Studio's variable namespace
 * and injects them onto document.body, similar to the Gemini adapter.
 *
 * Call `initAiStudioThemeSync()` once from the content script.
 */

import { useSettingsStore } from '@/shared/lib/settings-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import { themeRegistry, applySidebarTheme, refreshThemeRegistry } from '@/themes';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { syncAiStudioTheme } from '@/shared/lib/utils/utils';
import type { ThemePreset, ThemeVariable } from '../types';

const AISTUDIO_THEME_STYLE_ID = 'better-sidebar-aistudio-custom-theme';
const AISTUDIO_THEME_FONT_ID = 'better-sidebar-aistudio-custom-theme-fonts';
const AISTUDIO_THEME_CLASS_PREFIX = 'bs-theme--';

let currentAiStudioThemeId: string | null = null;

/**
 * Map a ThemePreset's semantic colors to AI Studio CSS variables.
 * This translates from the Gemini-centric variable names in presets
 * to AI Studio's --color-v3-*, --mat-*, --color-* namespace.
 */
function mapPresetToAiStudioVariables(preset: ThemePreset): ThemeVariable[] {
  // Build a lookup from the preset's variables for easy access
  const lookup: Record<string, string> = {};
  for (const v of preset.variables) {
    lookup[v.property] = v.value;
  }

  // Helper to get a value or fallback
  const get = (key: string, fallback?: string) => lookup[key] ?? fallback ?? '';

  const vars: ThemeVariable[] = [];
  const add = (property: string, value: string) => {
    if (value) vars.push({ property, value });
  };

  // ─── Surface / Background ───────────────────────────────────────
  const surface = get('--gem-sys-color--surface');
  const surfaceBright = get('--gem-sys-color--surface-bright', surface);
  const surfaceDim = get('--gem-sys-color--surface-dim', surface);
  const surfaceContainer = get('--gem-sys-color--surface-container', surface);
  const surfaceContainerHigh = get('--gem-sys-color--surface-container-high', surface);
  const surfaceContainerHighest = get('--gem-sys-color--surface-container-highest', surface);
  const surfaceContainerLow = get('--gem-sys-color--surface-container-low', surface);
  const surfaceVariant = get('--gem-sys-color--surface-variant', surface);

  add('--color-surface', surface);
  add('--color-v3-surface', surfaceBright);
  add('--color-v3-surface-container', surfaceContainer);
  add('--color-v3-surface-container-high', surfaceContainerHigh);
  add('--color-v3-surface-container-highest', surfaceContainerHighest);
  add('--color-v3-surface-left-nav', surfaceContainerHigh);
  add('--color-surface-bright', surfaceBright);
  add('--color-loading-background', surfaceContainerLow);
  add('--mat-sys-surface', surface);
  add('--mat-sys-surface-container', surfaceContainer);
  add('--mat-menu-container-color', surfaceContainer);
  add('--mat-select-panel-background-color', surfaceContainer);
  add('--color-nav-item-active', surfaceContainerHighest);
  add('--color-nav-item-hover', surfaceContainerHigh);
  add('--color-v3-hover', surfaceContainerHigh);

  // ─── Text / On-Surface ──────────────────────────────────────────
  const onSurface = get('--gem-sys-color--on-surface');
  const onSurfaceVariant = get('--gem-sys-color--on-surface-variant', onSurface);
  const onSurfaceLow = get('--gem-sys-color--on-surface-low', onSurfaceVariant);

  add('--color-on-surface', onSurface);
  add('--color-v3-text', onSurface);
  add('--color-v3-text-var', onSurfaceVariant);
  add('--color-run-settings-text', onSurface);
  add('--mat-sys-on-surface', onSurface);
  add('--mat-sys-on-surface-variant', onSurfaceVariant);
  add('--mat-menu-item-label-text-color', onSurface);
  add('--mat-option-label-text-color', onSurface);
  add('--color-logo-icon', onSurface);
  add('--color-logo-lockup', onSurface);
  add('--color-v3-text-disable', onSurfaceLow);

  // ─── Outline / Border ───────────────────────────────────────────
  const outline = get('--gem-sys-color--outline');
  const outlineVariant = get('--gem-sys-color--outline-variant', outline);
  const outlineLow = get('--gem-sys-color--outline-low', outlineVariant);

  add('--color-v3-outline', outlineVariant);
  add('--color-v3-outline-var', outlineLow);
  add('--color-v3-surface-left-nav-border', outlineVariant);
  add('--mat-sys-outline', outline);
  add('--mat-sys-outline-variant', outlineVariant);
  add('--mat-divider-color', outlineLow);
  add('--mat-slide-toggle-track-outline-color', outlineVariant);
  add('--mat-form-field-outlined-outline-color', outlineLow);
  add('--mat-form-field-outlined-hover-outline-color', outlineVariant);
  add('--mat-form-field-outlined-focus-outline-color', onSurfaceVariant);

  // ─── Primary ────────────────────────────────────────────────────
  const primary = get('--gem-sys-color--primary');
  const onPrimary = get('--gem-sys-color--on-primary');
  const primaryContainer = get('--gem-sys-color--primary-container');
  const onPrimaryContainer = get('--gem-sys-color--on-primary-container');

  add('--mat-sys-primary', primary);
  add('--mat-sys-on-primary', onPrimary);
  add('--mat-sys-primary-container', primaryContainer);
  add('--mat-sys-on-primary-container', onPrimaryContainer);
  add('--color-v3-outline-accent', primary);
  add('--color-v3-text-link', primary);
  add('--color-v3-button-container-accent', primaryContainer);
  add('--mat-form-field-filled-caret-color', primary);
  add('--mat-form-field-outlined-caret-color', primary);
  add('--mat-form-field-filled-focus-active-indicator-color', primary);
  add('--mat-form-field-filled-focus-label-text-color', `color-mix(in srgb, ${primary} 87%, transparent)`);
  add('--mat-form-field-outlined-focus-label-text-color', `color-mix(in srgb, ${primary} 87%, transparent)`);
  add('--mat-option-selected-state-label-text-color', primary);
  add('--mat-pseudo-checkbox-minimal-selected-checkmark-color', primary);
  add('--mat-pseudo-checkbox-full-selected-icon-color', primary);

  // ─── Secondary ──────────────────────────────────────────────────
  const secondary = get('--gem-sys-color--secondary');
  const secondaryContainer = get('--gem-sys-color--secondary-container');
  const onSecondaryContainer = get('--gem-sys-color--on-secondary-container');

  add('--mat-sys-secondary-container', secondaryContainer);
  add('--mat-sys-on-secondary-container', onSecondaryContainer);

  // ─── Error ──────────────────────────────────────────────────────
  const error = get('--gem-sys-color--error');
  add('--color-error', error);
  add('--mat-sys-error', error);

  // ─── Inverse ────────────────────────────────────────────────────
  const inverseSurface = get('--gem-sys-color--inverse-surface');
  const inverseOnSurface = get('--gem-sys-color--inverse-on-surface');
  add('--color-inverse-surface', inverseSurface);
  add('--color-inverse-on-surface', inverseOnSurface);

  // ─── Buttons ────────────────────────────────────────────────────
  const buttonFilled = get('--mat-button-filled-container-color', primary);
  const buttonFilledLabel = get('--mat-button-filled-label-text-color', onPrimary);
  const buttonTonal = get('--mat-button-tonal-container-color', secondaryContainer);
  const buttonTonalLabel = get('--mat-button-tonal-label-text-color', onSecondaryContainer);

  add('--color-v3-button-container', surfaceBright);
  add('--color-v3-button-container-high', surfaceContainerHighest);
  add('--color-v3-text-on-button', onSurface);

  // ─── Slide Toggle ───────────────────────────────────────────────
  add('--mat-slide-toggle-selected-track-color', onSurface);
  add('--mat-slide-toggle-selected-hover-track-color', onSurface);
  add('--mat-slide-toggle-selected-focus-track-color', onSurface);
  add('--mat-slide-toggle-unselected-track-color', surfaceContainerHigh);
  add('--mat-slide-toggle-unselected-hover-track-color', surfaceContainerHigh);
  add('--mat-slide-toggle-unselected-focus-track-color', surfaceContainerHigh);
  add('--mat-slide-toggle-selected-handle-color', surface);
  add('--mat-slide-toggle-selected-hover-handle-color', surface);
  add('--mat-slide-toggle-selected-focus-handle-color', surface);
  add('--mat-slide-toggle-unselected-handle-color', onSurfaceVariant);
  add('--mat-slide-toggle-unselected-hover-handle-color', onSurfaceVariant);
  add('--mat-slide-toggle-unselected-focus-handle-color', onSurfaceVariant);
  add('--mat-slide-toggle-label-text-color', onSurface);

  // ─── Surface Variant ────────────────────────────────────────────
  add('--mat-sys-surface-variant', surfaceVariant);
  add('--color-on-surface-variant', onSurfaceVariant);

  // ─── Shadows (keep subtle, map from preset if available) ────────
  const menuShadow = get('--mat-menu-container-elevation-shadow');
  if (menuShadow) {
    add('--mat-menu-container-elevation-shadow', menuShadow);
  }

  // ─── Font overrides ─────────────────────────────────────────────
  const menuFont = get('--mat-menu-item-label-text-font');
  if (menuFont) {
    add('--mat-sys-label-large-font', menuFont);
    add('--mat-sys-label-medium-font', menuFont);
    add('--mat-sys-body-large-font', menuFont);
    add('--mat-sys-body-medium-font', menuFont);
    add('--mat-sys-body-small-font', menuFont);
    add('--mat-sys-title-medium-font', menuFont);
    add('--mat-menu-item-label-text-font', menuFont);
    add('--mat-form-field-filled-label-text-font', menuFont);
    add('--mat-form-field-outlined-label-text-font', menuFont);
    add('--mat-form-field-subscript-text-font', menuFont);
    add('--mat-form-field-container-text-font', menuFont);
    add('--mat-option-label-text-font', menuFont);
  }

  return vars;
}

/**
 * Apply a theme preset to AI Studio page.
 */
function applyAiStudioTheme(preset: ThemePreset): void {
  removeAiStudioTheme();

  const body = document.body;
  if (!body) return;

  body.classList.add(`${AISTUDIO_THEME_CLASS_PREFIX}${preset.id}`);
  currentAiStudioThemeId = preset.id;

  // Map preset to AI Studio variables
  const aiStudioVars = mapPresetToAiStudioVariables(preset);

  const variablesCss = aiStudioVars
    .map((v) => `  ${v.property}: ${v.value} !important;`)
    .join('\n');

  let css = `body.${AISTUDIO_THEME_CLASS_PREFIX}${preset.id} {\n${variablesCss}\n}`;

  // Append extra CSS if provided (font overrides, textures, etc.)
  if (preset.extraCss) {
    css += `\n\n/* Theme extra styles: ${preset.id} */\n${preset.extraCss}`;
  }

  const style = document.createElement('style');
  style.id = AISTUDIO_THEME_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);

  // Load Google Fonts if specified
  if (preset.fonts && preset.fonts.length > 0) {
    const existing = document.getElementById(AISTUDIO_THEME_FONT_ID);
    if (existing) existing.remove();

    const families = preset.fonts.map((f) => `family=${f.replace(/ /g, '+')}`).join('&');
    const link = document.createElement('link');
    link.id = AISTUDIO_THEME_FONT_ID;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    document.head.appendChild(link);
  }

  console.log(`Better Sidebar: AI Studio theme "${preset.id}" applied`);
}

/**
 * Remove the currently applied AI Studio theme.
 */
function removeAiStudioTheme(): void {
  const style = document.getElementById(AISTUDIO_THEME_STYLE_ID);
  if (style) style.remove();

  const fontLink = document.getElementById(AISTUDIO_THEME_FONT_ID);
  if (fontLink) fontLink.remove();

  if (currentAiStudioThemeId) {
    document.body?.classList.remove(`${AISTUDIO_THEME_CLASS_PREFIX}${currentAiStudioThemeId}`);
    currentAiStudioThemeId = null;
  }
}

/**
 * Initialize theme sync for AI Studio.
 * Reads the current customTheme from store and subscribes to changes.
 * Returns an unsubscribe function.
 */
export function initAiStudioThemeSync(): () => void {
  // Ensure user themes are loaded into registry
  refreshThemeRegistry();

  // On init: if a premium theme is persisted but user has no license, revert to default.
  const initialThemeId = useSettingsStore.getState().customTheme;
  if (initialThemeId && themeRegistry[initialThemeId]?.isPremium) {
    const licenseState = useLicenseStore.getState();
    if (!isLicenseValid(licenseState)) {
      useSettingsStore.getState().setCustomTheme(null);
      useLicenseStore.getState().endPreview();
    } else {
      applyAiStudioTheme(themeRegistry[initialThemeId]);
      const preset = themeRegistry[initialThemeId];
      TooltipHelper.getInstance().setCustomThemeVariables(preset.sidebarVariables ?? null);
      syncAiStudioTheme(preset.preferredMode);
    }
  } else if (initialThemeId && themeRegistry[initialThemeId]) {
    applyAiStudioTheme(themeRegistry[initialThemeId]);
    const preset = themeRegistry[initialThemeId];
    TooltipHelper.getInstance().setCustomThemeVariables(preset.sidebarVariables ?? null);
    syncAiStudioTheme(preset.preferredMode);
  }

  // Subscribe to changes
  const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      if (state.customTheme && themeRegistry[state.customTheme]) {
        applyAiStudioTheme(themeRegistry[state.customTheme]);
        const preset = themeRegistry[state.customTheme];
        TooltipHelper.getInstance().setCustomThemeVariables(preset.sidebarVariables ?? null);
        // Force page to the theme's preferred mode
        syncAiStudioTheme(preset.preferredMode);
      } else {
        removeAiStudioTheme();
        TooltipHelper.getInstance().setCustomThemeVariables(null);
        // Restore user's chosen theme setting
        syncAiStudioTheme(state.theme);
      }
    }
  });

  return unsubscribe;
}

/**
 * Bind a Shadow DOM root container to the custom theme system for AI Studio.
 * Applies the current theme immediately and subscribes to future changes.
 * Returns an unsubscribe function for cleanup.
 */
export function bindAiStudioShadowRootToTheme(container: HTMLElement): () => void {
  // Ensure user themes are in registry
  refreshThemeRegistry();

  // Apply current theme
  const currentThemeId = useSettingsStore.getState().customTheme;
  if (currentThemeId && themeRegistry[currentThemeId]) {
    applySidebarTheme(container, themeRegistry[currentThemeId]);
  }

  // Subscribe to changes
  const unsubscribe = useSettingsStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      refreshThemeRegistry();
      const preset = state.customTheme ? themeRegistry[state.customTheme] : null;
      applySidebarTheme(container, preset);
    }
  });

  return unsubscribe;
}
