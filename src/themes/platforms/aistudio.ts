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

import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useLicenseStore, isLicenseValid } from '@/shared/lib/license-store';
import {
  themeRegistry,
  applySidebarTheme,
  refreshThemeRegistry,
  onUserThemeStoreHydrated,
} from '@/themes';
import {
  clearThemeFonts,
  clearThemeFontCss,
  applyThemeFontCss,
} from '../engine';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { syncAiStudioTheme } from '@/shared/lib/utils/utils';
import type { ThemePreset, ThemeVariable } from '../types';

const AISTUDIO_THEME_STYLE_ID = 'better-sidebar-aistudio-custom-theme';
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
  // --color-v3-surface is AI Studio's base page surface (the chat body), the
  // equivalent of Gemini's --gem-sys-color--surface. It must map to `surface`,
  // not `surfaceBright`: every other token in a preset — cards, hover states,
  // buttons — is authored as a step *away* from `surface`, so lifting the page
  // background to a brighter value inverts those relationships.
  add('--color-v3-surface', surface);
  add('--color-v3-surface-container', surfaceContainer);
  add('--color-v3-surface-container-high', surfaceContainerHigh);
  add('--color-v3-surface-container-highest', surfaceContainerHighest);
  // AI Studio's left nav is flat against the page and separated by a border
  // (--color-v3-surface-left-nav-border), unlike Gemini's dedicated darker
  // sidenav surface. Keep it on the page surface so the seam stays a border.
  add('--color-v3-surface-left-nav', surface);
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
  // Natively --color-v3-surface-left-nav-border and --color-v3-outline-var are
  // the same colour (#262626 in dark, #e2e3e4/#d7d8da80 in light), one step
  // softer than --color-v3-outline. Keep them on the same source token.
  add('--color-v3-surface-left-nav-border', outlineLow);
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

  // Font tokens are NOT mapped here — see mapPresetToAiStudioFontVariables().
  // They point at a webfont, so they must not be applied while the theme
  // switch animation is running.

  return vars;
}

/**
 * Map a preset's font variables to AI Studio's typography token namespace.
 * Applied in the deferred typography step, not with the colours.
 */
function mapPresetToAiStudioFontVariables(preset: ThemePreset): ThemeVariable[] {
  const menuFont = preset.fontVariables?.find(
    (v) => v.property === '--mat-menu-item-label-text-font',
  )?.value;
  if (!menuFont) return [];

  return [
    '--mat-sys-label-large-font',
    '--mat-sys-label-medium-font',
    '--mat-sys-body-large-font',
    '--mat-sys-body-medium-font',
    '--mat-sys-body-small-font',
    '--mat-sys-title-medium-font',
    '--mat-form-field-filled-label-text-font',
    '--mat-form-field-outlined-label-text-font',
    '--mat-form-field-subscript-text-font',
    '--mat-form-field-container-text-font',
    '--mat-option-label-text-font',
  ].map((property) => ({ property, value: menuFont }));
}

/** A colour split into the space-separated channel form CSS variables use. */
interface ParsedColor {
  /** Red, green and blue as "31 29 46". */
  rgb: string;
  /** Alpha in the 0–1 range; 1 when the source colour was opaque. */
  alpha: number;
}

/**
 * Parse any browser-supported CSS colour into RGB channels plus alpha.
 *
 * Alpha is reported separately rather than folded into the channel string
 * because most sidebar tokens are consumed as `rgb(var(--token) / <alpha>)` by
 * Tailwind — an alpha baked into the variable would produce invalid CSS there.
 * Callers that own the whole declaration can opt into it.
 */
function parseColor(color: string): ParsedColor | null {
  const trimmed = color.trim();

  // Fast path for the formats presets actually use, so no DOM is needed.
  const hex = trimmed.match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    const digits = hex[1];
    const short = digits.length <= 4;
    const channel = (i: number) =>
      short
        ? parseInt(digits[i] + digits[i], 16)
        : parseInt(digits.slice(i * 2, i * 2 + 2), 16);
    const hasAlpha = digits.length === 4 || digits.length === 8;
    return {
      rgb: `${channel(0)} ${channel(1)} ${channel(2)}`,
      alpha: hasAlpha ? channel(3) / 255 : 1,
    };
  }

  const fromRgbFunction = (value: string): ParsedColor | null => {
    const match = value.match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/i,
    );
    if (!match) return null;
    const rawAlpha = match[4];
    const alpha = rawAlpha
      ? rawAlpha.endsWith('%')
        ? parseFloat(rawAlpha) / 100
        : parseFloat(rawAlpha)
      : 1;
    return {
      rgb: `${match[1]} ${match[2]} ${match[3]}`,
      alpha: Number.isFinite(alpha) ? alpha : 1,
    };
  };

  const direct = fromRgbFunction(trimmed);
  if (direct) return direct;

  // Anything else (named colours, hsl, oklch…) goes through the browser.
  const host = document.body ?? document.documentElement;
  if (!host) return null;

  const probe = document.createElement('span');
  probe.style.color = trimmed;
  if (!probe.style.color) return null;

  probe.style.display = 'none';
  host.appendChild(probe);
  const computedColor = getComputedStyle(probe).color;
  probe.remove();

  return fromRgbFunction(computedColor);
}

/** Replace a sidebar variable if the preset declares it, otherwise add it. */
function upsertSidebarVariable(
  variables: ThemeVariable[],
  property: string,
  value: string,
): ThemeVariable[] {
  const next = [...variables];
  const index = next.findIndex((variable) => variable.property === property);
  if (index >= 0) next[index] = { property, value };
  else next.unshift({ property, value });
  return next;
}

/**
 * Re-seat the sidebar on AI Studio's page surface.
 *
 * Presets author the sidebar's `--background` to sit slightly below
 * `--gem-sys-color--surface`, because Gemini gives its sidenav a dedicated
 * darker surface and the sidebar is supposed to blend into it. AI Studio has no
 * such surface: its left nav is flat against the chat body and the two are told
 * apart by a border. Reusing the Gemini value there reads as a dark slab glued
 * to the page, so the sidebar takes the page surface instead and leans on its
 * edge border for separation — the same thing `_aistudio.scss` does for the
 * unthemed default (`--background` == `--color-v3-surface`).
 *
 * That makes the edge border the only thing dividing the two, so it also has to
 * be pitched right. Presets set the sidebar's `--border` to
 * `--gem-sys-color--outline`, the strongest of the three outline steps, while
 * the quiet lines AI Studio draws between regions — `--color-v3-outline-var` and
 * `--color-v3-surface-left-nav-border`, both `#262626` against a `#191919` page
 * in the native dark theme — sit two steps down at `outline-low`. At `outline`
 * the seam reads as a hard rule next to them, so `--sidebar-edge-border` pulls
 * it onto the same token. Only the outer edge moves: the sidebar's internal
 * borders stay on `--border`, which the light presets need to keep cards legible
 * against a near-identical surface.
 */
function mapPresetToAiStudioSidebar(preset: ThemePreset): ThemePreset {
  const find = (property: string) =>
    preset.variables.find((variable) => variable.property === property)?.value;

  // Must stay in sync with the --color-v3-surface mapping above.
  const pageSurface = find('--gem-sys-color--surface');
  // Must stay in sync with --color-v3-outline-var above.
  const navBorder =
    find('--gem-sys-color--outline-low') ??
    find('--gem-sys-color--outline-variant') ??
    find('--gem-sys-color--outline');

  // --background is read through Tailwind's `rgb(var(--background) / <alpha>)`,
  // so it can only carry channels. The edge border owns its whole declaration,
  // so it can keep the alpha.
  const background = (pageSurface ? parseColor(pageSurface) : null)?.rgb ?? null;
  // cupertino-glass writes its outlines as translucent black, and the light
  // native token is #d7d8da80, so alpha has to survive the conversion here.
  const parsedNavBorder = navBorder ? parseColor(navBorder) : null;
  const edgeBorder = parsedNavBorder
    ? parsedNavBorder.alpha < 1
      ? `${parsedNavBorder.rgb} / ${parsedNavBorder.alpha}`
      : parsedNavBorder.rgb
    : null;
  if (!background && !edgeBorder) return preset;

  let sidebarVariables = preset.sidebarVariables ?? [];
  if (background) {
    sidebarVariables = upsertSidebarVariable(
      sidebarVariables,
      '--background',
      background,
    );
  }
  if (edgeBorder) {
    sidebarVariables = upsertSidebarVariable(
      sidebarVariables,
      '--sidebar-edge-border',
      edgeBorder,
    );
  }

  return { ...preset, sidebarVariables };
}

/**
 * Apply a theme preset to AI Studio page.
 */
function applyAiStudioTheme(preset: ThemePreset): void {
  removeAiStudioTheme({ keepFonts: true });

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

  // Append extra CSS if provided (textures, effects — typography lives in
  // fontCss and is applied later by applyThemeFontCss)
  if (preset.extraCss) {
    css += `\n\n/* Theme extra styles: ${preset.id} */\n${preset.extraCss}`;
  }

  const style = document.createElement('style');
  style.id = AISTUDIO_THEME_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);

  // Webfonts are requested by the deferred typography step, not here.

  console.log(`Better Sidebar: AI Studio theme "${preset.id}" applied`);
}

/**
 * Remove the currently applied AI Studio theme.
 *
 * @param options.keepFonts - Keep the theme webfont stylesheets; used when
 *   another theme is about to be applied (see applyAiStudioTheme).
 */
function removeAiStudioTheme(options?: { keepFonts?: boolean }): void {
  const style = document.getElementById(AISTUDIO_THEME_STYLE_ID);
  if (style) style.remove();

  if (!options?.keepFonts) {
    clearThemeFonts();
    clearThemeFontCss();
  }

  if (currentAiStudioThemeId) {
    document.body?.classList.remove(`${AISTUDIO_THEME_CLASS_PREFIX}${currentAiStudioThemeId}`);
    currentAiStudioThemeId = null;
  }
}

/**
 * Apply a preset to the AI Studio page: colours now, typography once the switch
 * animation is over and the webfonts have arrived.
 */
export function applyAiStudioPreset(preset: ThemePreset): void {
  applyAiStudioTheme(preset);
  TooltipHelper.getInstance().setCustomThemeVariables(
    mapPresetToAiStudioSidebar(preset).sidebarVariables ?? null,
  );
  syncAiStudioTheme(preset.preferredMode);
  void applyThemeFontCss(preset, mapPresetToAiStudioFontVariables(preset));
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
  const initialThemeId = usePegasusStore.getState().customTheme;
  if (initialThemeId && themeRegistry[initialThemeId]?.isPremium) {
    const licenseState = useLicenseStore.getState();
    if (!isLicenseValid(licenseState)) {
      usePegasusStore.getState().setCustomTheme(null);
      useLicenseStore.getState().endPreview();
    } else {
      applyAiStudioPreset(themeRegistry[initialThemeId]);
    }
  } else if (initialThemeId && themeRegistry[initialThemeId]) {
    applyAiStudioPreset(themeRegistry[initialThemeId]);
  }

  // Subscribe to changes
  const unsubscribe = usePegasusStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      if (state.customTheme && themeRegistry[state.customTheme]) {
        applyAiStudioPreset(themeRegistry[state.customTheme]);
      } else {
        removeAiStudioPreset(state.theme);
      }
    }
  });

  return unsubscribe;
}

/**
 * Drop the custom theme from the AI Studio page. Counterpart to
 * applyAiStudioPreset(); both are shared with the switch animation so the two
 * code paths cannot drift apart.
 */
export function removeAiStudioPreset(
  fallbackTheme: 'light' | 'dark' | 'system',
): void {
  // keepFonts: typography is handed over to applyThemeFontCss(null) so it
  // reverts after the animation instead of mid-way through it.
  removeAiStudioTheme({ keepFonts: true });
  TooltipHelper.getInstance().setCustomThemeVariables(null);
  void applyThemeFontCss(null);
  syncAiStudioTheme(fallbackTheme);
}

/**
 * Bind a Shadow DOM root container to the custom theme system for AI Studio.
 * Applies the current theme immediately and subscribes to future changes.
 * Returns an unsubscribe function for cleanup.
 */
export function bindAiStudioShadowRootToTheme(container: HTMLElement): () => void {
  // Ensure user themes are in registry
  refreshThemeRegistry();

  // Apply current theme with AI Studio's page-matched sidebar surface.
  const currentThemeId = usePegasusStore.getState().customTheme;
  if (currentThemeId && themeRegistry[currentThemeId]) {
    applySidebarTheme(
      container,
      mapPresetToAiStudioSidebar(themeRegistry[currentThemeId]),
    );
  } else if (currentThemeId && !themeRegistry[currentThemeId]) {
    // Theme ID is set but the user theme store has not hydrated yet.
    onUserThemeStoreHydrated(() => {
      refreshThemeRegistry();
      const id = usePegasusStore.getState().customTheme;
      if (id && themeRegistry[id]) {
        applySidebarTheme(container, mapPresetToAiStudioSidebar(themeRegistry[id]));
      }
    });
  }

  // Subscribe to changes
  const unsubscribe = usePegasusStore.subscribe((state, prevState) => {
    if (state.customTheme !== prevState.customTheme) {
      refreshThemeRegistry();
      const preset = state.customTheme ? themeRegistry[state.customTheme] : null;
      applySidebarTheme(
        container,
        preset ? mapPresetToAiStudioSidebar(preset) : null,
      );
    }
  });

  return unsubscribe;
}
