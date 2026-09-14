/**
 * 🍂 暖褐复古 (Gruvbox)
 *
 * 经典的 Gruvbox 暗色配色：暖褐色底调配米黄色文字，
 * 橙、黄、绿三色点缀，像一张被翻旧了的牛皮纸。
 * 补上了整套主题里唯一缺失的「暖色深底」，
 * 其余九个深色主题的底色全是冷调或纯黑。
 * 使用 IBM Plex Mono 等宽字体。
 */

import type { ThemePreset } from '../types';

export const gruvbox: ThemePreset = {
  id: 'gruvbox',
  name: 'Gruvbox',
  description:
    'Warm retro dark theme with brown base and orange, yellow and green accents',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['IBM+Plex+Mono:wght@300;400;500;600'],
  fontMono: `'IBM Plex Mono', 'SF Mono', 'JetBrains Mono', monospace`,
  fontCss: `
/* Gruvbox monospace font override */
body.bs-fonts--gruvbox {
  font-family: 'IBM Plex Mono', 'SF Mono', 'JetBrains Mono', monospace !important;
}

body.bs-fonts--gruvbox *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"IBM Plex Mono", "SF Mono", monospace' },
    { property: '--mat-list-list-item-label-text-font', value: '"IBM Plex Mono", "SF Mono", monospace' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"IBM Plex Mono", "SF Mono", monospace' },
    { property: '--mat-button-text-label-text-font', value: '"IBM Plex Mono", "SF Mono", monospace' },
    { property: '--mat-button-filled-label-text-font', value: '"IBM Plex Mono", "SF Mono", monospace' },
  ],
  variables: [
    // ─── Surface / Background (Warm Brown) ──────────────────────────
    { property: '--gem-sys-color--surface', value: '#282828' },
    { property: '--gem-sys-color--surface-bright', value: '#3c3836' },
    { property: '--gem-sys-color--surface-dim', value: '#1d2021' },
    { property: '--gem-sys-color--surface-container', value: '#32302f' },
    { property: '--gem-sys-color--surface-container-low', value: '#282828' },
    { property: '--gem-sys-color--surface-container-high', value: '#3c3836' },
    { property: '--gem-sys-color--surface-container-highest', value: '#504945' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#1d2021' },
    { property: '--gem-sys-color--surface-variant', value: '#3c3836' },
    { property: '--mat-app-background-color', value: '#282828' },
    { property: '--lumi-sys-color--surface', value: '#282828' },
    { property: '--lumi-sys-color--surface-bright', value: '#3c3836' },
    { property: '--lumi-sys-color--surface-dim', value: '#1d2021' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#282828' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#32302f' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#504945' },
    { property: '--bard-color-sidenav-background-desktop', value: '#1d2021' },
    { property: '--bard-color-sidenav-background-mobile', value: '#282828' },

    // ─── Text (Cream) ───────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#ebdbb2' },
    { property: '--gem-sys-color--on-surface-variant', value: '#d5c4a1' },
    { property: '--gem-sys-color--on-surface-low', value: '#928374' },
    { property: '--mat-app-text-color', value: '#ebdbb2' },
    { property: '--lumi-sys-color--on-surface', value: '#ebdbb2' },
    { property: '--bard-color-form-field-placeholder', value: '#928374' },

    // ─── Primary (Gruvbox Yellow) ───────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#fabd2f' },
    { property: '--gem-sys-color--on-primary', value: '#282828' },
    { property: '--gem-sys-color--primary-container', value: '#4a3f21' },
    { property: '--gem-sys-color--on-primary-container', value: '#fabd2f' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#d79921' },
    { property: '--mat-focus-indicator-border-color', value: '#fabd2f' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#fabd2f' },

    // ─── Secondary (Gruvbox Orange) ─────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#fe8019' },
    { property: '--gem-sys-color--on-secondary', value: '#282828' },
    { property: '--gem-sys-color--secondary-container', value: '#4d3018' },
    { property: '--gem-sys-color--on-secondary-container', value: '#fe8019' },
    { property: '--gem-sys-color--tertiary-container', value: '#32302f' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#928374' },
    { property: '--gem-sys-color--outline-variant', value: '#665c54' },
    { property: '--gem-sys-color--outline-low', value: '#3c3836' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#ebdbb2' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#282828' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#fb4934' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#fabd2f' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#fe8019' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#b8bb26' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#928374' },
    { property: '--bard-color-code-variables', value: '#83a598' },
    { property: '--bard-color-code-literal', value: '#d3869b' },
    { property: '--bard-color-code-class', value: '#fabd2f' },
    { property: '--bard-color-code-string', value: '#b8bb26' },
    { property: '--bard-color-code-quotes-and-meta', value: '#8ec07c' },
    { property: '--bard-color-code-keyword', value: '#fb4934' },
    { property: '--lumi-sys-color--code-background', value: '#1d2021' },
    { property: '--lumi-sys-color--code-primary-text', value: '#ebdbb2' },
    { property: '--lumi-sys-color--code-grey-text', value: '#928374' },
    { property: '--lumi-sys-color--code-blue-text', value: '#83a598' },
    { property: '--lumi-sys-color--code-pink-text', value: '#d3869b' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#fabd2f' },
    { property: '--lumi-sys-color--code-green-text', value: '#b8bb26' },
    { property: '--lumi-sys-color--code-red-text', value: '#fb4934' },
    { property: '--lumi-sys-color--code-purple-text', value: '#b16286' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#fabd2f' },
    { property: '--mat-button-filled-label-text-color', value: '#282828' },
    { property: '--mat-button-tonal-container-color', value: '#4d3018' },
    { property: '--mat-button-tonal-label-text-color', value: '#fe8019' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#32302f' },
    { property: '--mat-menu-item-label-text-color', value: '#ebdbb2' },
    { property: '--mat-menu-item-icon-color', value: '#d5c4a1' },
    { property: '--mat-menu-divider-color', value: '#504945' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.4), 0px 2px 6px rgba(0,0,0,0.28)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#ebdbb2' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#d5c4a1' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#d5c4a1' },
    { property: '--mat-list-active-indicator-color', value: '#4a3f21' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#4a3f21' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#fabd2f' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.32)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.38)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.44)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#4a3f21' },
    { property: '--bard-color-processing-animation-color-2', value: '#32302f' },
  ],
  sidebarVariables: [
    { property: '--background', value: '29 32 33' },          // #1d2021
    { property: '--foreground', value: '235 219 178' },       // #ebdbb2
    { property: '--card', value: '50 48 47' },                // #32302f
    { property: '--card-foreground', value: '235 219 178' },
    { property: '--popover', value: '50 48 47' },
    { property: '--popover-foreground', value: '235 219 178' },
    { property: '--primary', value: '250 189 47' },           // #fabd2f
    { property: '--primary-foreground', value: '40 40 40' },
    { property: '--secondary', value: '60 56 54' },           // #3c3836
    { property: '--secondary-foreground', value: '213 196 161' },
    { property: '--muted', value: '60 56 54' },
    { property: '--muted-foreground', value: '146 131 116' }, // #928374
    { property: '--accent', value: '74 63 33' },              // #4a3f21
    { property: '--accent-foreground', value: '250 189 47' },
    { property: '--destructive', value: '251 73 52' },        // #fb4934
    { property: '--destructive-foreground', value: '40 40 40' },
    { property: '--border', value: '146 131 116' },           // #928374
    { property: '--input', value: '102 92 84' },              // #665c54
    { property: '--ring', value: '250 189 47' },
    { property: '--sidebar-icon-color', value: '213 196 161' },
    { property: '--highlight', value: '254 128 25' },           // #fe8019 - gruvbox orange
    { property: '--highlight-foreground', value: '40 40 40' },
    { property: '--success', value: '184 187 38' },             // #b8bb26 - gruvbox green
    { property: '--success-foreground', value: '40 40 40' },
    { property: '--warning', value: '215 153 33' },            // #d79921 - gruvbox dim yellow
    { property: '--warning-foreground', value: '40 40 40' },
    { property: '--font-sans', value: '"IBM Plex Mono", "SF Mono", "JetBrains Mono", monospace' },
    { property: '--gem-sys-color--primary-container', value: '#4a3f21' },
    { property: '--gem-sys-color--on-primary-container', value: '#fabd2f' },
    { property: '--radius', value: '4px' },
  ],
};
