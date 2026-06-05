/**
 * Theme system type definitions.
 *
 * A theme preset defines CSS variable overrides that get injected onto
 * document.body to override Gemini/AI Studio's native theme variables.
 */

/** Built-in theme preset identifiers */
export type BuiltinThemePresetId = 'grimoire' | 'cupertino-glass' | 'retro-terminal';

/** Theme preset ID — built-in or user-created (any string) */
export type ThemePresetId = BuiltinThemePresetId | (string & {});

/** A single CSS variable override */
export interface ThemeVariable {
  property: string; // e.g. "--gem-sys-color--surface"
  value: string; // e.g. "#f5f0e8"
}

/** Metadata for a theme preset */
export interface ThemePresetMeta {
  id: ThemePresetId;
  name: string; // Display name (English)
  description: string;
  author?: string;
  /** Whether this theme requires a Support Pack to use permanently */
  isPremium?: boolean;
  /** Whether this is a user-generated theme (not built-in) */
  isUserTheme?: boolean;
  /**
   * The preferred Gemini page color mode for this theme.
   * When a custom theme is applied, the page will be forced to this mode
   * so that native CSS variables (not overridden by the theme) stay consistent.
   */
  preferredMode: 'light' | 'dark';
  /** Google Fonts to load (if any) */
  fonts?: string[];
  /** Extra CSS rules beyond variables (e.g. backdrop-filter, noise texture) */
  extraCss?: string;
}

/** Platform-specific variable overrides for a theme */
export interface ThemePreset extends ThemePresetMeta {
  /** CSS variables to inject on body (overrides Gemini's :root .light-theme / .dark-theme) */
  variables: ThemeVariable[];
  /**
   * CSS variables to inject into the sidebar Shadow DOM root container.
   * These override the sidebar's own design tokens (--background, --foreground, --primary, etc.)
   * defined in _gemini.scss. Values should be RGB triplets like "245 240 232" for color vars.
   */
  sidebarVariables?: ThemeVariable[];
  /**
   * Direct inline styles to apply on the sidebar Shadow DOM root container.
   * Use for properties like backdrop-filter that aren't CSS variables.
   * Keys are CSS property names (camelCase or kebab-case).
   */
  sidebarStyles?: Record<string, string>;
}

/** Registry of all available theme presets (built-in + user) */
export type ThemeRegistry = Record<string, ThemePreset>;
