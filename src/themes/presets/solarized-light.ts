/**
 * ☀️ 曝光浅色 (Solarized Light)
 *
 * Solarized 的浅色一半：base3 奶油底配 base01 灰蓝字，
 * 蓝、青、洋红三色点缀，色相环上刻意等距。
 * 和已有的 Solarized 深色成对 —— 认这套配色的人会预期它们同时存在。
 * 使用 Inconsolata，和深色版保持一致的等宽气质。
 */

import type { ThemePreset } from '../types';

export const solarizedLight: ThemePreset = {
  id: 'solarized-light',
  name: 'Solarized Light',
  description:
    'The light half of Solarized — cream base with balanced blue, cyan and magenta accents',
  isPremium: true,
  preferredMode: 'light',
  fonts: ['Inconsolata:wght@300;400;500;600;700'],
  fontMono: `'Inconsolata', 'SF Mono', Menlo, monospace`,
  fontCss: `
/* Solarized Light monospace font override */
body.bs-fonts--solarized-light {
  font-family: 'Inconsolata', 'SF Mono', 'Menlo', monospace !important;
}

body.bs-fonts--solarized-light *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Inconsolata", "SF Mono", Menlo, monospace' },
    { property: '--mat-list-list-item-label-text-font', value: '"Inconsolata", "SF Mono", Menlo, monospace' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Inconsolata", "SF Mono", Menlo, monospace' },
    { property: '--mat-button-text-label-text-font', value: '"Inconsolata", "SF Mono", Menlo, monospace' },
    { property: '--mat-button-filled-label-text-font', value: '"Inconsolata", "SF Mono", Menlo, monospace' },
  ],
  variables: [
    // ─── Surface / Background (base3 / base2) ───────────────────────
    { property: '--gem-sys-color--surface', value: '#fdf6e3' },
    { property: '--gem-sys-color--surface-bright', value: '#fffcf0' },
    { property: '--gem-sys-color--surface-dim', value: '#eee8d5' },
    { property: '--gem-sys-color--surface-container', value: '#f7f0dc' },
    { property: '--gem-sys-color--surface-container-low', value: '#fbf4e0' },
    { property: '--gem-sys-color--surface-container-high', value: '#eee8d5' },
    { property: '--gem-sys-color--surface-container-highest', value: '#e4ddc8' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#fffcf0' },
    { property: '--gem-sys-color--surface-variant', value: '#eee8d5' },
    { property: '--mat-app-background-color', value: '#fdf6e3' },
    { property: '--lumi-sys-color--surface', value: '#fdf6e3' },
    { property: '--lumi-sys-color--surface-bright', value: '#fffcf0' },
    { property: '--lumi-sys-color--surface-dim', value: '#eee8d5' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#fdf6e3' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#f7f0dc' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#e4ddc8' },
    { property: '--bard-color-sidenav-background-desktop', value: '#f2ebd8' },
    { property: '--bard-color-sidenav-background-mobile', value: '#fbf4e0' },

    // ─── Text (base01 emphasized / base00 body / base1 muted) ───────
    { property: '--gem-sys-color--on-surface', value: '#586e75' },
    { property: '--gem-sys-color--on-surface-variant', value: '#657b83' },
    { property: '--gem-sys-color--on-surface-low', value: '#93a1a1' },
    { property: '--mat-app-text-color', value: '#586e75' },
    { property: '--lumi-sys-color--on-surface', value: '#586e75' },
    { property: '--bard-color-form-field-placeholder', value: '#93a1a1' },

    // ─── Primary (Solarized Blue) ───────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#268bd2' },
    { property: '--gem-sys-color--on-primary', value: '#fdf6e3' },
    { property: '--gem-sys-color--primary-container', value: '#dceaf5' },
    { property: '--gem-sys-color--on-primary-container', value: '#0a4a70' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#6ba8d8' },
    { property: '--mat-focus-indicator-border-color', value: '#268bd2' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#268bd2' },

    // ─── Secondary (Solarized Orange) ───────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#cb4b16' },
    { property: '--gem-sys-color--on-secondary', value: '#fdf6e3' },
    { property: '--gem-sys-color--secondary-container', value: '#f7e2d5' },
    { property: '--gem-sys-color--on-secondary-container', value: '#8a3210' },
    { property: '--gem-sys-color--tertiary-container', value: '#eee8d5' },

    // ─── Outline / Border ───────────────────────────────────────────
    // outline-low stays a real step (~25 per channel) below the surface:
    // AI Studio derives its region dividers from it, and a 2% whisper there
    // makes the sidebar look unseparated from the chat body.
    { property: '--gem-sys-color--outline', value: '#93a1a1' },
    { property: '--gem-sys-color--outline-variant', value: '#cfc9b5' },
    { property: '--gem-sys-color--outline-low', value: '#e4ddc8' },

    // ─── Inverse (the dark half of Solarized) ───────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#002b36' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#fdf6e3' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#dc322f' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#268bd2' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#6c71c4' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#2aa198' },

    // ─── Code Block (canonical Solarized syntax roles) ──────────────
    { property: '--bard-color-code-comment', value: '#93a1a1' },
    { property: '--bard-color-code-variables', value: '#268bd2' },
    { property: '--bard-color-code-literal', value: '#d33682' },
    { property: '--bard-color-code-class', value: '#b58900' },
    { property: '--bard-color-code-string', value: '#2aa198' },
    { property: '--bard-color-code-quotes-and-meta', value: '#6c71c4' },
    { property: '--bard-color-code-keyword', value: '#859900' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#268bd2' },
    { property: '--mat-button-filled-label-text-color', value: '#fdf6e3' },
    { property: '--mat-button-tonal-container-color', value: '#dceaf5' },
    { property: '--mat-button-tonal-label-text-color', value: '#0a4a70' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#fdf6e3' },
    { property: '--mat-menu-item-label-text-color', value: '#586e75' },
    { property: '--mat-menu-item-icon-color', value: '#657b83' },
    { property: '--mat-menu-divider-color', value: '#e4ddc8' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(88,110,117,0.10), 0px 1px 4px rgba(88,110,117,0.06)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#586e75' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#657b83' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#657b83' },
    { property: '--mat-list-active-indicator-color', value: '#dceaf5' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#dceaf5' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#0a4a70' },
  ],
  sidebarVariables: [
    { property: '--background', value: '242 235 216' },        // #f2ebd8
    { property: '--foreground', value: '88 110 117' },         // #586e75
    { property: '--card', value: '253 246 227' },              // #fdf6e3
    { property: '--card-foreground', value: '88 110 117' },
    { property: '--popover', value: '253 246 227' },
    { property: '--popover-foreground', value: '88 110 117' },
    { property: '--primary', value: '38 139 210' },            // #268bd2
    { property: '--primary-foreground', value: '253 246 227' },
    { property: '--secondary', value: '238 232 213' },         // #eee8d5
    { property: '--secondary-foreground', value: '88 110 117' },
    { property: '--muted', value: '238 232 213' },
    { property: '--muted-foreground', value: '147 161 161' },  // #93a1a1
    { property: '--accent', value: '220 234 245' },            // #dceaf5
    { property: '--accent-foreground', value: '10 74 112' },
    { property: '--destructive', value: '220 50 47' },          // #dc322f
    { property: '--destructive-foreground', value: '253 246 227' },
    { property: '--border', value: '147 161 161' },             // #93a1a1
    { property: '--input', value: '207 201 181' },              // #cfc9b5
    { property: '--ring', value: '38 139 210' },
    { property: '--sidebar-icon-color', value: '101 123 131' }, // #657b83
    { property: '--highlight', value: '181 137 0' },             // #b58900 - solarized yellow
    { property: '--highlight-foreground', value: '253 246 227' },
    { property: '--success', value: '133 153 0' },               // #859900 - solarized green
    { property: '--success-foreground', value: '253 246 227' },
    { property: '--warning', value: '203 75 22' },               // #cb4b16 - solarized orange
    { property: '--warning-foreground', value: '253 246 227' },
    { property: '--font-sans', value: '"Inconsolata", "SF Mono", Menlo, monospace' },
    { property: '--gem-sys-color--primary-container', value: '#dceaf5' },
    { property: '--gem-sys-color--on-primary-container', value: '#0a4a70' },
    { property: '--radius', value: '4px' },
  ],
};
