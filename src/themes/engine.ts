/**
 * Theme injection engine.
 *
 * Responsible for applying/removing CSS variable overrides on document.body,
 * loading Google Fonts, and injecting extra CSS (textures, backdrop-filter, etc.)
 */

import type { ThemePreset } from './types';

const THEME_STYLE_ID = 'better-sidebar-custom-theme';
const THEME_FONT_ID = 'better-sidebar-custom-theme-fonts';
const THEME_CLASS_PREFIX = 'bs-theme--';

let currentThemeId: string | null = null;

/** All CSS custom properties that sidebar themes may set on a container. */
const SIDEBAR_VARIABLE_PROPS = [
  '--background', '--foreground', '--card', '--card-foreground',
  '--popover', '--popover-foreground', '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
  '--border', '--input', '--ring', '--sidebar-icon-color', '--font-sans',
  '--gem-sys-color--primary-container', '--gem-sys-color--on-primary-container',
  '--radius', '--popover-blur', '--popover-bg',
  '--panel-blur', '--panel-bg', '--overlay-bg', '--overlay-blur',
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
 * Apply a theme preset to the page.
 * Injects CSS variables onto body via a high-specificity selector,
 * loads fonts, and adds extra CSS.
 */
export function applyTheme(preset: ThemePreset): void {
  removeTheme(); // Clean up previous theme first

  const body = document.body;
  if (!body) return;

  // 1. Add theme class to body for identification
  body.classList.add(`${THEME_CLASS_PREFIX}${preset.id}`);
  currentThemeId = preset.id;

  // 2. Build CSS variable block with high specificity
  //    Using body[class] to beat :root .light-theme specificity
  const variablesCss = preset.variables
    .map((v) => `  ${v.property}: ${v.value} !important;`)
    .join('\n');

  let css = `body.${THEME_CLASS_PREFIX}${preset.id} {\n${variablesCss}\n}`;

  // 3. Append extra CSS if provided
  if (preset.extraCss) {
    css += `\n\n/* Theme extra styles: ${preset.id} */\n${preset.extraCss}`;
  }

  // 4. Inject style element
  const style = document.createElement('style');
  style.id = THEME_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);

  // 5. Load Google Fonts if specified
  if (preset.fonts && preset.fonts.length > 0) {
    loadFonts(preset.fonts);
  }

  console.log(`Better Sidebar: Theme "${preset.id}" applied`);
}

/**
 * Remove the currently applied theme, restoring original styles.
 */
export function removeTheme(): void {
  // Remove style element
  const style = document.getElementById(THEME_STYLE_ID);
  if (style) style.remove();

  // Remove font link
  const fontLink = document.getElementById(THEME_FONT_ID);
  if (fontLink) fontLink.remove();

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
  // Always clear previous theme first to prevent property leaking between themes
  clearSidebarTheme(container);

  if (!preset || (!preset.sidebarVariables?.length && !preset.sidebarStyles)) {
    return;
  }

  container.setAttribute('data-custom-theme', preset.id);

  // Apply CSS variables
  if (preset.sidebarVariables) {
    for (const v of preset.sidebarVariables) {
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

/**
 * Load Google Fonts via a <link> element.
 */
function loadFonts(fonts: string[]): void {
  const existing = document.getElementById(THEME_FONT_ID);
  if (existing) existing.remove();

  const families = fonts.map((f) => `family=${f.replace(/ /g, '+')}`).join('&');
  const link = document.createElement('link');
  link.id = THEME_FONT_ID;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}
