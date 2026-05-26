/**
 * 🧙 魔法卷轴 (The Grimoire / Parchment)
 *
 * 展开古老卷轴，在旅馆里查阅任务日志的感觉。
 * 温暖的做旧米黄色背景，深棕色墨迹文字，暗红色高亮。
 * 经典衬线字体，让每一条 Prompt 都像是在记录魔法咒语。
 */

import type { ThemePreset } from '../types';

export const grimoire: ThemePreset = {
  id: 'grimoire',
  name: 'The Grimoire',
  nameZh: '魔法卷轴',
  description:
    'Ancient parchment aesthetic with warm tones and serif typography',
  descriptionZh: '羊皮纸质感，温暖做旧色调，衬线字体，沉浸式奇幻体验',
  isPremium: true,
  preferredMode: 'light',
  fonts: ['Merriweather:wght@300;400;700', 'Playfair+Display:wght@400;700'],
  extraCss: `
/* Parchment noise texture overlay */
body.bs-theme--grimoire::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

/* Serif font override for main content */
body.bs-theme--grimoire {
  font-family: 'Merriweather', Georgia, 'Times New Roman', serif !important;
}

body.bs-theme--grimoire *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}

/* Headings use display font */
body.bs-theme--grimoire h1,
body.bs-theme--grimoire h2,
body.bs-theme--grimoire h3 {
  font-family: 'Playfair Display', Georgia, serif !important;
}
`,
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#f5f0e8' },
    { property: '--gem-sys-color--surface-bright', value: '#faf7f2' },
    { property: '--gem-sys-color--surface-dim', value: '#e8dfd2' },
    { property: '--gem-sys-color--surface-container', value: '#f0ebe2' },
    {
      property: '--gem-sys-color--surface-container-low',
      value: '#f7f3ec',
    },
    {
      property: '--gem-sys-color--surface-container-high',
      value: '#ebe5da',
    },
    {
      property: '--gem-sys-color--surface-container-highest',
      value: '#ddd6c8',
    },
    {
      property: '--gem-sys-color--surface-container-lowest',
      value: '#fdfbf7',
    },
    { property: '--gem-sys-color--surface-variant', value: '#e8e0d4' },
    { property: '--mat-app-background-color', value: '#f5f0e8' },
    { property: '--lumi-sys-color--surface', value: '#f5f0e8' },
    { property: '--lumi-sys-color--surface-bright', value: '#faf7f2' },
    { property: '--lumi-sys-color--surface-dim', value: '#e8dfd2' },
    {
      property: '--bard-color-synthetic--chat-window-surface',
      value: '#f5f0e8',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container',
      value: '#f0ebe2',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container-highest',
      value: '#ddd6c8',
    },
    { property: '--bard-color-sidenav-background-desktop', value: '#ebe5da' },
    { property: '--bard-color-sidenav-background-mobile', value: '#f0ebe2' },

    // ─── Text / On-Surface ──────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#3b2f20' },
    { property: '--gem-sys-color--on-surface-variant', value: '#5c4a38' },
    { property: '--gem-sys-color--on-surface-low', value: '#8b7355' },
    { property: '--mat-app-text-color', value: '#3b2f20' },
    { property: '--lumi-sys-color--on-surface', value: '#3b2f20' },
    {
      property: '--bard-color-form-field-placeholder',
      value: '#8b7355',
    },

    // ─── Primary (暗红色 / Crimson Ink) ─────────────────────────────
    { property: '--gem-sys-color--primary', value: '#8b2020' },
    { property: '--gem-sys-color--on-primary', value: '#fff8f0' },
    { property: '--gem-sys-color--primary-container', value: '#f5d5c8' },
    {
      property: '--gem-sys-color--on-primary-container',
      value: '#5c1010',
    },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#d4a090' },
    { property: '--mat-focus-indicator-border-color', value: '#8b2020' },
    {
      property: '--mat-progress-spinner-active-indicator-color',
      value: '#8b2020',
    },

    // ─── Secondary (复古金 / Antique Gold) ──────────────────────────
    { property: '--gem-sys-color--secondary', value: '#8b6914' },
    { property: '--gem-sys-color--on-secondary', value: '#fff8e8' },
    { property: '--gem-sys-color--secondary-container', value: '#f5e6b8' },
    {
      property: '--gem-sys-color--on-secondary-container',
      value: '#5c4400',
    },
    { property: '--gem-sys-color--tertiary-container', value: '#e8dcc0' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#a89070' },
    { property: '--gem-sys-color--outline-variant', value: '#d4c4a8' },
    { property: '--gem-sys-color--outline-low', value: '#e0d4c0' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#3b2f20' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#f5f0e8' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#8b1a1a' },

    // ─── Brand Gradient (ink colors) ────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#8b2020' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#6b3a8b' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#8b6914' },

    // ─── Code Block (aged parchment code) ───────────────────────────
    { property: '--bard-color-code-comment', value: '#8b7355' },
    { property: '--bard-color-code-variables', value: '#8b2020' },
    { property: '--bard-color-code-literal', value: '#8b5e14' },
    { property: '--bard-color-code-class', value: '#6b5000' },
    { property: '--bard-color-code-string', value: '#2d6b3a' },
    { property: '--bard-color-code-quotes-and-meta', value: '#3a5c8b' },
    { property: '--bard-color-code-keyword', value: '#6b3a8b' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#8b2020' },
    { property: '--mat-button-filled-label-text-color', value: '#fff8f0' },
    { property: '--mat-button-tonal-container-color', value: '#f5e6b8' },
    { property: '--mat-button-tonal-label-text-color', value: '#5c4400' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#f0ebe2' },
    { property: '--mat-menu-item-label-text-color', value: '#3b2f20' },
    { property: '--mat-menu-item-icon-color', value: '#5c4a38' },
    { property: '--mat-menu-divider-color', value: '#e0d4c0' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#3b2f20' },
    {
      property: '--mat-list-list-item-supporting-text-color',
      value: '#5c4a38',
    },
    {
      property: '--mat-list-list-item-leading-icon-color',
      value: '#5c4a38',
    },
    { property: '--mat-list-active-indicator-color', value: '#f5e6b8' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    {
      property: '--bard-color-zero-state-prompt-chip-background',
      value: '#f5e6b8',
    },
    {
      property: '--bard-color-zero-state-prompt-chip-text',
      value: '#5c4400',
    },

    // ─── Font override via CSS variable ─────────────────────────────
    {
      property: '--mat-menu-item-label-text-font',
      value: '"Merriweather", Georgia, serif',
    },
    {
      property: '--mat-list-list-item-label-text-font',
      value: '"Merriweather", Georgia, serif',
    },
    {
      property: '--mat-list-list-item-supporting-text-font',
      value: '"Merriweather", Georgia, serif',
    },
    {
      property: '--mat-button-text-label-text-font',
      value: '"Merriweather", Georgia, serif',
    },
    {
      property: '--mat-button-filled-label-text-font',
      value: '"Merriweather", Georgia, serif',
    },
  ],
  sidebarVariables: [
    // Parchment tones for sidebar
    { property: '--background', value: '235 229 218' },       // #ebe5da
    { property: '--foreground', value: '59 47 32' },          // #3b2f20
    { property: '--card', value: '245 240 232' },             // #f5f0e8
    { property: '--card-foreground', value: '59 47 32' },
    { property: '--popover', value: '245 240 232' },
    { property: '--popover-foreground', value: '59 47 32' },
    { property: '--primary', value: '139 32 32' },            // #8b2020
    { property: '--primary-foreground', value: '255 248 240' },
    { property: '--secondary', value: '232 224 212' },        // #e8e0d4
    { property: '--secondary-foreground', value: '59 47 32' },
    { property: '--muted', value: '232 224 212' },
    { property: '--muted-foreground', value: '139 115 85' },  // #8b7355
    { property: '--accent', value: '245 230 184' },           // #f5e6b8
    { property: '--accent-foreground', value: '92 68 0' },
    { property: '--destructive', value: '139 26 26' },
    { property: '--destructive-foreground', value: '255 248 240' },
    { property: '--border', value: '212 196 168' },           // #d4c4a8
    { property: '--input', value: '224 212 192' },            // #e0d4c0
    { property: '--ring', value: '139 32 32' },
    { property: '--sidebar-icon-color', value: '92 74 56' },  // #5c4a38
    { property: '--font-sans', value: '"Merriweather", Georgia, "Times New Roman", serif' },
    { property: '--gem-sys-color--primary-container', value: '#f5d5c8' },
    { property: '--gem-sys-color--on-primary-container', value: '#5c1010' },
  ],
};
