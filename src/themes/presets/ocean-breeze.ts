/**
 * 🌊 海风 (Ocean Breeze)
 *
 * 清新明亮的浅色主题，以海洋蓝和珊瑚色为点缀，
 * 柔和的白蓝底色营造出海边微风拂面的感觉。
 * 使用 Nunito 圆润无衬线字体，温暖亲切。
 */

import type { ThemePreset } from '../types';

export const oceanBreeze: ThemePreset = {
  id: 'ocean-breeze',
  name: 'Ocean Breeze',
  description:
    'Fresh light theme with ocean blue and coral accents',
  isPremium: true,
  preferredMode: 'light',
  fonts: ['Nunito:wght@300;400;500;600;700'],
  fontCss: `
/* Ocean Breeze font override */
body.bs-fonts--ocean-breeze {
  font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

body.bs-fonts--ocean-breeze *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Nunito", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Nunito", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Nunito", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Nunito", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Nunito", -apple-system, BlinkMacSystemFont, sans-serif' },
  ],
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#f8fbfd' },
    { property: '--gem-sys-color--surface-bright', value: '#ffffff' },
    { property: '--gem-sys-color--surface-dim', value: '#e8f1f5' },
    { property: '--gem-sys-color--surface-container', value: '#f0f7fa' },
    { property: '--gem-sys-color--surface-container-low', value: '#f8fbfd' },
    { property: '--gem-sys-color--surface-container-high', value: '#e0f4ff' },
    { property: '--gem-sys-color--surface-container-highest', value: '#d0ecf8' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#ffffff' },
    { property: '--gem-sys-color--surface-variant', value: '#e0f4ff' },
    { property: '--mat-app-background-color', value: '#f8fbfd' },
    { property: '--lumi-sys-color--surface', value: '#f8fbfd' },
    { property: '--lumi-sys-color--surface-bright', value: '#ffffff' },
    { property: '--lumi-sys-color--surface-dim', value: '#e8f1f5' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#f8fbfd' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#f0f7fa' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#d0ecf8' },
    { property: '--bard-color-sidenav-background-desktop', value: '#f0f7fa' },
    { property: '--bard-color-sidenav-background-mobile', value: '#f8fbfd' },

    // ─── Text ───────────────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#1e3a4c' },
    { property: '--gem-sys-color--on-surface-variant', value: '#3a5568' },
    { property: '--gem-sys-color--on-surface-low', value: '#7a9bb0' },
    { property: '--mat-app-text-color', value: '#1e3a4c' },
    { property: '--lumi-sys-color--on-surface', value: '#1e3a4c' },
    { property: '--bard-color-form-field-placeholder', value: '#7a9bb0' },

    // ─── Primary ────────────────────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#0077b6' },
    { property: '--gem-sys-color--on-primary', value: '#ffffff' },
    { property: '--gem-sys-color--primary-container', value: '#cce5f5' },
    { property: '--gem-sys-color--on-primary-container', value: '#005580' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#005580' },
    { property: '--mat-focus-indicator-border-color', value: '#0077b6' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#0077b6' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#ff6b6b' },
    { property: '--gem-sys-color--on-secondary', value: '#ffffff' },
    { property: '--gem-sys-color--secondary-container', value: '#ffe0e0' },
    { property: '--gem-sys-color--on-secondary-container', value: '#c44040' },
    { property: '--gem-sys-color--tertiary-container', value: '#fdf6e3' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#b0cfe0' },
    { property: '--gem-sys-color--outline-variant', value: '#c8dce8' },
    { property: '--gem-sys-color--outline-low', value: '#e0f4ff' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#1e3a4c' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#f8fbfd' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#d32f2f' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#0077b6' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#00b4d8' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#ff6b6b' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#7a9bb0' },
    { property: '--bard-color-code-variables', value: '#d32f2f' },
    { property: '--bard-color-code-literal', value: '#0077b6' },
    { property: '--bard-color-code-class', value: '#e65100' },
    { property: '--bard-color-code-string', value: '#2e7d32' },
    { property: '--bard-color-code-quotes-and-meta', value: '#00838f' },
    { property: '--bard-color-code-keyword', value: '#6a1b9a' },
    { property: '--lumi-sys-color--code-background', value: '#f0f7fa' },
    { property: '--lumi-sys-color--code-primary-text', value: '#1e3a4c' },
    { property: '--lumi-sys-color--code-grey-text', value: '#7a9bb0' },
    { property: '--lumi-sys-color--code-blue-text', value: '#0077b6' },
    { property: '--lumi-sys-color--code-pink-text', value: '#c2185b' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#e65100' },
    { property: '--lumi-sys-color--code-green-text', value: '#2e7d32' },
    { property: '--lumi-sys-color--code-red-text', value: '#d32f2f' },
    { property: '--lumi-sys-color--code-purple-text', value: '#6a1b9a' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#0077b6' },
    { property: '--mat-button-filled-label-text-color', value: '#ffffff' },
    { property: '--mat-button-tonal-container-color', value: '#cce5f5' },
    { property: '--mat-button-tonal-label-text-color', value: '#005580' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#ffffff' },
    { property: '--mat-menu-item-label-text-color', value: '#1e3a4c' },
    { property: '--mat-menu-item-icon-color', value: '#3a5568' },
    { property: '--mat-menu-divider-color', value: '#b0cfe0' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,119,182,0.1), 0px 2px 6px rgba(0,0,0,0.08)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#1e3a4c' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#3a5568' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#3a5568' },
    { property: '--mat-list-active-indicator-color', value: '#cce5f5' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#cce5f5' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#0077b6' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,119,182,0.08)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,119,182,0.12)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,119,182,0.16)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#cce5f5' },
    { property: '--bard-color-processing-animation-color-2', value: '#e0f4ff' },
  ],
  sidebarVariables: [
    { property: '--background', value: '240 247 250' },       // #f0f7fa
    { property: '--foreground', value: '30 58 76' },          // #1e3a4c
    { property: '--card', value: '255 255 255' },             // #ffffff
    { property: '--card-foreground', value: '30 58 76' },
    { property: '--popover', value: '255 255 255' },
    { property: '--popover-foreground', value: '30 58 76' },
    { property: '--primary', value: '0 119 182' },            // #0077b6
    { property: '--primary-foreground', value: '255 255 255' },
    { property: '--secondary', value: '224 244 255' },        // #e0f4ff
    { property: '--secondary-foreground', value: '30 58 76' },
    { property: '--muted', value: '224 244 255' },
    { property: '--muted-foreground', value: '122 155 176' }, // #7a9bb0
    { property: '--accent', value: '204 229 245' },           // #cce5f5
    { property: '--accent-foreground', value: '0 85 128' },
    { property: '--destructive', value: '211 47 47' },        // #d32f2f
    { property: '--destructive-foreground', value: '255 255 255' },
    { property: '--border', value: '176 207 224' },           // #b0cfe0
    { property: '--input', value: '200 220 232' },            // #c8dce8
    { property: '--ring', value: '0 119 182' },
    { property: '--sidebar-icon-color', value: '58 85 104' },
    { property: '--highlight', value: '255 107 107' },          // #ff6b6b - coral red
    { property: '--highlight-foreground', value: '255 255 255' },
    { property: '--success', value: '0 137 123' },              // #00897b - sea teal-green
    { property: '--success-foreground', value: '255 255 255' },
    { property: '--warning', value: '199 119 0' },              // #c77700 - sand amber
    { property: '--warning-foreground', value: '255 255 255' },
    { property: '--font-sans', value: '"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#cce5f5' },
    { property: '--gem-sys-color--on-primary-container', value: '#005580' },
    { property: '--radius', value: '10px' },
  ],
};
