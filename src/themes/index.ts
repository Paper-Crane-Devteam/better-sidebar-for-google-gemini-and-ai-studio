/**
 * Theme system entry point.
 *
 * Exports the theme registry, engine functions, and types.
 * Usage:
 *   import { themeRegistry, applyTheme, removeTheme } from '@/themes';
 *   applyTheme(themeRegistry['grimoire']);
 */

export type { ThemePreset, ThemePresetId, ThemePresetMeta, ThemeVariable, ThemeRegistry } from './types';
export { applyTheme, removeTheme, getCurrentThemeId, applySidebarTheme, clearSidebarTheme } from './engine';
export { bindShadowRootToTheme } from './platforms/gemini';
export { initAiStudioThemeSync, bindAiStudioShadowRootToTheme } from './platforms/aistudio';

import type { ThemePresetId, ThemeRegistry } from './types';
import { grimoire } from './presets/grimoire';
import { cupertinoGlass } from './presets/cupertino-glass';
import { retroTerminal } from './presets/retro-terminal';

/** All available theme presets */
export const themeRegistry: ThemeRegistry = {
  grimoire,
  'cupertino-glass': cupertinoGlass,
  'retro-terminal': retroTerminal,
};

/** Ordered list of theme preset IDs for UI rendering */
export const themePresetIds: ThemePresetId[] = [
  'cupertino-glass',
  'grimoire',
  'retro-terminal',
];
