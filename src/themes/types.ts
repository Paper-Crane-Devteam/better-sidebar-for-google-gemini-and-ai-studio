/**
 * Theme system type definitions.
 *
 * A theme preset defines CSS variable overrides that get injected onto
 * document.body to override Gemini/AI Studio's native theme variables.
 */

/** Built-in theme preset identifiers */
export type BuiltinThemePresetId = 'grimoire' | 'cupertino-glass' | 'retro-terminal' | 'nord-aurora' | 'cyberpunk-neon' | 'paper-ink' | 'solarized' | 'rose-pine' | 'tokyo-night' | 'catppuccin-mocha' | 'dracula' | 'ocean-breeze' | 'midnight-purple' | 'gruvbox' | 'everforest' | 'high-contrast' | 'solarized-light' | 'sakura' | 'graphite';

/** Theme preset ID — built-in or user-created (any string) */
export type ThemePresetId = BuiltinThemePresetId | (string & {});

/** A single CSS variable override */
export interface ThemeVariable {
  property: string; // e.g. "--gem-sys-color--surface"
  value: string; // e.g. "#f5f0e8"
}

/**
 * Shape controls for the composer glow (see ThemePresetMeta.lmGlow).
 *
 * Intensity is expressed by fading the outer gradient stop rather than by
 * setting `opacity` on the element: the glow has an entry animation, and an
 * `!important` opacity would out-rank the keyframes and break the grow-in.
 */
export interface LmGlowOptions {
  /** Blur radius. Gemini uses `125px`. */
  blur?: string;
  /** Strength of the outer stop, 0–1. Gemini is effectively 1. */
  intensity?: number;
  /** Outer stop colour. Defaults to the derived `surface-accent`. */
  accent?: string;
  /** Widest the halo grows. Gemini uses `792px`. */
  maxWidth?: string;
  /** Tallest the halo grows. Gemini uses `300px`. */
  maxHeight?: string;
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
  /**
   * The blurred halo behind the composer — Gemini's `.show-lm-background`
   * pseudo-element, a 125px-blurred radial gradient running from
   * `--lumi-sys-color--surface` at the centre to `--lumi-sys-color--surface-accent`
   * at 50%.
   *
   * The colour is themed for every preset by deriving `surface-accent` (see
   * gemini-derived.ts), so this only exists for themes whose character calls for
   * a different *shape* of glow — a soft wash suits a glass theme and fights a
   * high-contrast one.
   *
   * Pass 'off' to remove it entirely. Omit for Gemini's own geometry.
   */
  lmGlow?: 'off' | LmGlowOptions;
  /**
   * Monospace stack for `pre`/`code`.
   *
   * A theme's `fontCss` re-points the whole page at its body font, which would
   * drag code along with it and break column alignment. The engine reverses
   * that for code elements using this value; themes that leave it unset fall
   * back to the system monospace stack, which costs no extra webfont.
   *
   * Set it when the theme already loads a monospace family — otherwise code
   * ends up in a face that has nothing to do with the rest of the theme.
   */
  fontMono?: string;
  /** Extra CSS rules beyond variables (e.g. backdrop-filter, noise texture) */
  extraCss?: string;
  /**
   * Typography rules, kept separate from `extraCss` on purpose.
   *
   * Font rules are the expensive half of a theme: they match large parts of the
   * page and they depend on a webfont that may still be downloading. They are
   * therefore applied in a second step, after the theme switch animation has
   * finished and the fonts are ready — see applyThemeFontCss().
   *
   * Selectors here must be keyed on `body.bs-fonts--<id>`, NOT on
   * `body.bs-theme--<id>`: the two classes are added at different moments, and
   * the font class of the previous theme stays in place until the new theme's
   * fonts are ready, so text never flickers back to the page default.
   */
  fontCss?: string;
}

/** Platform-specific variable overrides for a theme */
export interface ThemePreset extends ThemePresetMeta {
  /** CSS variables to inject on body (overrides Gemini's :root .light-theme / .dark-theme) */
  variables: ThemeVariable[];
  /**
   * Font-related CSS variables (e.g. --mat-*-text-font).
   *
   * These belong with `fontCss`, not with `variables`: a token pointing at a
   * webfont makes the page reflow the moment that font finishes downloading, so
   * it must not be set while the theme switch animation is running.
   */
  fontVariables?: ThemeVariable[];
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
