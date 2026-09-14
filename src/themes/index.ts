/**
 * Theme system entry point.
 *
 * Exports the theme registry, engine functions, and types.
 * Usage:
 *   import { themeRegistry, applyTheme, removeTheme } from '@/themes';
 *   applyTheme(themeRegistry['grimoire']);
 */

export type { ThemePreset, ThemePresetId, BuiltinThemePresetId, ThemePresetMeta, ThemeVariable, ThemeRegistry } from './types';
export {
  applyTheme,
  removeTheme,
  getCurrentThemeId,
  applySidebarTheme,
  clearSidebarTheme,
  applyThemeFontCss,
  setTypographyGate,
} from './engine';
export { bindShadowRootToTheme } from './platforms/gemini';
export { initAiStudioThemeSync, bindAiStudioShadowRootToTheme } from './platforms/aistudio';
export { useUserThemeStore, validateUserTheme, userThemeToPreset, onUserThemeStoreHydrated } from './user-themes';
export type { UserTheme, ValidationResult } from './user-themes';

import type { BuiltinThemePresetId, ThemePreset, ThemeRegistry } from './types';
import { grimoire } from './presets/grimoire';
import { cupertinoGlass } from './presets/cupertino-glass';
import { retroTerminal } from './presets/retro-terminal';
import { nordAurora } from './presets/nord-aurora';
import { cyberpunkNeon } from './presets/cyberpunk-neon';
import { paperInk } from './presets/paper-ink';
import { solarized } from './presets/solarized';
import { rosePine } from './presets/rose-pine';
import { tokyoNight } from './presets/tokyo-night';
import { catppuccinMocha } from './presets/catppuccin-mocha';
import { dracula } from './presets/dracula';
import { oceanBreeze } from './presets/ocean-breeze';
import { midnightPurple } from './presets/midnight-purple';
import { gruvbox } from './presets/gruvbox';
import { everforest } from './presets/everforest';
import { highContrast } from './presets/high-contrast';
import { solarizedLight } from './presets/solarized-light';
import { sakura } from './presets/sakura';
import { graphite } from './presets/graphite';
import { useUserThemeStore, userThemeToPreset } from './user-themes';

/** Built-in theme presets (static) */
const builtinRegistry: Record<BuiltinThemePresetId, ThemePreset> = {
  grimoire,
  'cupertino-glass': cupertinoGlass,
  'retro-terminal': retroTerminal,
  'nord-aurora': nordAurora,
  'cyberpunk-neon': cyberpunkNeon,
  'paper-ink': paperInk,
  solarized,
  'rose-pine': rosePine,
  'tokyo-night': tokyoNight,
  'catppuccin-mocha': catppuccinMocha,
  dracula,
  'ocean-breeze': oceanBreeze,
  'midnight-purple': midnightPurple,
  gruvbox,
  everforest,
  'high-contrast': highContrast,
  'solarized-light': solarizedLight,
  sakura,
  graphite,
};

/**
 * Combined theme registry: built-in + user themes.
 * This is a mutable object that gets updated when user themes change.
 * Platform adapters reference this to resolve theme IDs.
 */
export const themeRegistry: ThemeRegistry = { ...builtinRegistry };

/**
 * Refresh the theme registry by merging user themes into it.
 * Call this after user themes are loaded/changed.
 */
export function refreshThemeRegistry(): void {
  // Clear user themes from registry (keep built-in)
  for (const key of Object.keys(themeRegistry)) {
    if (!(key in builtinRegistry)) {
      delete themeRegistry[key];
    }
  }
  // Add user themes
  const userThemes = useUserThemeStore.getState().themes;
  for (const ut of userThemes) {
    themeRegistry[ut.id] = userThemeToPreset(ut);
  }
}

/**
 * Ordered list for the theme picker: polished, broadly useful themes first;
 * stronger or more specialized aesthetics last.
 */
export const themePresetIds: BuiltinThemePresetId[] = [
  // First page (after Default): immediately attractive and easy to use daily
  'cupertino-glass',
  'tokyo-night',
  'ocean-breeze',

  // Versatile dark themes
  'catppuccin-mocha',
  'nord-aurora',
  'rose-pine',
  'midnight-purple',
  'everforest',
  'dracula',

  // Focused, practical light themes
  'paper-ink',
  'sakura',
  'graphite',

  // Established developer palettes; keep the Solarized pair together
  'solarized',
  'solarized-light',
  'gruvbox',

  // Strongly stylized or accessibility-specific themes
  'cyberpunk-neon',
  'grimoire',
  'retro-terminal',
  'high-contrast',
];
