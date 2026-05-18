/**
 * Theme system type definitions.
 *
 * A theme preset defines CSS variable overrides that get injected onto
 * document.body to override Gemini/AI Studio's native theme variables.
 */

/** Unique identifier for a theme preset */
export type ThemePresetId = 'grimoire' | 'cupertino-glass' | 'retro-terminal';

/** A single CSS variable override */
export interface ThemeVariable {
  property: string; // e.g. "--gem-sys-color--surface"
  value: string; // e.g. "#f5f0e8"
}

/** Metadata for a theme preset */
export interface ThemePresetMeta {
  id: ThemePresetId;
  name: string; // Display name
  nameZh: string; // Chinese display name
  description: string;
  descriptionZh: string;
  author?: string;
  /** Google Fonts to load (if any) */
  fonts?: string[];
  /** Extra CSS rules beyond variables (e.g. backdrop-filter, noise texture) */
  extraCss?: string;
}

/** Platform-specific variable overrides for a theme */
export interface ThemePreset extends ThemePresetMeta {
  /** CSS variables to inject on body (overrides Gemini's :root .light-theme / .dark-theme) */
  variables: ThemeVariable[];
}

/** Registry of all available theme presets */
export type ThemeRegistry = Record<ThemePresetId, ThemePreset>;
