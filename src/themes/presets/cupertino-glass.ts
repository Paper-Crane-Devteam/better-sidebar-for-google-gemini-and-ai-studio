/**
 * 🍎 果味毛玻璃 (Cupertino Glass)
 *
 * 完全拟合现代操作系统原生质感。
 * 大量运用 backdrop-filter: blur() 半透明磨砂玻璃效果。
 * 极简高对比度黑白灰，克制留白和阴影区分层级。
 * 系统原生字体 -apple-system / San Francisco / Inter。
 */

import type { ThemePreset } from '../types';

export const cupertinoGlass: ThemePreset = {
  id: 'cupertino-glass',
  name: 'Cupertino Glass',
  nameZh: '果味毛玻璃',
  description:
    'Frosted glass aesthetic with system fonts and minimal color palette',
  descriptionZh: '磨砂玻璃质感，系统原生字体，极简黑白灰，纯粹生产力',
  isPremium: true,
  preferredMode: 'light',
  fonts: ['Inter:wght@300;400;500;600'],
  extraCss: `
/* Remove rounded corners for a more native feel */
body.bs-theme--cupertino-glass mat-card,
body.bs-theme--cupertino-glass .mdc-card {
  border-radius: 12px !important;
}

/* Frosted glass on Gemini native dropdowns/menus (they float above content) */
body.bs-theme--cupertino-glass .cdk-overlay-pane .mat-mdc-menu-panel,
body.bs-theme--cupertino-glass .cdk-overlay-pane mat-card {
  backdrop-filter: blur(10px) saturate(1.8) !important;
  -webkit-backdrop-filter: blur(10px) saturate(1.8) !important;
  border-radius: 10px !important;
  border: 0.5px solid rgba(255, 255, 255, 0.35) !important;
  box-shadow: 0 24px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08) !important;
}

body.bs-theme--cupertino-glass .cdk-global-overlay-wrapper{
  backdrop-filter: blur(10px) saturate(1.8) !important;
  -webkit-backdrop-filter: blur(10px) saturate(1.8) !important;
}


/* System font stack */
body.bs-theme--cupertino-glass {
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro Display', 'Helvetica Neue', sans-serif !important;
}

body.bs-theme--cupertino-glass *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  variables: [
    // ─── Surface / Background (极度纯净) ────────────────────────────
    { property: '--gem-sys-color--surface', value: 'rgba(255,255,255,0.85)' },
    { property: '--gem-sys-color--surface-bright', value: '#ffffff' },
    { property: '--gem-sys-color--surface-dim', value: 'rgba(240,240,240,0.9)' },
    {
      property: '--gem-sys-color--surface-container',
      value: 'rgba(246,246,246,0.75)',
    },
    {
      property: '--gem-sys-color--surface-container-low',
      value: 'rgba(250,250,250,0.8)',
    },
    {
      property: '--gem-sys-color--surface-container-high',
      value: 'rgba(238,238,238,0.8)',
    },
    {
      property: '--gem-sys-color--surface-container-highest',
      value: 'rgba(228,228,228,0.85)',
    },
    {
      property: '--gem-sys-color--surface-container-lowest',
      value: '#ffffff',
    },
    { property: '--gem-sys-color--surface-variant', value: 'rgba(235,235,235,0.8)' },
    { property: '--mat-app-background-color', value: 'rgba(255,255,255,0.85)' },
    { property: '--lumi-sys-color--surface', value: 'rgba(255,255,255,0.85)' },
    { property: '--lumi-sys-color--surface-bright', value: '#ffffff' },
    { property: '--lumi-sys-color--surface-dim', value: 'rgba(240,240,240,0.9)' },
    {
      property: '--bard-color-synthetic--chat-window-surface',
      value: 'rgba(255,255,255,0.72)',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container',
      value: 'rgba(246,246,246,0.72)',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container-highest',
      value: 'rgba(228,228,228,0.8)',
    },
    {
      property: '--bard-color-sidenav-background-desktop',
      value: 'rgba(242,242,242,0.72)',
    },
    {
      property: '--bard-color-sidenav-background-mobile',
      value: 'rgba(246,246,246,0.8)',
    },

    // ─── Text (高对比度纯黑) ────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#1d1d1f' },
    { property: '--gem-sys-color--on-surface-variant', value: '#48484a' },
    { property: '--gem-sys-color--on-surface-low', value: '#8e8e93' },
    { property: '--mat-app-text-color', value: '#1d1d1f' },
    { property: '--lumi-sys-color--on-surface', value: '#1d1d1f' },
    { property: '--bard-color-form-field-placeholder', value: '#8e8e93' },

    // ─── Primary (Apple Blue) ───────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#007aff' },
    { property: '--gem-sys-color--on-primary', value: '#ffffff' },
    { property: '--gem-sys-color--primary-container', value: '#e3f2ff' },
    { property: '--gem-sys-color--on-primary-container', value: '#003a7a' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#a0cfff' },
    { property: '--mat-focus-indicator-border-color', value: '#007aff' },
    {
      property: '--mat-progress-spinner-active-indicator-color',
      value: '#007aff',
    },

    // ─── Secondary (Neutral Gray) ───────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#636366' },
    { property: '--gem-sys-color--on-secondary', value: '#ffffff' },
    { property: '--gem-sys-color--secondary-container', value: '#e5e5ea' },
    { property: '--gem-sys-color--on-secondary-container', value: '#1c1c1e' },
    { property: '--gem-sys-color--tertiary-container', value: '#f2f2f7' },

    // ─── Outline / Border (极细微) ──────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#d1d1d6' },
    { property: '--gem-sys-color--outline-variant', value: 'rgba(0, 0, 0, 0.08)' },
    { property: '--gem-sys-color--outline-low', value: 'rgba(0, 0, 0, 0.04)' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#1c1c1e' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#f2f2f7' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#ff3b30' },

    // ─── Brand Gradient (subtle blue) ───────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#007aff' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#5856d6' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#af52de' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#8e8e93' },
    { property: '--bard-color-code-variables', value: '#ff3b30' },
    { property: '--bard-color-code-literal', value: '#ff9500' },
    { property: '--bard-color-code-class', value: '#af52de' },
    { property: '--bard-color-code-string', value: '#34c759' },
    { property: '--bard-color-code-quotes-and-meta', value: '#007aff' },
    { property: '--bard-color-code-keyword', value: '#5856d6' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#007aff' },
    { property: '--mat-button-filled-label-text-color', value: '#ffffff' },
    { property: '--mat-button-tonal-container-color', value: '#e5e5ea' },
    { property: '--mat-button-tonal-label-text-color', value: '#1c1c1e' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: 'rgba(246,246,246,0.55)' },
    { property: '--mat-menu-item-label-text-color', value: '#1d1d1f' },
    { property: '--mat-menu-item-icon-color', value: '#48484a' },
    { property: '--mat-menu-divider-color', value: 'rgba(0, 0, 0, 0.06)' },
    {
      property: '--mat-menu-container-elevation-shadow',
      value: '0px 4px 24px rgba(0,0,0,0.12), 0px 1px 4px rgba(0,0,0,0.08)',
    },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#1d1d1f' },
    {
      property: '--mat-list-list-item-supporting-text-color',
      value: '#48484a',
    },
    {
      property: '--mat-list-list-item-leading-icon-color',
      value: '#48484a',
    },
    { property: '--mat-list-active-indicator-color', value: '#e3f2ff' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    {
      property: '--bard-color-zero-state-prompt-chip-background',
      value: '#e3f2ff',
    },
    {
      property: '--bard-color-zero-state-prompt-chip-text',
      value: '#007aff',
    },

    // ─── Font override via CSS variable ─────────────────────────────
    {
      property: '--mat-menu-item-label-text-font',
      value: '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif',
    },
    {
      property: '--mat-list-list-item-label-text-font',
      value: '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif',
    },
    {
      property: '--mat-list-list-item-supporting-text-font',
      value: '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif',
    },
    {
      property: '--mat-button-text-label-text-font',
      value: '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif',
    },
    {
      property: '--mat-button-filled-label-text-font',
      value: '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif',
    },
  ],
  sidebarVariables: [
    // Pure frosted glass tones
    { property: '--background', value: '246 246 246' },       // #f6f6f6
    { property: '--foreground', value: '29 29 31' },          // #1d1d1f
    { property: '--card', value: '255 255 255' },
    { property: '--card-foreground', value: '29 29 31' },
    { property: '--popover', value: '255 255 255' },
    { property: '--popover-foreground', value: '29 29 31' },
    { property: '--primary', value: '0 122 255' },            // #007aff
    { property: '--primary-foreground', value: '255 255 255' },
    { property: '--secondary', value: '229 229 234' },        // #e5e5ea
    { property: '--secondary-foreground', value: '29 29 31' },
    { property: '--muted', value: '229 229 234' },
    { property: '--muted-foreground', value: '142 142 147' }, // #8e8e93
    { property: '--accent', value: '227 242 255' },           // #e3f2ff
    { property: '--accent-foreground', value: '0 58 122' },
    { property: '--destructive', value: '255 59 48' },        // #ff3b30
    { property: '--destructive-foreground', value: '255 255 255' },
    { property: '--border', value: '230 230 235' },           // lighter, less muddy
    { property: '--input', value: '220 220 225' },            // softer input border
    { property: '--ring', value: '0 122 255' },
    { property: '--sidebar-icon-color', value: '72 72 74' },  // #48484a
    { property: '--font-sans', value: '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Helvetica Neue", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#e3f2ff' },
    { property: '--gem-sys-color--on-primary-container', value: '#003a7a' },
    { property: '--radius', value: '12px' },
    // Frosted glass for dropdowns/popovers (macOS-native feel)
    { property: '--popover-blur', value: 'blur(10px) saturate(1.8)' },
    { property: '--popover-bg', value: 'rgba(255, 255, 255, 0.55)' },
    { property: '--popover-radius', value: '10px' },
    { property: '--popover-shadow', value: '0 24px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)' },
    { property: '--popover-border', value: '0.5px solid rgba(255,255,255,0.35)' },
    // Frosted glass for modal panels (settings, dialogs)
    // Only the overlay/mask has blur — panel is just semi-transparent to let the blur show through
    { property: '--panel-blur', value: 'none' },
    { property: '--panel-bg', value: 'rgba(255, 255, 255, 0.55)' },
    { property: '--overlay-bg', value: 'rgba(255, 255, 255, 0.15)' },
    { property: '--overlay-blur', value: 'blur(10px) saturate(1.5)' },
  ],
};
