/**
 * 🌹 玫瑰松 (Rosé Pine)
 *
 * 柔和暗色主题，以低饱和的玫瑰粉和金色作为点缀，
 * 深邃的紫黑底色营造出优雅安静的氛围。
 * 使用 Nunito Sans 无衬线字体，圆润友好。
 */

import type { ThemePreset } from '../types';

export const rosePine: ThemePreset = {
  id: 'rose-pine',
  name: 'Rosé Pine',
  description:
    'Soft dark theme with muted rose and gold accents',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['Nunito+Sans:wght@300;400;500;600;700'],
  fontCss: `
/* Rosé Pine font override */
body.bs-fonts--rose-pine {
  font-family: 'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

body.bs-fonts--rose-pine *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Nunito Sans", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Nunito Sans", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Nunito Sans", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Nunito Sans", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Nunito Sans", -apple-system, BlinkMacSystemFont, sans-serif' },
  ],
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#191724' },
    { property: '--gem-sys-color--surface-bright', value: '#1f1d2e' },
    { property: '--gem-sys-color--surface-dim', value: '#13111d' },
    { property: '--gem-sys-color--surface-container', value: '#1f1d2e' },
    { property: '--gem-sys-color--surface-container-low', value: '#191724' },
    { property: '--gem-sys-color--surface-container-high', value: '#26233a' },
    { property: '--gem-sys-color--surface-container-highest', value: '#2a2837' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#13111d' },
    { property: '--gem-sys-color--surface-variant', value: '#26233a' },
    { property: '--mat-app-background-color', value: '#191724' },
    { property: '--lumi-sys-color--surface', value: '#191724' },
    { property: '--lumi-sys-color--surface-bright', value: '#1f1d2e' },
    { property: '--lumi-sys-color--surface-dim', value: '#13111d' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#191724' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#1f1d2e' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#2a2837' },
    { property: '--bard-color-sidenav-background-desktop', value: '#16141f' },
    { property: '--bard-color-sidenav-background-mobile', value: '#191724' },

    // ─── Text ───────────────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#e0def4' },
    { property: '--gem-sys-color--on-surface-variant', value: '#c4c0e0' },
    { property: '--gem-sys-color--on-surface-low', value: '#6e6a86' },
    { property: '--mat-app-text-color', value: '#e0def4' },
    { property: '--lumi-sys-color--on-surface', value: '#e0def4' },
    { property: '--bard-color-form-field-placeholder', value: '#6e6a86' },

    // ─── Primary ────────────────────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#ebbcba' },
    { property: '--gem-sys-color--on-primary', value: '#2e1f1e' },
    { property: '--gem-sys-color--primary-container', value: '#4a3230' },
    { property: '--gem-sys-color--on-primary-container', value: '#ebbcba' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#c49a98' },
    { property: '--mat-focus-indicator-border-color', value: '#ebbcba' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#ebbcba' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#f6c177' },
    { property: '--gem-sys-color--on-secondary', value: '#2e2510' },
    { property: '--gem-sys-color--secondary-container', value: '#4a3c1e' },
    { property: '--gem-sys-color--on-secondary-container', value: '#f6c177' },
    { property: '--gem-sys-color--tertiary-container', value: '#26233a' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#524f67' },
    { property: '--gem-sys-color--outline-variant', value: '#403d52' },
    { property: '--gem-sys-color--outline-low', value: '#26233a' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#e0def4' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#191724' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#eb6f92' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#ebbcba' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#c4a7e7' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#f6c177' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#6e6a86' },
    { property: '--bard-color-code-variables', value: '#ebbcba' },
    { property: '--bard-color-code-literal', value: '#f6c177' },
    { property: '--bard-color-code-class', value: '#9ccfd8' },
    { property: '--bard-color-code-string', value: '#f6c177' },
    { property: '--bard-color-code-quotes-and-meta', value: '#c4a7e7' },
    { property: '--bard-color-code-keyword', value: '#31748f' },
    { property: '--lumi-sys-color--code-background', value: '#13111d' },
    { property: '--lumi-sys-color--code-primary-text', value: '#e0def4' },
    { property: '--lumi-sys-color--code-grey-text', value: '#6e6a86' },
    { property: '--lumi-sys-color--code-blue-text', value: '#9ccfd8' },
    { property: '--lumi-sys-color--code-pink-text', value: '#ebbcba' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#f6c177' },
    { property: '--lumi-sys-color--code-green-text', value: '#31748f' },
    { property: '--lumi-sys-color--code-red-text', value: '#eb6f92' },
    { property: '--lumi-sys-color--code-purple-text', value: '#c4a7e7' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#ebbcba' },
    { property: '--mat-button-filled-label-text-color', value: '#2e1f1e' },
    { property: '--mat-button-tonal-container-color', value: '#4a3230' },
    { property: '--mat-button-tonal-label-text-color', value: '#ebbcba' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#1f1d2e' },
    { property: '--mat-menu-item-label-text-color', value: '#e0def4' },
    { property: '--mat-menu-item-icon-color', value: '#c4c0e0' },
    { property: '--mat-menu-divider-color', value: '#524f67' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.35), 0px 2px 6px rgba(0,0,0,0.25)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#e0def4' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#c4c0e0' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#c4c0e0' },
    { property: '--mat-list-active-indicator-color', value: '#4a3230' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#4a3230' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#ebbcba' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.3)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.35)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.4)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#4a3230' },
    { property: '--bard-color-processing-animation-color-2', value: '#1f1d2e' },
  ],
  sidebarVariables: [
    { property: '--background', value: '22 20 31' },          // #16141f
    { property: '--foreground', value: '224 222 244' },       // #e0def4
    { property: '--card', value: '31 29 46' },                // #1f1d2e
    { property: '--card-foreground', value: '224 222 244' },
    { property: '--popover', value: '31 29 46' },
    { property: '--popover-foreground', value: '224 222 244' },
    { property: '--primary', value: '235 188 186' },          // #ebbcba
    { property: '--primary-foreground', value: '46 31 30' },
    { property: '--secondary', value: '38 35 58' },           // #26233a
    { property: '--secondary-foreground', value: '196 192 224' },
    { property: '--muted', value: '38 35 58' },
    { property: '--muted-foreground', value: '110 106 134' }, // #6e6a86
    { property: '--accent', value: '74 50 48' },              // #4a3230
    { property: '--accent-foreground', value: '235 188 186' },
    { property: '--destructive', value: '235 111 146' },      // #eb6f92
    { property: '--destructive-foreground', value: '224 222 244' },
    { property: '--border', value: '82 79 103' },             // #524f67
    { property: '--input', value: '64 61 82' },               // #403d52
    { property: '--ring', value: '235 188 186' },
    { property: '--sidebar-icon-color', value: '196 192 224' },
    { property: '--highlight', value: '246 193 119' },          // #f6c177 - warm gold
    { property: '--highlight-foreground', value: '25 23 36' },
    { property: '--success', value: '110 168 127' },            // #6ea87f - muted pine green
    { property: '--success-foreground', value: '25 23 36' },
    { property: '--warning', value: '246 193 119' },            // #f6c177 - gold
    { property: '--warning-foreground', value: '25 23 36' },
    { property: '--font-sans', value: '"Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#4a3230' },
    { property: '--gem-sys-color--on-primary-container', value: '#ebbcba' },
    { property: '--radius', value: '8px' },
  ],
};
