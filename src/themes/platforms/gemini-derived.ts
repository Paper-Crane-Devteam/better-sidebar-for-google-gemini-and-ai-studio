/**
 * Gemini token derivation.
 *
 * Fills in Gemini tokens that presets do not declare, using values derived from
 * the palette they *do* declare. Two groups, for two different reasons:
 *
 * 1. Brand-locked colours — the avatar orb, the wordmark gradient, decorative
 *    glows. These are byte-identical in Gemini's light and dark themes, i.e.
 *    Gemini never adapts them, which is exactly why they survive a theme switch
 *    and sit there still purple-to-cyan on an amber page.
 *
 * 2. Interaction state layers and ripples. Material paints hover/focus/pressed
 *    as a translucent overlay whose colour comes from a semantic role, and
 *    Gemini wires ~70 of those to its own neutrals and blues. Left alone, every
 *    hover on a themed page flashes Google grey.
 *
 * Everything here is fill-if-absent, so a preset can always override. Deriving
 * centrally rather than per preset also means imported user themes are covered —
 * they arrive via userThemeToPreset() and have no other route to these tokens.
 *
 * All role assignments below were established by matching Gemini's live values
 * against its own semantic tokens in `doc/extracted-css/`, independently in
 * light and dark. They are not guesses:
 *
 *   #1f1f1f / #e3e3e3  ->  on-surface
 *   #0b57d0 / #a8c7fa  ->  primary
 *   #444746 / #c4c7c5  ->  on-surface-variant
 *   #004a77 / #c2e7ff  ->  on-secondary-container
 *   #fff    / #062e6f  ->  on-primary
 *   #0842a0 / #d3e3fd  ->  on-primary-container
 *
 * Deliberately NOT derived, because the token name does not pin down what it
 * paints and a wrong guess is worse than Google's colour:
 *   --gem-sys-color--brand-transition-*           (7, looks like an animation ramp)
 *   --gem-sys-color--*-emphasis-*                 (14, a parallel palette)
 *   --gem-sys-color--brand-blue|green|red|yellow  (4, semantic four-colour set)
 *   --gem-sys-color--text-basic|advanced-stop-*   (4)
 *   --mat-datepicker-calendar-date-in-*-range-*   (3, comparison-range greens)
 * These need the element-to-token mapping first.
 */

import type { LmGlowOptions, ThemePreset, ThemeVariable } from '../types';

/** Semantic roles the derivation reads from a preset. */
type Role =
  | 'on-surface'
  | 'primary'
  | 'on-surface-variant'
  | 'on-secondary-container'
  | 'on-primary'
  | 'on-primary-container';

/**
 * How a token wraps its colour. Gemini uses three shapes and the shape matters
 * as much as the colour: `--mat-ripple-color` is a 10% color-mix, and handing it
 * a solid hex turns every ripple into an opaque block.
 *
 *   { kind: 'solid' }        ->  #rrggbb
 *   { kind: 'mix', pct: 8 }  ->  color-mix(in srgb, #rrggbb 8%, transparent)
 */
type Shape = { kind: 'solid' } | { kind: 'mix'; pct: number };

const SOLID: Shape = { kind: 'solid' };
const mix = (pct: number): Shape => ({ kind: 'mix', pct });

interface Derivation {
  property: string;
  role: Role;
  shape: Shape;
}

/** Build the token table for one role in a compact form. */
function group(role: Role, entries: Array<[string, Shape]>): Derivation[] {
  return entries.map(([property, shape]) => ({ property, role, shape }));
}

/**
 * Interaction state layers and ripples, grouped by the semantic role Gemini
 * assigns each one. Percentages are Gemini's own — Material's 8% hover / 12%
 * pressed ladder — and are kept as found so the feel of the UI does not change,
 * only its hue.
 *
 * Note the neutral group maps to `on-surface`, not to `primary`. That is the
 * faithful reading of Material's semantics, and it already produces a themed
 * tint for free: a theme's on-surface is never neutral grey, so gruvbox hovers
 * cream and everforest hovers sage without hover being mistaken for selection.
 */
const STATE_LAYERS: Derivation[] = [
  ...group('on-surface', [
    ['--mat-ripple-color', mix(10)],
    ['--mat-menu-item-hover-state-layer-color', mix(8)],
    ['--mat-menu-item-focus-state-layer-color', mix(12)],
    ['--mat-option-hover-state-layer-color', mix(8)],
    ['--mat-option-focus-state-layer-color', mix(12)],
    ['--mat-expansion-header-hover-state-layer-color', mix(8)],
    ['--mat-expansion-header-focus-state-layer-color', mix(12)],
    ['--mat-datepicker-calendar-date-hover-state-background-color', mix(8)],
    ['--mat-datepicker-calendar-date-focus-state-background-color', mix(12)],
    ['--mat-datepicker-calendar-date-selected-disabled-state-background-color', mix(38)],
    ['--mat-button-toggle-disabled-selected-state-background-color', mix(12)],
    ['--mat-list-list-item-hover-state-layer-color', SOLID],
    ['--mat-list-list-item-focus-state-layer-color', SOLID],
    ['--mat-list-list-item-disabled-state-layer-color', SOLID],
    ['--mat-button-toggle-state-layer-color', SOLID],
    ['--mat-form-field-state-layer-color', SOLID],
    ['--mat-slide-toggle-unselected-hover-state-layer-color', SOLID],
    ['--mat-slide-toggle-unselected-focus-state-layer-color', SOLID],
    ['--mat-slide-toggle-unselected-pressed-state-layer-color', SOLID],
    ['--mat-checkbox-unselected-hover-state-layer-color', SOLID],
    ['--mat-checkbox-unselected-focus-state-layer-color', SOLID],
    ['--mat-checkbox-selected-pressed-state-layer-color', SOLID],
    ['--mat-radio-ripple-color', SOLID],
    ['--mat-tab-active-ripple-color', SOLID],
    ['--mat-tab-inactive-ripple-color', SOLID],
    // Gemini writes these two as rgba(); emitted as color-mix instead, which
    // renders identically and avoids parsing the preset's hex into channels.
    ['--lumi-sys-color-states--hover-on-surface', mix(8)],
    ['--lumi-sys-color-states--pressed-on-surface', mix(12)],
  ]),

  ...group('primary', [
    ['--mat-button-text-ripple-color', mix(12)],
    ['--mat-button-outlined-ripple-color', mix(12)],
    ['--mat-button-protected-ripple-color', mix(12)],
    ['--mat-slider-hover-state-layer-color', mix(5)],
    ['--mat-slider-focus-state-layer-color', mix(20)],
    ['--mat-slider-ripple-color', SOLID],
    ['--mat-slide-toggle-selected-hover-state-layer-color', SOLID],
    ['--mat-slide-toggle-selected-focus-state-layer-color', SOLID],
    ['--mat-slide-toggle-selected-pressed-state-layer-color', SOLID],
    ['--mat-checkbox-selected-hover-state-layer-color', SOLID],
    ['--mat-checkbox-selected-focus-state-layer-color', SOLID],
    ['--mat-checkbox-unselected-pressed-state-layer-color', SOLID],
    ['--mat-radio-checked-ripple-color', SOLID],
    ['--mat-datepicker-calendar-date-selected-state-background-color', SOLID],
  ]),

  ...group('on-surface-variant', [
    ['--mat-icon-button-ripple-color', mix(12)],
    ['--mat-icon-button-state-layer-color', SOLID],
    ['--mat-icon-button-disabled-state-layer-color', SOLID],
    ['--mat-chip-hover-state-layer-color', SOLID],
    ['--mat-chip-focus-state-layer-color', SOLID],
    ['--mat-chip-trailing-action-state-layer-color', SOLID],
    ['--mat-tab-disabled-ripple-color', SOLID],
    ['--mat-button-text-disabled-state-layer-color', SOLID],
    ['--mat-button-filled-disabled-state-layer-color', SOLID],
    ['--mat-button-outlined-disabled-state-layer-color', SOLID],
    ['--mat-button-protected-disabled-state-layer-color', SOLID],
    ['--mat-button-tonal-disabled-state-layer-color', SOLID],
  ]),

  ...group('on-secondary-container', [
    ['--mat-button-tonal-ripple-color', mix(12)],
    ['--mat-button-tonal-state-layer-color', SOLID],
    ['--mat-chip-selected-hover-state-layer-color', SOLID],
    ['--mat-chip-selected-focus-state-layer-color', SOLID],
    ['--mat-chip-selected-trailing-action-state-layer-color', SOLID],
    ['--mat-option-selected-state-layer-color', SOLID],
    ['--mat-button-toggle-selected-state-background-color', SOLID],
  ]),

  ...group('on-primary', [
    ['--mat-button-filled-ripple-color', mix(12)],
    ['--mat-button-filled-state-layer-color', SOLID],
    ['--mat-button-text-state-layer-color', SOLID],
    ['--mat-button-outlined-state-layer-color', SOLID],
    ['--mat-button-protected-state-layer-color', SOLID],
  ]),

  ...group('on-primary-container', [
    ['--mat-fab-ripple-color', mix(12)],
    ['--mat-fab-small-ripple-color', mix(12)],
    ['--mat-fab-state-layer-color', SOLID],
    ['--mat-fab-small-state-layer-color', SOLID],
  ]),
];

/** Render one derivation into a CSS value, keeping Gemini's wrapping shape. */
function renderShape(color: string, shape: Shape): string {
  return shape.kind === 'solid'
    ? color
    : `color-mix(in srgb, ${color} ${shape.pct}%, transparent)`;
}

/**
 * Reader over a preset's declared page variables, with the fill-if-absent rule
 * and the role lookups both in one place.
 */
function createFiller(preset: ThemePreset) {
  const declared = new Map(preset.variables.map((v) => [v.property, v.value]));
  const out: ThemeVariable[] = [];

  const roleValue = (role: Role): string | undefined =>
    declared.get(`--gem-sys-color--${role}`);

  const fill = (property: string, value: string | undefined) => {
    if (!value || declared.has(property)) return;
    out.push({ property, value });
  };

  return { declared, roleValue, fill, out };
}

/**
 * Brand-locked decoration: the avatar orb, the wordmark gradient, glows.
 *
 * All of it hangs off the three stops a preset already curates for Gemini's
 * wordmark, which is the one triple in a theme picked to look good together.
 */
function deriveBrandTokens(f: ReturnType<typeof createFiller>): void {
  const { declared, fill } = f;
  const get = (p: string) => declared.get(p);

  const stop1 = get('--bard-color-brand-text-gradient-stop-1');
  const stop2 = get('--bard-color-brand-text-gradient-stop-2');
  const stop3 = get('--bard-color-brand-text-gradient-stop-3');
  const primary = get('--gem-sys-color--primary');
  const error = get('--gem-sys-color--error');

  // The orb: the single most prominent element on the page, and the one that
  // most obviously breaks a theme.
  fill('--bard-color-bard-avatar-v2-basic-circle-stop-1', stop1);
  fill('--bard-color-bard-avatar-v2-basic-circle-stop-2', stop2);
  fill('--bard-color-bard-avatar-v2-basic-circle-stop-3', stop3);

  // `advanced` marks the paid tier and must stay distinguishable from `basic`.
  // Gemini separates them by temperature (basic cool, advanced warm), so the
  // derived ramp shifts one stop along and lands on the theme's warm accent.
  fill('--bard-color-bard-avatar-v2-advanced-circle-stop-1', stop2);
  fill('--bard-color-bard-avatar-v2-advanced-circle-stop-2', stop3);
  fill('--bard-color-bard-avatar-v2-advanced-circle-stop-3', error ?? stop1);

  fill('--bard-color-avatar-ring-gradient-end', primary);

  // Presets set the v1 wordmark stops, but the current UI reads the v2 ones —
  // which is why a themed page still renders "Gemini" in Google blue.
  fill('--bard-color-brand-text-gradient-v2-stop-1', stop1);
  fill('--bard-color-brand-text-gradient-v2-stop-2', stop2);
  fill('--bard-color-brand-text-gradient-v2-stop-3', stop3);

  // Glow haloes and the mic button. Named after Google's hues rather than their
  // role, so the mapping goes by position in the ramp.
  fill('--gem-sys-color--soft-glow-blue-1', stop1);
  fill('--gem-sys-color--soft-glow-blue-2', stop2);
  fill('--gem-sys-color--soft-glow-pink-1', stop3);
  fill('--gem-sys-color--soft-glow-pink-2', stop2);
  fill('--gem-sys-color--mic-gradient-stop-1', stop1);
  fill('--gem-sys-color--mic-gradient-stop-2', stop2);
  fill('--gem-sys-color--mic-gradient-stop-3', stop3);
}

/**
 * Loading skeletons.
 *
 * Unlike the brand colours these *are* mode-aware in Gemini, so they are not
 * frozen — they just follow whichever base mode the theme forces and land on
 * Google's greys with a blue shimmer over a warm brown page. Three sets (default,
 * `alt`, `grayscale`), each a base, a moving band and an accent.
 */
function deriveSkeletonTokens(
  f: ReturnType<typeof createFiller>,
  preset: ThemePreset,
): void {
  const { declared, fill } = f;
  const get = (p: string) => declared.get(p);

  const primary = get('--gem-sys-color--primary');
  const primaryContainer = get('--gem-sys-color--primary-container');
  const secondary = get('--gem-sys-color--secondary');
  const secondaryContainer = get('--gem-sys-color--secondary-container');
  const surfaceContainer = get('--gem-sys-color--surface-container');
  const low = get('--gem-sys-color--surface-container-low');
  const lowest = get('--gem-sys-color--surface-container-lowest');
  const high = get('--gem-sys-color--surface-container-high');
  const surfaceDim = get('--gem-sys-color--surface-dim');

  fill('--bard-color-skeleton-loader-background-1', low);
  fill('--bard-color-skeleton-loader-background-2', high);
  fill('--bard-color-skeleton-loader-background-3', primary);

  fill('--bard-color-skeleton-loader-background-alt-1', low);
  fill('--bard-color-skeleton-loader-background-alt-2', secondaryContainer ?? primaryContainer);
  fill('--bard-color-skeleton-loader-background-alt-3', secondary ?? primary);

  fill('--bard-color-skeleton-loader-background-grayscale-1', lowest ?? low);
  fill('--bard-color-skeleton-loader-background-grayscale-2', high);
  fill('--bard-color-skeleton-loader-background-grayscale-3', surfaceContainer);

  // remy-surface sits consistently one step deeper than `surface` in both of
  // Gemini's modes (#faf9f9 on #fff, #030303 on #131314), which is what
  // surface-dim is for. No preset declares it, so anything painted with it stays
  // near-black under a themed page.
  fill('--bard-color-remy-surface', surfaceDim);

  // The shimmer overlay is a relative colour over remy-surface. Gemini uses a
  // different alpha per mode — 0.94 in light, 0.46 in dark — so the theme's own
  // preferred mode decides which one applies.
  if (surfaceDim) {
    const alpha = preset.preferredMode === 'dark' ? '0.46' : '0.94';
    fill(
      '--bard-color-lm-shimmer-selected-overlay',
      `color(from ${surfaceDim} srgb r g b/${alpha})`,
    );
  }
}

/**
 * The Lumi surface family, which drives the composer glow among other things.
 *
 * Presets already set `--lumi-sys-color--surface`, so the *centre* of the glow
 * follows the theme while its outer stop stays Google's sky blue (#9dd2ff light,
 * #14204f dark) — the halo ends up torn between two palettes, which is the part
 * that reads as wrong. `surface-accent` has no exact counterpart among Gemini's
 * own semantic tokens; it sits roughly one step further out than
 * primary-container (#d3e3fd / #1f3760). Since it is blurred into a haze,
 * primary-container itself is close enough and lands on "a soft wash of the
 * theme's primary".
 */
function deriveLumiTokens(f: ReturnType<typeof createFiller>): void {
  const { declared, fill } = f;
  const get = (p: string) => declared.get(p);

  const primaryContainer = get('--gem-sys-color--primary-container');
  const onSurface = get('--gem-sys-color--on-surface');
  const error = get('--gem-sys-color--error');

  fill('--lumi-sys-color--surface-accent', primaryContainer);

  // Overlay tints over on-surface. Gemini writes them as rgba() at fixed
  // alphas; color-mix renders the same and takes the preset's hex directly.
  if (onSurface) {
    fill('--lumi-sys-color--on-surface-variant', renderShape(onSurface, mix(55)));
    fill('--lumi-sys-color--on-surface-low', renderShape(onSurface, mix(10)));
  }
  fill('--lumi-sys-color--error', error);
}

/** Escape a value that is about to be interpolated into a CSS declaration. */
function cssSafe(value: string): string {
  return value.replace(/[;{}]/g, '').trim();
}

/**
 * Reshape the composer glow.
 *
 * Targets `.show-lm-background::before` *without* the `_nghost-ng-cNNNN`
 * attribute from Gemini's own rule — that hash is regenerated on every Angular
 * build, so matching it would make this break silently at some point. Dropping
 * it still wins the cascade: Gemini's selector is (0,2,1) and this one is
 * (0,2,2), one type selector ahead.
 *
 * `opacity` and `transform` are deliberately left alone. The element animates in
 * via `lm-background-grow`, and animations lose to `!important` declarations —
 * overriding either would freeze the entry animation. Intensity is applied by
 * fading the outer gradient stop instead.
 */
function buildLmGlowCss(preset: ThemePreset): string | null {
  const glow = preset.lmGlow;
  if (!glow) return null;

  const scope = `body.${'bs-theme--'}${preset.id} .show-lm-background::before`;

  if (glow === 'off') {
    return [
      '/* Composer glow removed: a blurred haze works against this theme. */',
      `${scope} {`,
      '  display: none !important;',
      '}',
    ].join('\n');
  }

  const o: LmGlowOptions = glow;
  const decls: string[] = [];

  // Fading is only worth a rule when it actually fades: at full strength the
  // derived surface-accent already is the outer stop.
  const fade = o.intensity !== undefined && o.intensity < 1;
  if (o.accent !== undefined || fade) {
    const accent = cssSafe(o.accent ?? 'var(--lumi-sys-color--surface-accent)');
    const outer = fade
      ? `color-mix(in srgb, ${accent} ${Math.round(
          Math.max(0, o.intensity as number) * 100,
        )}%, transparent)`
      : accent;
    decls.push(
      `  background: radial-gradient(ellipse 100% 100% at center 8%, var(--lumi-sys-color--surface) 0, ${outer} 50%) !important;`,
    );
  }
  if (o.blur) decls.push(`  filter: blur(${cssSafe(o.blur)}) !important;`);
  if (o.maxWidth) decls.push(`  max-width: ${cssSafe(o.maxWidth)} !important;`);
  if (o.maxHeight) decls.push(`  max-height: ${cssSafe(o.maxHeight)} !important;`);

  if (decls.length === 0) return null;
  return ['/* Composer glow, reshaped for this theme. */', `${scope} {`, ...decls, '}'].join('\n');
}

/** Apply the state-layer table, skipping roles the preset does not define. */
function deriveStateLayers(f: ReturnType<typeof createFiller>): void {
  for (const { property, role, shape } of STATE_LAYERS) {
    const color = f.roleValue(role);
    if (!color) continue;
    f.fill(property, renderShape(color, shape));
  }
}

/**
 * Return the preset with Gemini's underivable-by-Gemini tokens filled in.
 *
 * The preset is copied rather than mutated: themeRegistry holds shared
 * instances, and appending on every theme switch would grow them without bound.
 * The id is left alone so applyTheme()'s idempotency check still matches.
 */
export function withGeminiDerivedTokens(preset: ThemePreset): ThemePreset {
  const f = createFiller(preset);

  deriveBrandTokens(f);
  deriveSkeletonTokens(f, preset);
  deriveLumiTokens(f);
  deriveStateLayers(f);

  const glowCss = buildLmGlowCss(preset);
  if (f.out.length === 0 && !glowCss) return preset;

  return {
    ...preset,
    variables: [...preset.variables, ...f.out],
    extraCss: glowCss
      ? [preset.extraCss, glowCss].filter(Boolean).join('\n\n')
      : preset.extraCss,
  };
}
