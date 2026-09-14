/**
 * 🌃 东京之夜 (Tokyo Night)
 *
 * 灵感来自东京夜晚城市灯光的深蓝黑色主题，
 * 以紫色、蓝色和桃色作为点缀，
 * 营造出赛博朋克般的都市夜景氛围。
 * 使用 JetBrains Mono 等宽字体。
 */

import type { ThemePreset } from '../types';

export const tokyoNight: ThemePreset = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  description:
    'Deep blue-black with purple, blue and peach accents inspired by Tokyo city lights',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['JetBrains+Mono:wght@300;400;500;600'],
  fontMono: `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`,
  fontCss: `
/* Tokyo Night monospace font override */
body.bs-fonts--tokyo-night {
  font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace !important;
}

body.bs-fonts--tokyo-night *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"JetBrains Mono", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-list-list-item-label-text-font', value: '"JetBrains Mono", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"JetBrains Mono", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-button-text-label-text-font', value: '"JetBrains Mono", "SF Mono", "Fira Code", monospace' },
    { property: '--mat-button-filled-label-text-font', value: '"JetBrains Mono", "SF Mono", "Fira Code", monospace' },
  ],
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#1a1b26' },
    { property: '--gem-sys-color--surface-bright', value: '#24283b' },
    { property: '--gem-sys-color--surface-dim', value: '#13141e' },
    { property: '--gem-sys-color--surface-container', value: '#1f2335' },
    { property: '--gem-sys-color--surface-container-low', value: '#1a1b26' },
    { property: '--gem-sys-color--surface-container-high', value: '#24283b' },
    { property: '--gem-sys-color--surface-container-highest', value: '#2f3349' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#13141e' },
    { property: '--gem-sys-color--surface-variant', value: '#24283b' },
    { property: '--mat-app-background-color', value: '#1a1b26' },
    { property: '--lumi-sys-color--surface', value: '#1a1b26' },
    { property: '--lumi-sys-color--surface-bright', value: '#24283b' },
    { property: '--lumi-sys-color--surface-dim', value: '#13141e' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#1a1b26' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#1f2335' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#2f3349' },
    { property: '--bard-color-sidenav-background-desktop', value: '#16172a' },
    { property: '--bard-color-sidenav-background-mobile', value: '#1a1b26' },

    // ─── Text ───────────────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#a9b1d6' },
    { property: '--gem-sys-color--on-surface-variant', value: '#9aa5ce' },
    { property: '--gem-sys-color--on-surface-low', value: '#565f89' },
    { property: '--mat-app-text-color', value: '#a9b1d6' },
    { property: '--lumi-sys-color--on-surface', value: '#a9b1d6' },
    { property: '--bard-color-form-field-placeholder', value: '#565f89' },

    // ─── Primary ────────────────────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#7aa2f7' },
    { property: '--gem-sys-color--on-primary', value: '#1a1f30' },
    { property: '--gem-sys-color--primary-container', value: '#283457' },
    { property: '--gem-sys-color--on-primary-container', value: '#7aa2f7' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#5a80d0' },
    { property: '--mat-focus-indicator-border-color', value: '#7aa2f7' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#7aa2f7' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#bb9af7' },
    { property: '--gem-sys-color--on-secondary', value: '#241e30' },
    { property: '--gem-sys-color--secondary-container', value: '#3d2f55' },
    { property: '--gem-sys-color--on-secondary-container', value: '#bb9af7' },
    { property: '--gem-sys-color--tertiary-container', value: '#1f2335' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#565f89' },
    { property: '--gem-sys-color--outline-variant', value: '#414868' },
    { property: '--gem-sys-color--outline-low', value: '#24283b' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#c0caf5' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#1a1b26' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#f7768e' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#7aa2f7' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#bb9af7' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#7dcfff' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#565f89' },
    { property: '--bard-color-code-variables', value: '#7dcfff' },
    { property: '--bard-color-code-literal', value: '#ff9e64' },
    { property: '--bard-color-code-class', value: '#e0af68' },
    { property: '--bard-color-code-string', value: '#9ece6a' },
    { property: '--bard-color-code-quotes-and-meta', value: '#7aa2f7' },
    { property: '--bard-color-code-keyword', value: '#bb9af7' },
    { property: '--lumi-sys-color--code-background', value: '#13141e' },
    { property: '--lumi-sys-color--code-primary-text', value: '#a9b1d6' },
    { property: '--lumi-sys-color--code-grey-text', value: '#565f89' },
    { property: '--lumi-sys-color--code-blue-text', value: '#7aa2f7' },
    { property: '--lumi-sys-color--code-pink-text', value: '#f7768e' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#e0af68' },
    { property: '--lumi-sys-color--code-green-text', value: '#9ece6a' },
    { property: '--lumi-sys-color--code-red-text', value: '#f7768e' },
    { property: '--lumi-sys-color--code-purple-text', value: '#bb9af7' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#7aa2f7' },
    { property: '--mat-button-filled-label-text-color', value: '#1a1f30' },
    { property: '--mat-button-tonal-container-color', value: '#283457' },
    { property: '--mat-button-tonal-label-text-color', value: '#7aa2f7' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#1f2335' },
    { property: '--mat-menu-item-label-text-color', value: '#a9b1d6' },
    { property: '--mat-menu-item-icon-color', value: '#9aa5ce' },
    { property: '--mat-menu-divider-color', value: '#565f89' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.35), 0px 2px 6px rgba(0,0,0,0.25)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#a9b1d6' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#9aa5ce' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#9aa5ce' },
    { property: '--mat-list-active-indicator-color', value: '#283457' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#283457' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#7aa2f7' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.3)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.35)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.4)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#283457' },
    { property: '--bard-color-processing-animation-color-2', value: '#1f2335' },
  ],
  sidebarVariables: [
    { property: '--background', value: '22 23 42' },          // #16172a
    { property: '--foreground', value: '169 177 214' },       // #a9b1d6
    { property: '--card', value: '31 35 53' },                // #1f2335
    { property: '--card-foreground', value: '169 177 214' },
    { property: '--popover', value: '31 35 53' },
    { property: '--popover-foreground', value: '169 177 214' },
    { property: '--primary', value: '122 162 247' },          // #7aa2f7
    { property: '--primary-foreground', value: '26 31 48' },
    { property: '--secondary', value: '36 40 59' },           // #24283b
    { property: '--secondary-foreground', value: '154 165 206' },
    { property: '--muted', value: '36 40 59' },
    { property: '--muted-foreground', value: '86 95 137' },   // #565f89
    { property: '--accent', value: '40 52 87' },              // #283457
    { property: '--accent-foreground', value: '122 162 247' },
    { property: '--destructive', value: '247 118 142' },      // #f7768e
    { property: '--destructive-foreground', value: '169 177 214' },
    { property: '--border', value: '86 95 137' },             // #565f89
    { property: '--input', value: '65 72 104' },              // #414868
    { property: '--ring', value: '122 162 247' },
    { property: '--sidebar-icon-color', value: '154 165 206' },
    { property: '--highlight', value: '187 154 247' },          // #bb9af7 - purple
    { property: '--highlight-foreground', value: '26 27 38' },
    { property: '--success', value: '158 206 106' },            // #9ece6a - tokyo green
    { property: '--success-foreground', value: '26 27 38' },
    { property: '--warning', value: '224 175 104' },            // #e0af68 - tokyo orange
    { property: '--warning-foreground', value: '26 27 38' },
    { property: '--font-sans', value: '"JetBrains Mono", "SF Mono", "Fira Code", monospace' },
    { property: '--gem-sys-color--primary-container', value: '#283457' },
    { property: '--gem-sys-color--on-primary-container', value: '#7aa2f7' },
    { property: '--radius', value: '6px' },
  ],
};
