/**
 * 🌅 日蚀 (Solarized)
 *
 * 经典 Solarized Dark 配色方案，
 * 以深蓝绿底色搭配青色和黄色 accent，
 * 温暖与冷调平衡，适合长时间阅读和编码。
 * 使用 Inconsolata 等宽字体。
 */

import type { ThemePreset } from '../types';

export const solarized: ThemePreset = {
  id: 'solarized',
  name: 'Solarized',
  description:
    'Classic Solarized Dark palette with balanced warm and cool tones',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['Inconsolata:wght@300;400;500;600;700'],
  fontMono: `'Inconsolata', 'SF Mono', Menlo, monospace`,
  fontCss: `
/* Monospace font override with Inconsolata */
body.bs-fonts--solarized {
  font-family: 'Inconsolata', 'SF Mono', 'Fira Code', monospace !important;
}

body.bs-fonts--solarized *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Inconsolata", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-list-list-item-label-text-font', value: '"Inconsolata", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Inconsolata", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-button-text-label-text-font', value: '"Inconsolata", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-button-filled-label-text-font', value: '"Inconsolata", "SF Mono", "Fira Code", monospace' },
  ],
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#002b36' },
    { property: '--gem-sys-color--surface-bright', value: '#073642' },
    { property: '--gem-sys-color--surface-dim', value: '#001f27' },
    { property: '--gem-sys-color--surface-container', value: '#073642' },
    { property: '--gem-sys-color--surface-container-low', value: '#002b36' },
    { property: '--gem-sys-color--surface-container-high', value: '#0a4050' },
    { property: '--gem-sys-color--surface-container-highest', value: '#134b5a' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#001f27' },
    { property: '--gem-sys-color--surface-variant', value: '#073642' },
    { property: '--mat-app-background-color', value: '#002b36' },
    { property: '--lumi-sys-color--surface', value: '#002b36' },
    { property: '--lumi-sys-color--surface-bright', value: '#073642' },
    { property: '--lumi-sys-color--surface-dim', value: '#001f27' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#002b36' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#073642' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#134b5a' },
    { property: '--bard-color-sidenav-background-desktop', value: '#00252f' },
    { property: '--bard-color-sidenav-background-mobile', value: '#002b36' },

    // ─── Text ───────────────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#839496' },
    { property: '--gem-sys-color--on-surface-variant', value: '#93a1a1' },
    { property: '--gem-sys-color--on-surface-low', value: '#586e75' },
    { property: '--mat-app-text-color', value: '#839496' },
    { property: '--lumi-sys-color--on-surface', value: '#839496' },
    { property: '--bard-color-form-field-placeholder', value: '#586e75' },

    // ─── Primary ────────────────────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#2aa198' },
    { property: '--gem-sys-color--on-primary', value: '#001f1d' },
    { property: '--gem-sys-color--primary-container', value: '#0a4a46' },
    { property: '--gem-sys-color--on-primary-container', value: '#2aa198' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#1f7a73' },
    { property: '--mat-focus-indicator-border-color', value: '#2aa198' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#2aa198' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#b58900' },
    { property: '--gem-sys-color--on-secondary', value: '#2e2200' },
    { property: '--gem-sys-color--secondary-container', value: '#4a3600' },
    { property: '--gem-sys-color--on-secondary-container', value: '#b58900' },
    { property: '--gem-sys-color--tertiary-container', value: '#073642' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#586e75' },
    { property: '--gem-sys-color--outline-variant', value: '#475b62' },
    { property: '--gem-sys-color--outline-low', value: '#073642' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#fdf6e3' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#002b36' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#dc322f' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#2aa198' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#268bd2' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#b58900' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#586e75' },
    { property: '--bard-color-code-variables', value: '#268bd2' },
    { property: '--bard-color-code-literal', value: '#2aa198' },
    { property: '--bard-color-code-class', value: '#b58900' },
    { property: '--bard-color-code-string', value: '#859900' },
    { property: '--bard-color-code-quotes-and-meta', value: '#2aa198' },
    { property: '--bard-color-code-keyword', value: '#cb4b16' },
    { property: '--lumi-sys-color--code-background', value: '#001f27' },
    { property: '--lumi-sys-color--code-primary-text', value: '#839496' },
    { property: '--lumi-sys-color--code-grey-text', value: '#586e75' },
    { property: '--lumi-sys-color--code-blue-text', value: '#268bd2' },
    { property: '--lumi-sys-color--code-pink-text', value: '#d33682' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#b58900' },
    { property: '--lumi-sys-color--code-green-text', value: '#859900' },
    { property: '--lumi-sys-color--code-red-text', value: '#dc322f' },
    { property: '--lumi-sys-color--code-purple-text', value: '#6c71c4' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#2aa198' },
    { property: '--mat-button-filled-label-text-color', value: '#001f1d' },
    { property: '--mat-button-tonal-container-color', value: '#0a4a46' },
    { property: '--mat-button-tonal-label-text-color', value: '#2aa198' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#073642' },
    { property: '--mat-menu-item-label-text-color', value: '#839496' },
    { property: '--mat-menu-item-icon-color', value: '#93a1a1' },
    { property: '--mat-menu-divider-color', value: '#586e75' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.4), 0px 2px 6px rgba(0,0,0,0.3)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#839496' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#93a1a1' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#93a1a1' },
    { property: '--mat-list-active-indicator-color', value: '#0a4a46' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#0a4a46' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#2aa198' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.3)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.35)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.4)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#0a4a46' },
    { property: '--bard-color-processing-animation-color-2', value: '#073642' },
  ],
  sidebarVariables: [
    { property: '--background', value: '0 37 47' },           // #00252f
    { property: '--foreground', value: '131 148 150' },       // #839496
    { property: '--card', value: '7 54 66' },                 // #073642
    { property: '--card-foreground', value: '131 148 150' },
    { property: '--popover', value: '7 54 66' },
    { property: '--popover-foreground', value: '131 148 150' },
    { property: '--primary', value: '42 161 152' },           // #2aa198
    { property: '--primary-foreground', value: '0 31 29' },
    { property: '--secondary', value: '7 54 66' },            // #073642
    { property: '--secondary-foreground', value: '147 161 161' },
    { property: '--muted', value: '7 54 66' },
    { property: '--muted-foreground', value: '88 110 117' },  // #586e75
    { property: '--accent', value: '10 74 70' },              // #0a4a46
    { property: '--accent-foreground', value: '42 161 152' },
    { property: '--destructive', value: '220 50 47' },        // #dc322f
    { property: '--destructive-foreground', value: '253 246 227' },
    { property: '--border', value: '88 110 117' },            // #586e75
    { property: '--input', value: '71 91 98' },               // #475b62
    { property: '--ring', value: '42 161 152' },
    { property: '--sidebar-icon-color', value: '147 161 161' },
    { property: '--highlight', value: '181 137 0' },            // #b58900 - yellow
    { property: '--highlight-foreground', value: '0 43 54' },
    { property: '--success', value: '133 153 0' },              // #859900 - solarized green
    { property: '--success-foreground', value: '0 43 54' },
    { property: '--warning', value: '181 137 0' },              // #b58900 - solarized yellow
    { property: '--warning-foreground', value: '0 43 54' },
    { property: '--font-sans', value: '"Inconsolata", "SF Mono", "Fira Code", monospace' },
    { property: '--gem-sys-color--primary-container', value: '#0a4a46' },
    { property: '--gem-sys-color--on-primary-container', value: '#2aa198' },
    { property: '--radius', value: '6px' },
  ],
};
