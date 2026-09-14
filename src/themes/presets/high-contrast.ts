/**
 * ◐ 高对比 (High Contrast)
 *
 * 纯黑底 + 纯白字 + 单一琥珀色强调，正文对比度按 WCAG AAA（7:1）压。
 * 和赛博霓虹的区别：后者是近黑底上撒多种高饱和色，这个是克制的双色。
 * 强调色选琥珀黄与青色而非红绿配对，是为了让常见色觉障碍也能区分。
 * 使用 Atkinson Hyperlegible —— 这个字体本身就是为低视力阅读设计的。
 *
 * 注意：这是唯一一个刻意把 outline-low 拉高的主题。其他主题的
 * outline-low 要求「安静」（AI Studio 的区域分割线从它取值），
 * 这里则相反，分割线必须看得见。
 */

import type { ThemePreset } from '../types';

export const highContrast: ThemePreset = {
  id: 'high-contrast',
  name: 'High Contrast',
  description:
    'Pure black and white with a single amber accent, tuned for WCAG AAA text contrast',
  isPremium: true,
  preferredMode: 'dark',
  // a blurred haze is the opposite of what this theme is for
  lmGlow: 'off',
  fonts: ['Atkinson+Hyperlegible:wght@400;700'],
  extraCss: `
/* Always-visible focus ring — the whole point of a high contrast theme */
body.bs-theme--high-contrast *:focus-visible {
  outline: 3px solid #ffd400 !important;
  outline-offset: 2px !important;
}

/* Keep link text underlined so colour is never the only signal */
body.bs-theme--high-contrast a:not([class*="button"]):not([class*="btn"]) {
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}
`,
  fontCss: `
/* Atkinson Hyperlegible — designed for low vision readers */
body.bs-fonts--high-contrast {
  font-family: 'Atkinson Hyperlegible', 'Inter', 'Microsoft YaHei', 'PingFang SC', sans-serif !important;
}

body.bs-fonts--high-contrast *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Atkinson Hyperlegible", "Inter", sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Atkinson Hyperlegible", "Inter", sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Atkinson Hyperlegible", "Inter", sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Atkinson Hyperlegible", "Inter", sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Atkinson Hyperlegible", "Inter", sans-serif' },
  ],
  variables: [
    // ─── Surface / Background (True Black) ──────────────────────────
    { property: '--gem-sys-color--surface', value: '#000000' },
    { property: '--gem-sys-color--surface-bright', value: '#1a1a1a' },
    { property: '--gem-sys-color--surface-dim', value: '#000000' },
    { property: '--gem-sys-color--surface-container', value: '#121212' },
    { property: '--gem-sys-color--surface-container-low', value: '#0a0a0a' },
    { property: '--gem-sys-color--surface-container-high', value: '#1a1a1a' },
    { property: '--gem-sys-color--surface-container-highest', value: '#262626' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#000000' },
    { property: '--gem-sys-color--surface-variant', value: '#1a1a1a' },
    { property: '--mat-app-background-color', value: '#000000' },
    { property: '--lumi-sys-color--surface', value: '#000000' },
    { property: '--lumi-sys-color--surface-bright', value: '#1a1a1a' },
    { property: '--lumi-sys-color--surface-dim', value: '#000000' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#000000' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#121212' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#262626' },
    { property: '--bard-color-sidenav-background-desktop', value: '#000000' },
    { property: '--bard-color-sidenav-background-mobile', value: '#000000' },

    // ─── Text (Pure White, muted step still AAA at 7.4:1) ───────────
    { property: '--gem-sys-color--on-surface', value: '#ffffff' },
    { property: '--gem-sys-color--on-surface-variant', value: '#e6e6e6' },
    { property: '--gem-sys-color--on-surface-low', value: '#b3b3b3' },
    { property: '--mat-app-text-color', value: '#ffffff' },
    { property: '--lumi-sys-color--on-surface', value: '#ffffff' },
    { property: '--bard-color-form-field-placeholder', value: '#b3b3b3' },

    // ─── Primary (High-Vis Amber, 15:1 on black) ────────────────────
    { property: '--gem-sys-color--primary', value: '#ffd400' },
    { property: '--gem-sys-color--on-primary', value: '#000000' },
    { property: '--gem-sys-color--primary-container', value: '#3d3200' },
    { property: '--gem-sys-color--on-primary-container', value: '#ffd400' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#d9b400' },
    { property: '--mat-focus-indicator-border-color', value: '#ffd400' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#ffd400' },

    // ─── Secondary (Cyan — distinguishable from amber under CVD) ────
    { property: '--gem-sys-color--secondary', value: '#00e5ff' },
    { property: '--gem-sys-color--on-secondary', value: '#000000' },
    { property: '--gem-sys-color--secondary-container', value: '#003d45' },
    { property: '--gem-sys-color--on-secondary-container', value: '#00e5ff' },
    { property: '--gem-sys-color--tertiary-container', value: '#1a1a1a' },

    // ─── Outline / Border (deliberately visible) ────────────────────
    { property: '--gem-sys-color--outline', value: '#8a8a8a' },
    { property: '--gem-sys-color--outline-variant', value: '#5c5c5c' },
    { property: '--gem-sys-color--outline-low', value: '#3d3d3d' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#ffffff' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#000000' },

    // ─── Error (7.5:1 on black) ─────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#ff7b7b' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#ffd400' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#00e5ff' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#ffffff' },

    // ─── Code Block (every token kept above 7:1 on black) ───────────
    { property: '--bard-color-code-comment', value: '#b3b3b3' },
    { property: '--bard-color-code-variables', value: '#00e5ff' },
    { property: '--bard-color-code-literal', value: '#ffb3ff' },
    { property: '--bard-color-code-class', value: '#ffd400' },
    { property: '--bard-color-code-string', value: '#7cff7c' },
    { property: '--bard-color-code-quotes-and-meta', value: '#a3d5ff' },
    { property: '--bard-color-code-keyword', value: '#ff7b7b' },
    { property: '--lumi-sys-color--code-background', value: '#0a0a0a' },
    { property: '--lumi-sys-color--code-primary-text', value: '#ffffff' },
    { property: '--lumi-sys-color--code-grey-text', value: '#b3b3b3' },
    { property: '--lumi-sys-color--code-blue-text', value: '#a3d5ff' },
    { property: '--lumi-sys-color--code-pink-text', value: '#ffb3ff' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#ffd400' },
    { property: '--lumi-sys-color--code-green-text', value: '#7cff7c' },
    { property: '--lumi-sys-color--code-red-text', value: '#ff7b7b' },
    { property: '--lumi-sys-color--code-purple-text', value: '#ffb3ff' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#ffd400' },
    { property: '--mat-button-filled-label-text-color', value: '#000000' },
    { property: '--mat-button-tonal-container-color', value: '#3d3200' },
    { property: '--mat-button-tonal-label-text-color', value: '#ffd400' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#121212' },
    { property: '--mat-menu-item-label-text-color', value: '#ffffff' },
    { property: '--mat-menu-item-icon-color', value: '#e6e6e6' },
    { property: '--mat-menu-divider-color', value: '#5c5c5c' },
    // Crisp ring instead of a soft blur — a diffuse shadow is invisible on pure black
    { property: '--mat-menu-container-elevation-shadow', value: '0 0 0 1px #5c5c5c, 0px 6px 20px rgba(0,0,0,0.9)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#ffffff' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#e6e6e6' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#e6e6e6' },
    { property: '--mat-list-active-indicator-color', value: '#3d3200' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#3d3200' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#ffd400' },

    // ─── Shadows (rings, not blurs) ─────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0 0 0 1px #3d3d3d' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0 0 0 1px #5c5c5c' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0 0 0 1px #8a8a8a' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#3d3200' },
    { property: '--bard-color-processing-animation-color-2', value: '#121212' },
  ],
  sidebarVariables: [
    { property: '--background', value: '0 0 0' },              // #000000
    { property: '--foreground', value: '255 255 255' },
    { property: '--card', value: '18 18 18' },                 // #121212
    { property: '--card-foreground', value: '255 255 255' },
    { property: '--popover', value: '18 18 18' },
    { property: '--popover-foreground', value: '255 255 255' },
    { property: '--primary', value: '255 212 0' },             // #ffd400
    { property: '--primary-foreground', value: '0 0 0' },
    { property: '--secondary', value: '38 38 38' },            // #262626
    { property: '--secondary-foreground', value: '255 255 255' },
    { property: '--muted', value: '26 26 26' },                // #1a1a1a
    { property: '--muted-foreground', value: '179 179 179' },  // #b3b3b3 — 7.4:1 on black
    { property: '--accent', value: '61 50 0' },                // #3d3200
    { property: '--accent-foreground', value: '255 212 0' },
    { property: '--destructive', value: '255 123 123' },       // #ff7b7b
    { property: '--destructive-foreground', value: '0 0 0' },
    { property: '--border', value: '138 138 138' },            // #8a8a8a
    { property: '--input', value: '92 92 92' },                // #5c5c5c
    { property: '--ring', value: '255 212 0' },
    { property: '--sidebar-icon-color', value: '230 230 230' },
    { property: '--highlight', value: '0 229 255' },            // #00e5ff - cyan
    { property: '--highlight-foreground', value: '0 0 0' },
    { property: '--success', value: '124 255 124' },            // #7cff7c
    { property: '--success-foreground', value: '0 0 0' },
    { property: '--warning', value: '255 212 0' },              // #ffd400
    { property: '--warning-foreground', value: '0 0 0' },
    { property: '--font-sans', value: '"Atkinson Hyperlegible", "Inter", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#3d3200' },
    { property: '--gem-sys-color--on-primary-container', value: '#ffd400' },
    { property: '--radius', value: '4px' },
  ],
};
