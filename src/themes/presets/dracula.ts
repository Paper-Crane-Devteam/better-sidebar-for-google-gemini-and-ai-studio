/**
 * 🧛 德古拉 (Dracula)
 *
 * 经典暗色主题，以鲜艳的紫色、绿色和粉色为点缀，
 * 深灰蓝底色搭配高对比度的彩色 accent，
 * 适合长时间编码的流行配色方案。
 * 使用 Fira Code 等宽字体。
 */

import type { ThemePreset } from '../types';

export const dracula: ThemePreset = {
  id: 'dracula',
  name: 'Dracula',
  description:
    'Classic dark theme with vibrant purple, green and pink accents',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['Fira+Code:wght@300;400;500;600'],
  fontMono: `'Fira Code', 'JetBrains Mono', 'SF Mono', monospace`,
  fontCss: `
/* Dracula monospace font override */
body.bs-fonts--dracula {
  font-family: 'Fira Code', 'SF Mono', 'Cascadia Code', monospace !important;
}

body.bs-fonts--dracula *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Fira Code", "SF Mono", "Cascadia Code", monospace' },
    { property: '--mat-list-list-item-label-text-font', value: '"Fira Code", "SF Mono", "Cascadia Code", monospace' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Fira Code", "SF Mono", "Cascadia Code", monospace' },
    { property: '--mat-button-text-label-text-font', value: '"Fira Code", "SF Mono", "Cascadia Code", monospace' },
    { property: '--mat-button-filled-label-text-font', value: '"Fira Code", "SF Mono", "Cascadia Code", monospace' },
  ],
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#282a36' },
    { property: '--gem-sys-color--surface-bright', value: '#44475a' },
    { property: '--gem-sys-color--surface-dim', value: '#21222c' },
    { property: '--gem-sys-color--surface-container', value: '#343746' },
    { property: '--gem-sys-color--surface-container-low', value: '#282a36' },
    { property: '--gem-sys-color--surface-container-high', value: '#44475a' },
    { property: '--gem-sys-color--surface-container-highest', value: '#4f5267' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#21222c' },
    { property: '--gem-sys-color--surface-variant', value: '#44475a' },
    { property: '--mat-app-background-color', value: '#282a36' },
    { property: '--lumi-sys-color--surface', value: '#282a36' },
    { property: '--lumi-sys-color--surface-bright', value: '#44475a' },
    { property: '--lumi-sys-color--surface-dim', value: '#21222c' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#282a36' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#343746' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#4f5267' },
    { property: '--bard-color-sidenav-background-desktop', value: '#242530' },
    { property: '--bard-color-sidenav-background-mobile', value: '#282a36' },

    // ─── Text ───────────────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#f8f8f2' },
    { property: '--gem-sys-color--on-surface-variant', value: '#e0e0d8' },
    { property: '--gem-sys-color--on-surface-low', value: '#6272a4' },
    { property: '--mat-app-text-color', value: '#f8f8f2' },
    { property: '--lumi-sys-color--on-surface', value: '#f8f8f2' },
    { property: '--bard-color-form-field-placeholder', value: '#6272a4' },

    // ─── Primary ────────────────────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#bd93f9' },
    { property: '--gem-sys-color--on-primary', value: '#1e1630' },
    { property: '--gem-sys-color--primary-container', value: '#44305e' },
    { property: '--gem-sys-color--on-primary-container', value: '#bd93f9' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#9b6fd6' },
    { property: '--mat-focus-indicator-border-color', value: '#bd93f9' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#bd93f9' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#50fa7b' },
    { property: '--gem-sys-color--on-secondary', value: '#0e2e16' },
    { property: '--gem-sys-color--secondary-container', value: '#1e5a30' },
    { property: '--gem-sys-color--on-secondary-container', value: '#50fa7b' },
    { property: '--gem-sys-color--tertiary-container', value: '#44475a' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#6272a4' },
    { property: '--gem-sys-color--outline-variant', value: '#525672' },
    { property: '--gem-sys-color--outline-low', value: '#44475a' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#f8f8f2' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#282a36' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#ff5555' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#bd93f9' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#ff79c6' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#8be9fd' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#6272a4' },
    { property: '--bard-color-code-variables', value: '#f8f8f2' },
    { property: '--bard-color-code-literal', value: '#bd93f9' },
    { property: '--bard-color-code-class', value: '#8be9fd' },
    { property: '--bard-color-code-string', value: '#f1fa8c' },
    { property: '--bard-color-code-quotes-and-meta', value: '#8be9fd' },
    { property: '--bard-color-code-keyword', value: '#ff79c6' },
    { property: '--lumi-sys-color--code-background', value: '#21222c' },
    { property: '--lumi-sys-color--code-primary-text', value: '#f8f8f2' },
    { property: '--lumi-sys-color--code-grey-text', value: '#6272a4' },
    { property: '--lumi-sys-color--code-blue-text', value: '#8be9fd' },
    { property: '--lumi-sys-color--code-pink-text', value: '#ff79c6' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#f1fa8c' },
    { property: '--lumi-sys-color--code-green-text', value: '#50fa7b' },
    { property: '--lumi-sys-color--code-red-text', value: '#ff5555' },
    { property: '--lumi-sys-color--code-purple-text', value: '#bd93f9' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#bd93f9' },
    { property: '--mat-button-filled-label-text-color', value: '#1e1630' },
    { property: '--mat-button-tonal-container-color', value: '#44305e' },
    { property: '--mat-button-tonal-label-text-color', value: '#bd93f9' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#343746' },
    { property: '--mat-menu-item-label-text-color', value: '#f8f8f2' },
    { property: '--mat-menu-item-icon-color', value: '#e0e0d8' },
    { property: '--mat-menu-divider-color', value: '#6272a4' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.35), 0px 2px 6px rgba(0,0,0,0.25)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#f8f8f2' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#e0e0d8' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#e0e0d8' },
    { property: '--mat-list-active-indicator-color', value: '#44305e' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#44305e' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#bd93f9' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.3)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.35)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.4)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#44305e' },
    { property: '--bard-color-processing-animation-color-2', value: '#343746' },
  ],
  sidebarVariables: [
    { property: '--background', value: '36 37 48' },          // #242530
    { property: '--foreground', value: '248 248 242' },       // #f8f8f2
    { property: '--card', value: '52 55 70' },                // #343746
    { property: '--card-foreground', value: '248 248 242' },
    { property: '--popover', value: '52 55 70' },
    { property: '--popover-foreground', value: '248 248 242' },
    { property: '--primary', value: '189 147 249' },          // #bd93f9
    { property: '--primary-foreground', value: '30 22 48' },
    { property: '--secondary', value: '68 71 90' },           // #44475a
    { property: '--secondary-foreground', value: '224 224 216' },
    { property: '--muted', value: '68 71 90' },
    { property: '--muted-foreground', value: '98 114 164' },  // #6272a4
    { property: '--accent', value: '68 48 94' },              // #44305e
    { property: '--accent-foreground', value: '189 147 249' },
    { property: '--destructive', value: '255 85 85' },        // #ff5555
    { property: '--destructive-foreground', value: '248 248 242' },
    { property: '--border', value: '98 114 164' },            // #6272a4
    { property: '--input', value: '82 86 114' },              // #525672
    { property: '--ring', value: '189 147 249' },
    { property: '--sidebar-icon-color', value: '224 224 216' },
    { property: '--highlight', value: '80 250 123' },           // #50fa7b - green
    { property: '--highlight-foreground', value: '40 42 54' },
    { property: '--success', value: '80 250 123' },             // #50fa7b - green
    { property: '--success-foreground', value: '40 42 54' },
    { property: '--warning', value: '241 250 140' },            // #f1fa8c - yellow
    { property: '--warning-foreground', value: '40 42 54' },
    { property: '--font-sans', value: '"Fira Code", "SF Mono", "Cascadia Code", monospace' },
    { property: '--gem-sys-color--primary-container', value: '#44305e' },
    { property: '--gem-sys-color--on-primary-container', value: '#bd93f9' },
    { property: '--radius', value: '8px' },
  ],
};
