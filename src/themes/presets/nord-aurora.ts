/**
 * 🌌 北极光 (Nord Aurora)
 *
 * 灵感来自北欧极地的冷色调配色方案。
 * 深蓝灰底色搭配冰蓝、霜绿 accent，
 * 营造宁静、专注的深色工作环境。
 * 使用 Inter 无衬线字体，干净现代。
 */

import type { ThemePreset } from '../types';

export const nordAurora: ThemePreset = {
  id: 'nord-aurora',
  name: 'Nord Aurora',
  description:
    'Arctic-inspired dark theme with cool blues and frost green accents',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['Inter:wght@300;400;500;600'],
  fontCss: `
/* Nord Aurora font override */
body.bs-fonts--nord-aurora {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

body.bs-fonts--nord-aurora *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif' },
  ],
  variables: [
    // ─── Surface / Background (Nord Polar Night) ────────────────────
    { property: '--gem-sys-color--surface', value: '#2e3440' },
    { property: '--gem-sys-color--surface-bright', value: '#3b4252' },
    { property: '--gem-sys-color--surface-dim', value: '#242933' },
    { property: '--gem-sys-color--surface-container', value: '#333a47' },
    { property: '--gem-sys-color--surface-container-low', value: '#2e3440' },
    { property: '--gem-sys-color--surface-container-high', value: '#3b4252' },
    { property: '--gem-sys-color--surface-container-highest', value: '#434c5e' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#242933' },
    { property: '--gem-sys-color--surface-variant', value: '#3b4252' },
    { property: '--mat-app-background-color', value: '#2e3440' },
    { property: '--lumi-sys-color--surface', value: '#2e3440' },
    { property: '--lumi-sys-color--surface-bright', value: '#3b4252' },
    { property: '--lumi-sys-color--surface-dim', value: '#242933' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#2e3440' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#333a47' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#434c5e' },
    { property: '--bard-color-sidenav-background-desktop', value: '#292e39' },
    { property: '--bard-color-sidenav-background-mobile', value: '#2e3440' },

    // ─── Text (Nord Snow Storm) ─────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#eceff4' },
    { property: '--gem-sys-color--on-surface-variant', value: '#d8dee9' },
    { property: '--gem-sys-color--on-surface-low', value: '#7b88a1' },
    { property: '--mat-app-text-color', value: '#eceff4' },
    { property: '--lumi-sys-color--on-surface', value: '#eceff4' },
    { property: '--bard-color-form-field-placeholder', value: '#7b88a1' },

    // ─── Primary (Nord Frost - Ice Blue) ────────────────────────────
    { property: '--gem-sys-color--primary', value: '#88c0d0' },
    { property: '--gem-sys-color--on-primary', value: '#1a2a30' },
    { property: '--gem-sys-color--primary-container', value: '#2e4a54' },
    { property: '--gem-sys-color--on-primary-container', value: '#88c0d0' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#5e9dad' },
    { property: '--mat-focus-indicator-border-color', value: '#88c0d0' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#88c0d0' },

    // ─── Secondary (Nord Frost - Teal) ──────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#8fbcbb' },
    { property: '--gem-sys-color--on-secondary', value: '#1a2d2d' },
    { property: '--gem-sys-color--secondary-container', value: '#2e4848' },
    { property: '--gem-sys-color--on-secondary-container', value: '#8fbcbb' },
    { property: '--gem-sys-color--tertiary-container', value: '#2e3d48' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#4c566a' },
    { property: '--gem-sys-color--outline-variant', value: '#434c5e' },
    { property: '--gem-sys-color--outline-low', value: '#3b4252' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#eceff4' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#2e3440' },

    // ─── Error (Nord Aurora Red) ────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#bf616a' },

    // ─── Brand Gradient (aurora colors) ─────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#88c0d0' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#b48ead' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#a3be8c' },

    // ─── Code Block (Nord palette) ──────────────────────────────────
    { property: '--bard-color-code-comment', value: '#616e88' },
    { property: '--bard-color-code-variables', value: '#bf616a' },
    { property: '--bard-color-code-literal', value: '#d08770' },
    { property: '--bard-color-code-class', value: '#ebcb8b' },
    { property: '--bard-color-code-string', value: '#a3be8c' },
    { property: '--bard-color-code-quotes-and-meta', value: '#88c0d0' },
    { property: '--bard-color-code-keyword', value: '#81a1c1' },
    { property: '--lumi-sys-color--code-background', value: '#242933' },
    { property: '--lumi-sys-color--code-primary-text', value: '#eceff4' },
    { property: '--lumi-sys-color--code-grey-text', value: '#616e88' },
    { property: '--lumi-sys-color--code-blue-text', value: '#81a1c1' },
    { property: '--lumi-sys-color--code-pink-text', value: '#b48ead' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#ebcb8b' },
    { property: '--lumi-sys-color--code-green-text', value: '#a3be8c' },
    { property: '--lumi-sys-color--code-red-text', value: '#bf616a' },
    { property: '--lumi-sys-color--code-purple-text', value: '#b48ead' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#88c0d0' },
    { property: '--mat-button-filled-label-text-color', value: '#1a2a30' },
    { property: '--mat-button-tonal-container-color', value: '#2e4a54' },
    { property: '--mat-button-tonal-label-text-color', value: '#88c0d0' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#333a47' },
    { property: '--mat-menu-item-label-text-color', value: '#eceff4' },
    { property: '--mat-menu-item-icon-color', value: '#d8dee9' },
    { property: '--mat-menu-divider-color', value: '#4c566a' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.3), 0px 2px 6px rgba(0,0,0,0.2)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#eceff4' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#d8dee9' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#d8dee9' },
    { property: '--mat-list-active-indicator-color', value: '#2e4a54' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#2e4a54' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#88c0d0' },


    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.25)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.3)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.35)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#2e4a54' },
    { property: '--bard-color-processing-animation-color-2', value: '#3b4252' },
  ],
  sidebarVariables: [
    { property: '--background', value: '41 46 57' },          // #292e39
    { property: '--foreground', value: '236 239 244' },       // #eceff4
    { property: '--card', value: '51 58 71' },                // #333a47
    { property: '--card-foreground', value: '236 239 244' },
    { property: '--popover', value: '51 58 71' },
    { property: '--popover-foreground', value: '236 239 244' },
    { property: '--primary', value: '136 192 208' },          // #88c0d0
    { property: '--primary-foreground', value: '26 42 48' },
    { property: '--secondary', value: '59 66 82' },           // #3b4252
    { property: '--secondary-foreground', value: '216 222 233' },
    { property: '--muted', value: '59 66 82' },
    { property: '--muted-foreground', value: '123 136 161' }, // #7b88a1
    { property: '--accent', value: '46 74 84' },              // #2e4a54
    { property: '--accent-foreground', value: '136 192 208' },
    { property: '--destructive', value: '191 97 106' },       // #bf616a
    { property: '--destructive-foreground', value: '236 239 244' },
    { property: '--border', value: '76 86 106' },             // #4c566a
    { property: '--input', value: '67 76 94' },               // #434c5e
    { property: '--ring', value: '136 192 208' },
    { property: '--sidebar-icon-color', value: '216 222 233' },
    { property: '--highlight', value: '191 97 106' },           // #bf616a - nord red (aurora)
    { property: '--highlight-foreground', value: '236 239 244' },
    { property: '--success', value: '163 190 140' },            // #a3be8c - nord green (aurora)
    { property: '--success-foreground', value: '46 52 64' },
    { property: '--warning', value: '235 203 139' },            // #ebcb8b - nord yellow (aurora)
    { property: '--warning-foreground', value: '46 52 64' },
    { property: '--font-sans', value: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#2e4a54' },
    { property: '--gem-sys-color--on-primary-container', value: '#88c0d0' },
    { property: '--radius', value: '8px' },
  ],
};
