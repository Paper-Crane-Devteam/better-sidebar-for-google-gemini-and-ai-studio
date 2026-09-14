/**
 * 🐱 卡布奇诺摩卡 (Catppuccin Mocha)
 *
 * 温暖的柔和暗色主题，以薰衣草和桃色为主要点缀，
 * 低对比度的配色方案让眼睛更舒适。
 * 使用系统默认字体栈，保持原生体验。
 */

import type { ThemePreset } from '../types';

export const catppuccinMocha: ThemePreset = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  description:
    'Warm pastel dark theme with lavender and peach tones',
  isPremium: true,
  preferredMode: 'dark',
  fonts: [],
  fontCss: `
/* Catppuccin Mocha system font override */
body.bs-fonts--catppuccin-mocha {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

body.bs-fonts--catppuccin-mocha *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  ],
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#1e1e2e' },
    { property: '--gem-sys-color--surface-bright', value: '#313244' },
    { property: '--gem-sys-color--surface-dim', value: '#181825' },
    { property: '--gem-sys-color--surface-container', value: '#24243a' },
    { property: '--gem-sys-color--surface-container-low', value: '#1e1e2e' },
    { property: '--gem-sys-color--surface-container-high', value: '#313244' },
    { property: '--gem-sys-color--surface-container-highest', value: '#45475a' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#181825' },
    { property: '--gem-sys-color--surface-variant', value: '#313244' },
    { property: '--mat-app-background-color', value: '#1e1e2e' },
    { property: '--lumi-sys-color--surface', value: '#1e1e2e' },
    { property: '--lumi-sys-color--surface-bright', value: '#313244' },
    { property: '--lumi-sys-color--surface-dim', value: '#181825' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#1e1e2e' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#24243a' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#45475a' },
    { property: '--bard-color-sidenav-background-desktop', value: '#1b1b2b' },
    { property: '--bard-color-sidenav-background-mobile', value: '#1e1e2e' },

    // ─── Text ───────────────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#cdd6f4' },
    { property: '--gem-sys-color--on-surface-variant', value: '#bac2de' },
    { property: '--gem-sys-color--on-surface-low', value: '#6c7086' },
    { property: '--mat-app-text-color', value: '#cdd6f4' },
    { property: '--lumi-sys-color--on-surface', value: '#cdd6f4' },
    { property: '--bard-color-form-field-placeholder', value: '#6c7086' },

    // ─── Primary ────────────────────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#b4befe' },
    { property: '--gem-sys-color--on-primary', value: '#1e1e30' },
    { property: '--gem-sys-color--primary-container', value: '#3b3d5e' },
    { property: '--gem-sys-color--on-primary-container', value: '#b4befe' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#8e96d6' },
    { property: '--mat-focus-indicator-border-color', value: '#b4befe' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#b4befe' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#fab387' },
    { property: '--gem-sys-color--on-secondary', value: '#2e1e14' },
    { property: '--gem-sys-color--secondary-container', value: '#5a3d28' },
    { property: '--gem-sys-color--on-secondary-container', value: '#fab387' },
    { property: '--gem-sys-color--tertiary-container', value: '#313244' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#6c7086' },
    { property: '--gem-sys-color--outline-variant', value: '#585b70' },
    { property: '--gem-sys-color--outline-low', value: '#313244' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#cdd6f4' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#1e1e2e' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#f38ba8' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#b4befe' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#cba6f7' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#fab387' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#6c7086' },
    { property: '--bard-color-code-variables', value: '#f38ba8' },
    { property: '--bard-color-code-literal', value: '#fab387' },
    { property: '--bard-color-code-class', value: '#f9e2af' },
    { property: '--bard-color-code-string', value: '#a6e3a1' },
    { property: '--bard-color-code-quotes-and-meta', value: '#89dceb' },
    { property: '--bard-color-code-keyword', value: '#cba6f7' },
    { property: '--lumi-sys-color--code-background', value: '#181825' },
    { property: '--lumi-sys-color--code-primary-text', value: '#cdd6f4' },
    { property: '--lumi-sys-color--code-grey-text', value: '#6c7086' },
    { property: '--lumi-sys-color--code-blue-text', value: '#89b4fa' },
    { property: '--lumi-sys-color--code-pink-text', value: '#f5c2e7' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#f9e2af' },
    { property: '--lumi-sys-color--code-green-text', value: '#a6e3a1' },
    { property: '--lumi-sys-color--code-red-text', value: '#f38ba8' },
    { property: '--lumi-sys-color--code-purple-text', value: '#cba6f7' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#b4befe' },
    { property: '--mat-button-filled-label-text-color', value: '#1e1e30' },
    { property: '--mat-button-tonal-container-color', value: '#3b3d5e' },
    { property: '--mat-button-tonal-label-text-color', value: '#b4befe' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#24243a' },
    { property: '--mat-menu-item-label-text-color', value: '#cdd6f4' },
    { property: '--mat-menu-item-icon-color', value: '#bac2de' },
    { property: '--mat-menu-divider-color', value: '#6c7086' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.3), 0px 2px 6px rgba(0,0,0,0.2)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#cdd6f4' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#bac2de' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#bac2de' },
    { property: '--mat-list-active-indicator-color', value: '#3b3d5e' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#3b3d5e' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#b4befe' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.25)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.3)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.35)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#3b3d5e' },
    { property: '--bard-color-processing-animation-color-2', value: '#24243a' },
  ],
  sidebarVariables: [
    { property: '--background', value: '27 27 43' },          // #1b1b2b
    { property: '--foreground', value: '205 214 244' },       // #cdd6f4
    { property: '--card', value: '36 36 58' },                // #24243a
    { property: '--card-foreground', value: '205 214 244' },
    { property: '--popover', value: '36 36 58' },
    { property: '--popover-foreground', value: '205 214 244' },
    { property: '--primary', value: '180 190 254' },          // #b4befe
    { property: '--primary-foreground', value: '30 30 48' },
    { property: '--secondary', value: '49 50 68' },           // #313244
    { property: '--secondary-foreground', value: '186 194 222' },
    { property: '--muted', value: '49 50 68' },
    { property: '--muted-foreground', value: '108 112 134' }, // #6c7086
    { property: '--accent', value: '59 61 94' },              // #3b3d5e
    { property: '--accent-foreground', value: '180 190 254' },
    { property: '--destructive', value: '243 139 168' },      // #f38ba8
    { property: '--destructive-foreground', value: '205 214 244' },
    { property: '--border', value: '108 112 134' },           // #6c7086
    { property: '--input', value: '88 91 112' },              // #585b70
    { property: '--ring', value: '180 190 254' },
    { property: '--sidebar-icon-color', value: '186 194 222' },
    { property: '--highlight', value: '250 179 135' },          // #fab387 - peach
    { property: '--highlight-foreground', value: '30 30 46' },
    { property: '--success', value: '166 227 161' },            // #a6e3a1 - green
    { property: '--success-foreground', value: '30 30 46' },
    { property: '--warning', value: '249 226 175' },            // #f9e2af - yellow
    { property: '--warning-foreground', value: '30 30 46' },
    { property: '--font-sans', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#3b3d5e' },
    { property: '--gem-sys-color--on-primary-container', value: '#b4befe' },
    { property: '--radius', value: '8px' },
  ],
};
