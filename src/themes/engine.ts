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
