/**
 * 🌲 森林 (Everforest)
 *
 * 低饱和的灰绿色底调，配暖米色文字，
 * 鼠尾草绿与暖橙点缀，像林间透下来的散射光。
 * 和复古终端（黑底霓虹绿）、北极光（蓝灰）都不是一路：
 * 这是整套主题里唯一真正以绿色作为底色的。
 * 使用 Karla 字体。
 */

import type { ThemePreset } from '../types';

export const everforest: ThemePreset = {
  id: 'everforest',
  name: 'Everforest',
  description:
    'Muted forest green dark theme with sage and warm orange accents, easy on the eyes',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['Karla:wght@300;400;500;600;700'],
  fontCss: `
/* Everforest font override */
body.bs-fonts--everforest {
  font-family: 'Karla', 'Inter', 'Microsoft YaHei', 'PingFang SC', sans-serif !important;
}

body.bs-fonts--everforest *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Karla", "Inter", sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Karla", "Inter", sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Karla", "Inter", sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Karla", "Inter", sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Karla", "Inter", sans-serif' },
  ],
  variables: [
    // ─── Surface / Background (Muted Green-Grey) ────────────────────
    { property: '--gem-sys-color--surface', value: '#2d353b' },
    { property: '--gem-sys-color--surface-bright', value: '#3d484d' },
    { property: '--gem-sys-color--surface-dim', value: '#232a2e' },
    { property: '--gem-sys-color--surface-container', value: '#343f44' },
    { property: '--gem-sys-color--surface-container-low', value: '#2d353b' },
    { property: '--gem-sys-color--surface-container-high', value: '#3d484d' },
    { property: '--gem-sys-color--surface-container-highest', value: '#475258' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#232a2e' },
    { property: '--gem-sys-color--surface-variant', value: '#343f44' },
    { property: '--mat-app-background-color', value: '#2d353b' },
    { property: '--lumi-sys-color--surface', value: '#2d353b' },
    { property: '--lumi-sys-color--surface-bright', value: '#3d484d' },
    { property: '--lumi-sys-color--surface-dim', value: '#232a2e' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#2d353b' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#343f44' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#475258' },
    { property: '--bard-color-sidenav-background-desktop', value: '#232a2e' },
    { property: '--bard-color-sidenav-background-mobile', value: '#2d353b' },

    // ─── Text (Warm Sand) ───────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#d3c6aa' },
    { property: '--gem-sys-color--on-surface-variant', value: '#9da9a0' },
    { property: '--gem-sys-color--on-surface-low', value: '#7a8478' },
    { property: '--mat-app-text-color', value: '#d3c6aa' },
    { property: '--lumi-sys-color--on-surface', value: '#d3c6aa' },
    { property: '--bard-color-form-field-placeholder', value: '#7a8478' },

    // ─── Primary (Sage Green) ───────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#a7c080' },
    { property: '--gem-sys-color--on-primary', value: '#2d353b' },
    { property: '--gem-sys-color--primary-container', value: '#384b3d' },
    { property: '--gem-sys-color--on-primary-container', value: '#a7c080' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#83a06a' },
    { property: '--mat-focus-indicator-border-color', value: '#a7c080' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#a7c080' },

    // ─── Secondary (Warm Orange) ────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#e69875' },
    { property: '--gem-sys-color--on-secondary', value: '#2d353b' },
    { property: '--gem-sys-color--secondary-container', value: '#4a3b33' },
    { property: '--gem-sys-color--on-secondary-container', value: '#e69875' },
    { property: '--gem-sys-color--tertiary-container', value: '#343f44' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#859289' },
    { property: '--gem-sys-color--outline-variant', value: '#4f585e' },
    { property: '--gem-sys-color--outline-low', value: '#3d484d' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#d3c6aa' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#2d353b' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#e67e80' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#a7c080' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#83c092' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#7fbbb3' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#7a8478' },
    { property: '--bard-color-code-variables', value: '#7fbbb3' },
    { property: '--bard-color-code-literal', value: '#d699b6' },
    { property: '--bard-color-code-class', value: '#dbbc7f' },
    { property: '--bard-color-code-string', value: '#a7c080' },
    { property: '--bard-color-code-quotes-and-meta', value: '#83c092' },
    { property: '--bard-color-code-keyword', value: '#e67e80' },
    { property: '--lumi-sys-color--code-background', value: '#232a2e' },
    { property: '--lumi-sys-color--code-primary-text', value: '#d3c6aa' },
    { property: '--lumi-sys-color--code-grey-text', value: '#7a8478' },
    { property: '--lumi-sys-color--code-blue-text', value: '#7fbbb3' },
    { property: '--lumi-sys-color--code-pink-text', value: '#d699b6' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#dbbc7f' },
    { property: '--lumi-sys-color--code-green-text', value: '#a7c080' },
    { property: '--lumi-sys-color--code-red-text', value: '#e67e80' },
    { property: '--lumi-sys-color--code-purple-text', value: '#d699b6' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#a7c080' },
    { property: '--mat-button-filled-label-text-color', value: '#2d353b' },
    { property: '--mat-button-tonal-container-color', value: '#384b3d' },
    { property: '--mat-button-tonal-label-text-color', value: '#a7c080' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#343f44' },
    { property: '--mat-menu-item-label-text-color', value: '#d3c6aa' },
    { property: '--mat-menu-item-icon-color', value: '#9da9a0' },
    { property: '--mat-menu-divider-color', value: '#475258' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.32), 0px 2px 6px rgba(0,0,0,0.22)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#d3c6aa' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#9da9a0' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#9da9a0' },
    { property: '--mat-list-active-indicator-color', value: '#384b3d' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#384b3d' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#a7c080' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.26)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.32)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.38)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#384b3d' },
    { property: '--bard-color-processing-animation-color-2', value: '#343f44' },
  ],
  sidebarVariables: [
    { property: '--background', value: '35 42 46' },           // #232a2e
    { property: '--foreground', value: '211 198 170' },        // #d3c6aa
    { property: '--card', value: '52 63 68' },                 // #343f44
    { property: '--card-foreground', value: '211 198 170' },
    { property: '--popover', value: '52 63 68' },
    { property: '--popover-foreground', value: '211 198 170' },
    { property: '--primary', value: '167 192 128' },           // #a7c080
    { property: '--primary-foreground', value: '45 53 59' },
    { property: '--secondary', value: '61 72 77' },            // #3d484d
    { property: '--secondary-foreground', value: '157 169 160' },
    { property: '--muted', value: '61 72 77' },
    { property: '--muted-foreground', value: '122 132 120' },  // #7a8478
    { property: '--accent', value: '56 75 61' },               // #384b3d
    { property: '--accent-foreground', value: '167 192 128' },
    { property: '--destructive', value: '230 126 128' },       // #e67e80
    { property: '--destructive-foreground', value: '45 53 59' },
    { property: '--border', value: '133 146 137' },            // #859289
    { property: '--input', value: '79 88 94' },                // #4f585e
    { property: '--ring', value: '167 192 128' },
    { property: '--sidebar-icon-color', value: '157 169 160' },
    { property: '--highlight', value: '230 152 117' },          // #e69875 - warm orange
    { property: '--highlight-foreground', value: '45 53 59' },
    { property: '--success', value: '131 192 146' },            // #83c092 - everforest aqua
    { property: '--success-foreground', value: '45 53 59' },
    { property: '--warning', value: '219 188 127' },            // #dbbc7f - everforest yellow
    { property: '--warning-foreground', value: '45 53 59' },
    { property: '--font-sans', value: '"Karla", "Inter", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#384b3d' },
    { property: '--gem-sys-color--on-primary-container', value: '#a7c080' },
    { property: '--radius', value: '8px' },
  ],
};
