/**
 * Theme injection engine.
 *
 * Responsible for applying/removing CSS variable overrides on document.body,
 * loading Google Fonts, and injecting extra CSS (textures, backdrop-filter, etc.)
 */

import type { ThemePreset, ThemeVariable } from './types';

const THEME_STYLE_ID = 'better-sidebar-custom-theme';
/**
 * Marker attribute for theme webfont <link> elements.
 *
 * Font stylesheets are kept keyed by URL and are never swapped while switching
 * themes: removing and re-adding a Google Fonts stylesheet makes the browser
 * re-resolve every @font-face, and the resulting full-page reflow is what makes
 * the theme transition animation stall halfway. An unreferenced font stylesheet
 * costs nothing, so they are only cleaned up when themes are turned off.
 */
const THEME_FONT_ATTR = 'data-bs-theme-fonts';
const THEME_CLASS_PREFIX = 'bs-theme--';

/** Style element holding the current theme's typography rules */
const THEME_FONT_CSS_ID = 'better-sidebar-custom-theme-fonts-css';
/** Body class that activates the typography rules (see ThemePreset.fontCss) */
const FONT_CLASS_PREFIX = 'bs-fonts--';

/**
 * Sidebar font variables. Written in the typography step rather than with the
 * rest of the sidebar variables, so the sidebar and the page change typeface in
 * the same frame. They cannot be inherited from body: the sidebar's own
 * stylesheet declares these on its root container, which wins.
 */
const DEFERRED_SIDEBAR_FONT_PROPS = ['--font-sans', '--font-mono'] as const;

let currentThemeId: string | null = null;
let currentFontThemeId: string | null = null;

/** All CSS custom properties that sidebar themes may set on a container. */
const SIDEBAR_VARIABLE_PROPS = [
  '--background', '--foreground', '--card', '--card-foreground',
  '--popover', '--popover-foreground', '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
  '--border', '--input', '--ring', '--sidebar-icon-color', '--font-sans',
  '--font-mono', '--sidebar-edge-border',
  '--gem-sys-color--primary-container', '--gem-sys-color--on-primary-container',
  '--radius', '--popover-blur', '--popover-bg',
  '--panel-blur', '--panel-bg', '--overlay-bg', '--overlay-blur',
  '--shadow-popover', '--shadow-panel',
  '--highlight', '--highlight-foreground',
  '--success', '--success-foreground',
  '--warning', '--warning-foreground',
] as const;

/** Direct CSS style properties that sidebar themes may set. */
const SIDEBAR_STYLE_PROPS = [
  'backdrop-filter', '-webkit-backdrop-filter', 'background-color',
] as const;

/**
 * Clear all sidebar theme variables and styles from a container element.
 * Exported so other modules (e.g. tooltip-helper) can reuse without duplicating the prop list.
 */
export function clearSidebarTheme(container: HTMLElement): void {
  container.removeAttribute('data-custom-theme');
  for (const prop of SIDEBAR_VARIABLE_PROPS) {
    container.style.removeProperty(prop);
  }
  for (const prop of SIDEBAR_STYLE_PROPS) {
    container.style.removeProperty(prop);
  }
}

/**
 * Apply a theme preset to the page: CSS variables + extraCss, synchronously.
 *
 * Typography is NOT applied here. Call applyThemeFontCss() for that — it waits
 * for the switch animation and the webfont download first.
 */
export function applyTheme(preset: ThemePreset): void {
  const body = document.body;
  if (!body) return;

  const themeClass = `${THEME_CLASS_PREFIX}${preset.id}`;

  // 1. Build CSS variable block with high specificity
  //    Using body[class] to beat :root .light-theme specificity
  const variablesCss = preset.variables
    .map((v) => `  ${v.property}: ${v.value} !important;`)
    .join('\n');

  let css = `body.${themeClass} {\n${variablesCss}\n}`;

  // 2. Append extra CSS if provided
  if (preset.extraCss) {
    css += `\n\n/* Theme extra styles: ${preset.id} */\n${preset.extraCss}`;
  }

  // 3. Bail out if this exact theme CSS is already live.
  //    A theme switch reaches applyTheme() more than once (store subscriber +
  //    the view-transition callback); re-injecting the <style> would force a
  //    second full-page style recalc for nothing. Comparing the CSS text keeps
  //    live-editing a user theme working.
  const existingStyle = document.getElementById(THEME_STYLE_ID);
  if (
    currentThemeId === preset.id &&
    existingStyle?.textContent === css &&
    body.classList.contains(themeClass)
  ) {
    return;
  }

  removeTheme({ keepFonts: true }); // Clean up previous theme first

  body.classList.add(themeClass);
  currentThemeId = preset.id;

  // 4. Inject style element
  const style = document.createElement('style');
  style.id = THEME_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);

  // Webfonts are deliberately NOT requested here. Registering @font-face rules
  // invalidates the document's font cache and forces a full relayout, and the
  // stylesheet arrives at an unpredictable moment — mid-animation, typically.
  // applyThemeFontCss() loads them once the animation is over.

  console.log(`Better Sidebar: Theme "${preset.id}" applied`);
}

/**
 * Remove the currently applied theme, restoring original styles.
 *
 * @param options.keepFonts - Keep the webfont stylesheets AND the typography
 *   rules in place. Used when another theme is about to be applied, or when the
 *   caller will hand typography over to applyThemeFontCss(): dropping font
 *   rules synchronously would flip the whole page back to its default typeface
 *   for the duration of the switch animation.
 */
export function removeTheme(options?: { keepFonts?: boolean }): void {
  // Remove style element
  const style = document.getElementById(THEME_STYLE_ID);
  if (style) style.remove();

  if (!options?.keepFonts) {
    clearThemeFonts();
    clearThemeFontCss();
  }

  // Remove theme class from body
  if (currentThemeId) {
    document.body?.classList.remove(`${THEME_CLASS_PREFIX}${currentThemeId}`);
    currentThemeId = null;
  }
}

/**
 * Apply sidebar-specific CSS variables to a Shadow DOM container element.
 * This is called from the overlay Layout to theme the sidebar UI.
 */
export function applySidebarTheme(
  container: HTMLElement,
  preset: ThemePreset | null,
): void {
  // The sidebar typeface changes together with the page typeface, so the
  // outgoing values are kept across the clear and handed to the deferred step.
  const outgoingFonts = DEFERRED_SIDEBAR_FONT_PROPS.map(
    (prop) => [prop, container.style.getPropertyValue(prop)] as const,
  );

  // Always clear previous theme first to prevent property leaking between themes
  clearSidebarTheme(container);
  for (const [prop, value] of outgoingFonts) {
    if (value) container.style.setProperty(prop, value);
  }
  void applyDeferredSidebarFont(container, preset);

  if (!preset || (!preset.sidebarVariables?.length && !preset.sidebarStyles)) {
    return;
  }

  container.setAttribute('data-custom-theme', preset.id);

  // Apply CSS variables. The font props are left to the deferred step for
  // themes that carry typography rules, so the sidebar and the page switch
  // typeface in the same frame.
  if (preset.sidebarVariables) {
    for (const v of preset.sidebarVariables) {
      if (
        preset.fontCss &&
        (DEFERRED_SIDEBAR_FONT_PROPS as readonly string[]).includes(v.property)
      ) {
        continue;
      }
      container.style.setProperty(v.property, v.value);
    }
  }

  // Apply direct inline styles (e.g. backdrop-filter)
  if (preset.sidebarStyles) {
    for (const [prop, value] of Object.entries(preset.sidebarStyles)) {
      container.style.setProperty(prop, value);
    }
  }
}

/**
 * Get the currently active theme ID, or null if none.
 */
export function getCurrentThemeId(): string | null {
  return currentThemeId;
}

/** Build the Google Fonts CSS URL for a list of font specs. */
function buildFontsHref(fonts: string[]): string {
  const families = fonts.map((f) => `family=${f.replace(/ /g, '+')}`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Load Google Fonts via a <link> element.
 * Idempotent per URL: an already-present stylesheet is reused instead of being
 * removed and re-added, so switching themes never re-resolves loaded fonts.
 */
function loadFonts(fonts: string[]): HTMLLinkElement {
  const href = buildFontsHref(fonts);

  for (const el of document.querySelectorAll<HTMLLinkElement>(
    `link[${THEME_FONT_ATTR}]`,
  )) {
    if (el.href === href) return el;
  }

  const link = document.createElement('link');
  link.setAttribute(THEME_FONT_ATTR, '');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return link;
}

/** Drop every theme webfont stylesheet. Only used when themes are turned off. */
export function clearThemeFonts(): void {
  for (const link of document.querySelectorAll(`link[${THEME_FONT_ATTR}]`)) {
    link.remove();
  }
}

// ─── Typography (applied separately from colours) ───────────────────────────

/**
 * Gate that the typography step waits on. The theme switch animation sets it
 * so font rules — the most expensive part of a theme, and the part that waits
 * on a network download — land after the animation instead of during it.
 */
let typographyGate: Promise<unknown> = Promise.resolve();

/** Bumped on every request so a slow one can tell it has been superseded. */
let typographyGeneration = 0;

/**
 * Hold back typography until `gate` settles. Called by the theme transition
 * with its `finished` promise. Resets itself once the gate settles, so
 * non-animated theme changes are not delayed.
 */
export function setTypographyGate(gate: Promise<unknown>): void {
  const settled = gate.catch(() => undefined);
  typographyGate = settled;
  void settled.then(() => {
    if (typographyGate === settled) typographyGate = Promise.resolve();
  });
}

/** Fallback monospace stack for themes that do not name one of their own. */
const SYSTEM_MONO_STACK =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

/**
 * Elements whose glyphs come out of an icon font. They have to keep it — a
 * theme font would render the ligature name as literal text.
 */
const ICON_FONT_EXCLUSIONS = [
  '.material-symbols-outlined',
  '.material-symbols-rounded',
  '.material-symbols-sharp',
  '.google-symbols',
  'mat-icon',
  '.mat-icon',
  '[class*="material-symbols"]',
  '[class*="google-symbols"]',
]
  .map((selector) => `:not(${selector})`)
  .join('');

/** Resolve the monospace stack a theme wants for code. */
function resolveMonoStack(preset: ThemePreset): string {
  return (
    preset.fontMono ??
    preset.sidebarVariables?.find((v) => v.property === '--font-mono')?.value ??
    SYSTEM_MONO_STACK
  );
}

/**
 * Pull code elements back onto a monospace face.
 *
 * Every theme's `fontCss` re-points the page at its body font with a broad
 * `*:not(<icons>) { font-family: inherit }` rule. That is right for prose and
 * wrong for code: in `pre`/`code` the monospace advance width is load-bearing,
 * and inheriting a serif or a rounded sans breaks column alignment outright.
 *
 * The rule is appended here instead of being written into each preset so that
 * imported user themes are covered too — they arrive through
 * userThemeToPreset() carrying their own `fontCss`, and nothing would otherwise
 * protect their code blocks. `!important` is what makes this win: the inherit
 * rule it corrects is unprefixed, so source order alone would not settle it.
 *
 * Descendants of `pre`/`code` are included because Gemini wraps syntax tokens
 * in spans that carry their own font-family; the icon exclusions are reapplied
 * there since copy buttons and the like live inside the code block chrome.
 */
function buildMonoCss(preset: ThemePreset): string {
  const scope = `body.${FONT_CLASS_PREFIX}${preset.id}`;
  const stack = resolveMonoStack(preset);
  return [
    '/* Code keeps a monospace face regardless of the theme body font. */',
    `${scope} :is(pre, code, kbd, samp),`,
    `${scope} :is(pre, code) *${ICON_FONT_EXCLUSIONS} {`,
    `  font-family: ${stack} !important;`,
    '}',
  ].join('\n');
}

/**
 * Build the full typography stylesheet: font variables (as a body rule) plus
 * the preset's own font rules. Returns null when the theme has no typography.
 */
function buildFontCss(
  preset: ThemePreset | null,
  extraFontVariables?: ThemeVariable[],
): string | null {
  if (!preset) return null;

  const vars = [...(preset.fontVariables ?? []), ...(extraFontVariables ?? [])];
  const blocks: string[] = [];

  if (vars.length > 0) {
    const declarations = vars
      .map((v) => `  ${v.property}: ${v.value} !important;`)
      .join('\n');
    blocks.push(
      `body.${FONT_CLASS_PREFIX}${preset.id} {\n${declarations}\n}`,
    );
  }

  if (preset.fontCss) {
    blocks.push(preset.fontCss);
    // Must come after the preset's own rules — see buildMonoCss().
    blocks.push(buildMonoCss(preset));
  }

  return blocks.length > 0 ? blocks.join('\n\n') : null;
}

/** Swap the typography stylesheet and the body class that activates it. */
function injectFontCss(themeId: string | null, fontCss: string | null): void {
  const body = document.body;
  if (!body) return;

  const existing = document.getElementById(THEME_FONT_CSS_ID);
  const nextClass = themeId && fontCss ? `${FONT_CLASS_PREFIX}${themeId}` : null;

  // Nothing to do — avoids a pointless full-page style recalc
  if (
    currentFontThemeId === themeId &&
    (existing?.textContent ?? null) === fontCss
  ) {
    return;
  }

  if (currentFontThemeId) {
    body.classList.remove(`${FONT_CLASS_PREFIX}${currentFontThemeId}`);
  }
  currentFontThemeId = null;
  existing?.remove();

  if (!nextClass || !fontCss) return;

  const style = document.createElement('style');
  style.id = THEME_FONT_CSS_ID;
  style.textContent = fontCss;
  document.head.appendChild(style);
  body.classList.add(nextClass);
  currentFontThemeId = themeId;
}

/** Drop the typography stylesheet and its body class. */
export function clearThemeFontCss(): void {
  typographyGeneration++;
  injectFontCss(null, null);
}

/**
 * Per-container guard for the deferred sidebar font. A WeakMap so a detached
 * container is collected normally instead of being kept alive by a registry.
 */
const sidebarFontGeneration = new WeakMap<HTMLElement, number>();

/**
 * Set the sidebar's font props once the animation is over and the fonts are
 * ready. The values cannot be inherited from body: the sidebar's own stylesheet
 * declares them on its root container, which wins over inheritance.
 */
async function applyDeferredSidebarFont(
  container: HTMLElement,
  preset: ThemePreset | null,
): Promise<void> {
  const generation = (sidebarFontGeneration.get(container) ?? 0) + 1;
  sidebarFontGeneration.set(container, generation);

  const targets = DEFERRED_SIDEBAR_FONT_PROPS.map((prop) => {
    const declared = preset?.sidebarVariables?.find(
      (v) => v.property === prop,
    )?.value;
    // A theme that names a monospace stack but does not spell it out as a
    // sidebar variable still gets it applied, so page and sidebar code agree.
    const fallback =
      prop === '--font-mono' && preset?.fontCss ? preset.fontMono : undefined;
    return [prop, declared ?? fallback] as const;
  });

  await typographyGate;
  if (sidebarFontGeneration.get(container) !== generation) return;

  if (preset?.fonts?.length) {
    await preloadThemeFonts(preset);
  }

  if (sidebarFontGeneration.get(container) !== generation) return; // superseded
  if (!container.isConnected) return;

  for (const [prop, target] of targets) {
    const current = container.style.getPropertyValue(prop);
    if (current === (target ?? '')) continue;

    if (target) container.style.setProperty(prop, target);
    else container.style.removeProperty(prop);
  }
}

/**
 * Apply a theme's typography — the second half of a theme switch.
 *
 * Waits for the switch animation (see setTypographyGate) and for the webfonts
 * to finish downloading, then swaps the font stylesheet in one step. Pass null
 * to go back to the page's own typography.
 *
 * Safe to call repeatedly and from several places for the same switch: it is
 * idempotent, and a stale call is dropped as soon as a newer one starts.
 */
export async function applyThemeFontCss(
  preset: ThemePreset | null,
  extraFontVariables?: ThemeVariable[],
): Promise<void> {
  const generation = ++typographyGeneration;

  // Wait for the animation BEFORE touching fonts. Requesting a Google Fonts
  // stylesheet registers @font-face rules, which invalidates the document's
  // font cache and forces a full relayout — the exact stall this whole split
  // exists to avoid.
  await typographyGate;
  if (generation !== typographyGeneration) return;

  if (preset?.fonts?.length) {
    await preloadThemeFonts(preset, 10_000);
    if (generation !== typographyGeneration) return;
  }

  injectFontCss(preset?.id ?? null, buildFontCss(preset, extraFontVariables));
}

/** Parse 'Nunito+Sans:wght@300;400;700' into a family name and its weights. */
function parseFontSpec(spec: string): { family: string; weights: string[] } {
  const [rawFamily, axes] = spec.split(':');
  const family = rawFamily.replace(/\+/g, ' ').trim();
  const wght = axes?.match(/wght@([\d;.]+)/);
  const weights = wght
    ? wght[1].split(';').filter(Boolean)
    : ['400'];
  return { family, weights };
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Download a theme's webfonts and resolve once they are usable.
 *
 * Used by applyThemeFontCss() to make sure the font stylesheet is applied only
 * when the typeface is actually available — otherwise text would reflow twice:
 * once to the fallback font, once to the real one.
 *
 * Resolves immediately for fonts that are already loaded, and never waits
 * longer than `budgetMs`.
 */
export async function preloadThemeFonts(
  preset: ThemePreset,
  budgetMs = 10_000,
): Promise<void> {
  if (!preset.fonts?.length) return;
  if (typeof document === 'undefined' || !document.fonts) return;

  const descriptors = preset.fonts
    .map(parseFontSpec)
    .flatMap(({ family, weights }) =>
      weights.map((w) => `${w} 1em "${family}"`),
    );

  // Fonts already loaded resolve immediately below, so there is no fast path
  // to take here — document.fonts.load() is the reliable "is it ready?" check.
  const deadline = delay(budgetMs);
  const link = loadFonts(preset.fonts);

  // document.fonts.load() only sees @font-face rules that are already parsed,
  // so wait for the stylesheet first.
  if (!link.sheet) {
    await Promise.race([
      new Promise<void>((resolve) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
      }),
      deadline,
    ]);
  }

  await Promise.race([
    Promise.all(
      descriptors.map((d) => document.fonts.load(d).catch(() => undefined)),
    ),
    deadline,
  ]);
}
