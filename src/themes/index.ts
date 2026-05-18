/**
 * Theme system entry point.
 *
 * Exports the theme registry, engine functions, and types.
 * Usage:
 *   import { themeRegistry, applyTheme, removeTheme } from '@/themes';
 *   applyTheme(themeRegistry['grimoire']);
 */

export type { ThemePreset, ThemePresetId, ThemePresetMeta, ThemeVariable, ThemeRegistry } from './types';
export { applyTheme, removeTheme, getCurrentThemeId } from './engine';

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
  'grimoire',
  'cupertino-glass',
  'retro-terminal',
];
