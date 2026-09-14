/**
 * 🔮 午夜紫 (Midnight Purple)
 *
 * 深邃的纯黑底色搭配紫色和靛蓝渐变点缀，
 * 营造出神秘深邃的午夜氛围。
 * 使用 Space Grotesk 几何无衬线字体，现代感十足。
 */

import type { ThemePreset } from '../types';

export const midnightPurple: ThemePreset = {
  id: 'midnight-purple',
  name: 'Midnight Purple',
  description:
    'Deep black with purple and indigo gradient accents',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['Space+Grotesk:wght@300;400;500;600'],
  fontCss: `
/* Midnight Purple font override */
body.bs-fonts--midnight-purple {
  font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
}

body.bs-fonts--midnight-purple *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif' },
  ],
  variables: [
    // ─── Surface / Background ───────────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#0d0d14' },
    { property: '--gem-sys-color--surface-bright', value: '#1a1a2e' },
    { property: '--gem-sys-color--surface-dim', value: '#08080e' },
    { property: '--gem-sys-color--surface-container', value: '#141422' },
    { property: '--gem-sys-color--surface-container-low', value: '#0d0d14' },
    { property: '--gem-sys-color--surface-container-high', value: '#1a1a2e' },
    { property: '--gem-sys-color--surface-container-highest', value: '#252540' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#08080e' },
    { property: '--gem-sys-color--surface-variant', value: '#1a1a2e' },
    { property: '--mat-app-background-color', value: '#0d0d14' },
    { property: '--lumi-sys-color--surface', value: '#0d0d14' },
    { property: '--lumi-sys-color--surface-bright', value: '#1a1a2e' },
    { property: '--lumi-sys-color--surface-dim', value: '#08080e' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#0d0d14' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#141422' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#252540' },
    { property: '--bard-color-sidenav-background-desktop', value: '#0a0a10' },
    { property: '--bard-color-sidenav-background-mobile', value: '#0d0d14' },

    // ─── Text ───────────────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#e4e4f0' },
    { property: '--gem-sys-color--on-surface-variant', value: '#c8c8e0' },
    { property: '--gem-sys-color--on-surface-low', value: '#4a4a6a' },
    { property: '--mat-app-text-color', value: '#e4e4f0' },
    { property: '--lumi-sys-color--on-surface', value: '#e4e4f0' },
    { property: '--bard-color-form-field-placeholder', value: '#4a4a6a' },

    // ─── Primary ────────────────────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#8b5cf6' },
    { property: '--gem-sys-color--on-primary', value: '#1a0e30' },
    { property: '--gem-sys-color--primary-container', value: '#2e1a5e' },
    { property: '--gem-sys-color--on-primary-container', value: '#8b5cf6' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#6d3fd4' },
    { property: '--mat-focus-indicator-border-color', value: '#8b5cf6' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#8b5cf6' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#6366f1' },
    { property: '--gem-sys-color--on-secondary', value: '#0e0e30' },
    { property: '--gem-sys-color--secondary-container', value: '#1e1e5a' },
    { property: '--gem-sys-color--on-secondary-container', value: '#6366f1' },
    { property: '--gem-sys-color--tertiary-container', value: '#1a1a2e' },

    // ─── Outline / Border ───────────────────────────────────────────
    { property: '--gem-sys-color--outline', value: '#4a4a6a' },
    { property: '--gem-sys-color--outline-variant', value: '#35354f' },
    { property: '--gem-sys-color--outline-low', value: '#1a1a2e' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#e4e4f0' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#0d0d14' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#ef4444' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#8b5cf6' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#6366f1' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#a78bfa' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#4a4a6a' },
    { property: '--bard-color-code-variables', value: '#a78bfa' },
    { property: '--bard-color-code-literal', value: '#6366f1' },
    { property: '--bard-color-code-class', value: '#f59e0b' },
    { property: '--bard-color-code-string', value: '#34d399' },
    { property: '--bard-color-code-quotes-and-meta', value: '#818cf8' },
    { property: '--bard-color-code-keyword', value: '#8b5cf6' },
    { property: '--lumi-sys-color--code-background', value: '#08080e' },
    { property: '--lumi-sys-color--code-primary-text', value: '#e4e4f0' },
    { property: '--lumi-sys-color--code-grey-text', value: '#4a4a6a' },
    { property: '--lumi-sys-color--code-blue-text', value: '#818cf8' },
    { property: '--lumi-sys-color--code-pink-text', value: '#f472b6' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#f59e0b' },
    { property: '--lumi-sys-color--code-green-text', value: '#34d399' },
    { property: '--lumi-sys-color--code-red-text', value: '#ef4444' },
    { property: '--lumi-sys-color--code-purple-text', value: '#a78bfa' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#8b5cf6' },
    { property: '--mat-button-filled-label-text-color', value: '#1a0e30' },
    { property: '--mat-button-tonal-container-color', value: '#2e1a5e' },
    { property: '--mat-button-tonal-label-text-color', value: '#8b5cf6' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#141422' },
    { property: '--mat-menu-item-label-text-color', value: '#e4e4f0' },
    { property: '--mat-menu-item-icon-color', value: '#c8c8e0' },
    { property: '--mat-menu-divider-color', value: '#4a4a6a' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.5), 0px 2px 6px rgba(0,0,0,0.35)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#e4e4f0' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#c8c8e0' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#c8c8e0' },
    { property: '--mat-list-active-indicator-color', value: '#2e1a5e' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#2e1a5e' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#8b5cf6' },

    // ─── Shadows ────────────────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 4px rgba(0,0,0,0.4)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 8px rgba(0,0,0,0.45)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 16px rgba(0,0,0,0.5)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#2e1a5e' },
    { property: '--bard-color-processing-animation-color-2', value: '#141422' },
  ],
  sidebarVariables: [
    { property: '--background', value: '10 10 16' },          // #0a0a10
    { property: '--foreground', value: '228 228 240' },       // #e4e4f0
    { property: '--card', value: '20 20 34' },                // #141422
    { property: '--card-foreground', value: '228 228 240' },
    { property: '--popover', value: '20 20 34' },
    { property: '--popover-foreground', value: '228 228 240' },
    { property: '--primary', value: '139 92 246' },           // #8b5cf6
    { property: '--primary-foreground', value: '26 14 48' },
    { property: '--secondary', value: '26 26 46' },           // #1a1a2e
    { property: '--secondary-foreground', value: '200 200 224' },
    { property: '--muted', value: '26 26 46' },
    { property: '--muted-foreground', value: '74 74 106' },   // #4a4a6a
    { property: '--accent', value: '46 26 94' },              // #2e1a5e
    { property: '--accent-foreground', value: '139 92 246' },
    { property: '--destructive', value: '239 68 68' },        // #ef4444
    { property: '--destructive-foreground', value: '228 228 240' },
    { property: '--border', value: '74 74 106' },             // #4a4a6a
    { property: '--input', value: '53 53 79' },               // #35354f
    { property: '--ring', value: '139 92 246' },
    { property: '--sidebar-icon-color', value: '200 200 224' },
    { property: '--highlight', value: '99 102 241' },           // #6366f1 - indigo
    { property: '--highlight-foreground', value: '255 255 255' },
    { property: '--success', value: '52 211 153' },             // #34d399 - emerald
    { property: '--success-foreground', value: '15 23 42' },
    { property: '--warning', value: '251 191 36' },             // #fbbf24 - amber
    { property: '--warning-foreground', value: '15 23 42' },
    { property: '--font-sans', value: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#2e1a5e' },
    { property: '--gem-sys-color--on-primary-container', value: '#8b5cf6' },
    { property: '--radius', value: '8px' },
  ],
};
