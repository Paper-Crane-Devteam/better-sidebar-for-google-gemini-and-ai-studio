/**
 * ✒️ 纸与墨 (Paper & Ink)
 *
 * 极致专注的阅读与写作体验。
 * 纯白微暖的纸张底色搭配深黑墨色文字，
 * 没有多余装饰，让内容本身成为焦点。
 * 使用 Literata 优雅衬线字体，适合长文阅读。
 */

import type { ThemePreset } from '../types';

export const paperInk: ThemePreset = {
  id: 'paper-ink',
  name: 'Paper & Ink',
  description:
    'Minimal reading-focused theme with warm paper tones and elegant serif typography',
  isPremium: true,
  preferredMode: 'light',
  // reading theme — the glow should be barely there
  lmGlow: { intensity: 0.25, blur: '150px' },
  fonts: ['Literata:wght@300;400;500;600;700', 'Source+Serif+4:wght@300;400;600'],
  extraCss: `
/* Paper texture — very subtle grain */
body.bs-theme--paper-ink::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

/* Refined paragraph spacing */
body.bs-theme--paper-ink p,
body.bs-theme--paper-ink .message-content {
  line-height: 1.75;
  letter-spacing: 0.01em;
}
`,
  fontCss: `
/* Elegant serif font */
body.bs-fonts--paper-ink {
  font-family: 'Literata', 'Source Serif 4', 'Georgia', 'Noto Serif SC', 'Source Han Serif SC', serif !important;
}

body.bs-fonts--paper-ink *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Literata", "Source Serif 4", Georgia, serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Literata", "Source Serif 4", Georgia, serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Literata", "Source Serif 4", Georgia, serif' },
    { property: '--mat-button-text-label-text-font', value: '"Literata", "Source Serif 4", Georgia, serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Literata", "Source Serif 4", Georgia, serif' },
  ],
  variables: [
    // ─── Surface / Background (Warm White Paper) ────────────────────
    { property: '--gem-sys-color--surface', value: '#faf9f6' },
    { property: '--gem-sys-color--surface-bright', value: '#ffffff' },
    { property: '--gem-sys-color--surface-dim', value: '#f0eeea' },
    { property: '--gem-sys-color--surface-container', value: '#f5f4f0' },
    { property: '--gem-sys-color--surface-container-low', value: '#f8f7f4' },
    { property: '--gem-sys-color--surface-container-high', value: '#eceae6' },
    { property: '--gem-sys-color--surface-container-highest', value: '#e4e2de' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#ffffff' },
    { property: '--gem-sys-color--surface-variant', value: '#f0eee8' },
    { property: '--mat-app-background-color', value: '#faf9f6' },
    { property: '--lumi-sys-color--surface', value: '#faf9f6' },
    { property: '--lumi-sys-color--surface-bright', value: '#ffffff' },
    { property: '--lumi-sys-color--surface-dim', value: '#f0eeea' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#faf9f6' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#f5f4f0' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#e4e2de' },
    { property: '--bard-color-sidenav-background-desktop', value: '#f5f4f0' },
    { property: '--bard-color-sidenav-background-mobile', value: '#f8f7f4' },

    // ─── Text (Deep Ink Black) ──────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#1a1a1a' },
    { property: '--gem-sys-color--on-surface-variant', value: '#3d3d3d' },
    { property: '--gem-sys-color--on-surface-low', value: '#8a8a8a' },
    { property: '--mat-app-text-color', value: '#1a1a1a' },
    { property: '--lumi-sys-color--on-surface', value: '#1a1a1a' },
    { property: '--bard-color-form-field-placeholder', value: '#8a8a8a' },

    // ─── Primary (Deep Indigo Ink) ──────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#2c3e6b' },
    { property: '--gem-sys-color--on-primary', value: '#ffffff' },
    { property: '--gem-sys-color--primary-container', value: '#e8ecf4' },
    { property: '--gem-sys-color--on-primary-container', value: '#1a2540' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#7a8db8' },
    { property: '--mat-focus-indicator-border-color', value: '#2c3e6b' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#2c3e6b' },

    // ─── Secondary (Warm Charcoal) ──────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#5a5a5a' },
    { property: '--gem-sys-color--on-secondary', value: '#ffffff' },
    { property: '--gem-sys-color--secondary-container', value: '#ebebeb' },
    { property: '--gem-sys-color--on-secondary-container', value: '#2a2a2a' },
    { property: '--gem-sys-color--tertiary-container', value: '#f0f0f0' },

    // ─── Outline / Border (Subtle pencil lines) ─────────────────────
    { property: '--gem-sys-color--outline', value: '#d4d2ce' },
    { property: '--gem-sys-color--outline-variant', value: '#e8e6e2' },
    { property: '--gem-sys-color--outline-low', value: '#f0eeea' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#1a1a1a' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#faf9f6' },

    // ─── Error (Ink Red) ────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#a02020' },

    // ─── Brand Gradient (subtle ink tones) ──────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#2c3e6b' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#4a3060' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#1a5050' },

    // ─── Code Block (muted tones) ───────────────────────────────────
    { property: '--bard-color-code-comment', value: '#8a8a8a' },
    { property: '--bard-color-code-variables', value: '#a02020' },
    { property: '--bard-color-code-literal', value: '#8b5e14' },
    { property: '--bard-color-code-class', value: '#2c3e6b' },
    { property: '--bard-color-code-string', value: '#2a6b3a' },
    { property: '--bard-color-code-quotes-and-meta', value: '#4a6090' },
    { property: '--bard-color-code-keyword', value: '#6b3a8b' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#2c3e6b' },
    { property: '--mat-button-filled-label-text-color', value: '#ffffff' },
    { property: '--mat-button-tonal-container-color', value: '#e8ecf4' },
    { property: '--mat-button-tonal-label-text-color', value: '#1a2540' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#faf9f6' },
    { property: '--mat-menu-item-label-text-color', value: '#1a1a1a' },
    { property: '--mat-menu-item-icon-color', value: '#3d3d3d' },
    { property: '--mat-menu-divider-color', value: '#e8e6e2' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.06), 0px 1px 4px rgba(0,0,0,0.04)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#1a1a1a' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#3d3d3d' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#3d3d3d' },
    { property: '--mat-list-active-indicator-color', value: '#e8ecf4' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#e8ecf4' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#2c3e6b' },

  ],
  sidebarVariables: [
    { property: '--background', value: '245 244 240' },       // #f5f4f0
    { property: '--foreground', value: '26 26 26' },          // #1a1a1a
    { property: '--card', value: '250 249 246' },             // #faf9f6
    { property: '--card-foreground', value: '26 26 26' },
    { property: '--popover', value: '250 249 246' },
    { property: '--popover-foreground', value: '26 26 26' },
    { property: '--primary', value: '44 62 107' },            // #2c3e6b
    { property: '--primary-foreground', value: '255 255 255' },
    { property: '--secondary', value: '235 235 235' },        // #ebebeb
    { property: '--secondary-foreground', value: '42 42 42' },
    { property: '--muted', value: '240 238 234' },            // #f0eeea
    { property: '--muted-foreground', value: '138 138 138' }, // #8a8a8a
    { property: '--accent', value: '232 236 244' },           // #e8ecf4
    { property: '--accent-foreground', value: '26 37 64' },
    { property: '--destructive', value: '160 32 32' },        // #a02020
    { property: '--destructive-foreground', value: '255 255 255' },
    { property: '--border', value: '212 210 206' },           // #d4d2ce
    { property: '--input', value: '232 230 226' },            // #e8e6e2
    { property: '--ring', value: '44 62 107' },
    { property: '--sidebar-icon-color', value: '61 61 61' },  // #3d3d3d
    { property: '--highlight', value: '183 110 44' },           // #b76e2c - sepia brown
    { property: '--highlight-foreground', value: '255 255 255' },
    { property: '--success', value: '63 107 63' },              // #3f6b3f - muted ink green
    { property: '--success-foreground', value: '255 255 255' },
    { property: '--warning', value: '138 106 31' },             // #8a6a1f - sepia ochre
    { property: '--warning-foreground', value: '255 255 255' },
    { property: '--font-sans', value: '"Literata", "Source Serif 4", Georgia, "Noto Serif SC", "Source Han Serif SC", serif' },
    { property: '--gem-sys-color--primary-container', value: '#e8ecf4' },
    { property: '--gem-sys-color--on-primary-container', value: '#1a2540' },
    { property: '--radius', value: '6px' },
  ],
};
