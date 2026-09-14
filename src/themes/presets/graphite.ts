/**
 * ◼ 石墨 (Graphite)
 *
 * 零彩度浅色主题：底色、文字、边框、主色的 R=G=B 全部相等，
 * 层级只靠明度拉开。整套主题里此前每一个的底色都带色相，
 * 这是「不要个性只要清楚」的那个选项。
 *
 * 唯一的例外是 error / success / warning 三个语义色 ——
 * 它们是要靠颜色本身传达含义的，做成灰色等于取消了这个功能。
 * 所以只有这三个保留了低饱和的色相，其余一律纯灰。
 * 代码高亮同样不用色相，改用大跨度的明度差来建立层级。
 *
 * 使用 Manrope。
 */

import type { ThemePreset } from '../types';

export const graphite: ThemePreset = {
  id: 'graphite',
  name: 'Graphite',
  description:
    'Pure grayscale light theme where hierarchy comes from lightness alone, not hue',
  isPremium: true,
  preferredMode: 'light',
  // zero-chroma theme; keep the wash faint so it stays achromatic
  lmGlow: { intensity: 0.4 },
  fonts: ['Manrope:wght@300;400;500;600;700'],
  fontCss: `
/* Neutral grotesk */
body.bs-fonts--graphite {
  font-family: 'Manrope', 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
}

body.bs-fonts--graphite *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Manrope", "Inter", sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Manrope", "Inter", sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Manrope", "Inter", sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Manrope", "Inter", sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Manrope", "Inter", sans-serif' },
  ],
  variables: [
    // ─── Surface / Background (Neutral Grey, zero chroma) ───────────
    { property: '--gem-sys-color--surface', value: '#fafafa' },
    { property: '--gem-sys-color--surface-bright', value: '#ffffff' },
    { property: '--gem-sys-color--surface-dim', value: '#f0f0f0' },
    { property: '--gem-sys-color--surface-container', value: '#f5f5f5' },
    { property: '--gem-sys-color--surface-container-low', value: '#f7f7f7' },
    { property: '--gem-sys-color--surface-container-high', value: '#ebebeb' },
    { property: '--gem-sys-color--surface-container-highest', value: '#e0e0e0' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#ffffff' },
    { property: '--gem-sys-color--surface-variant', value: '#f0f0f0' },
    { property: '--mat-app-background-color', value: '#fafafa' },
    { property: '--lumi-sys-color--surface', value: '#fafafa' },
    { property: '--lumi-sys-color--surface-bright', value: '#ffffff' },
    { property: '--lumi-sys-color--surface-dim', value: '#f0f0f0' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#fafafa' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#f5f5f5' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#e0e0e0' },
    { property: '--bard-color-sidenav-background-desktop', value: '#f2f2f2' },
    { property: '--bard-color-sidenav-background-mobile', value: '#f7f7f7' },

    // ─── Text (Ink Grey) ────────────────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#171717' },
    { property: '--gem-sys-color--on-surface-variant', value: '#404040' },
    { property: '--gem-sys-color--on-surface-low', value: '#8c8c8c' },
    { property: '--mat-app-text-color', value: '#171717' },
    { property: '--lumi-sys-color--on-surface', value: '#171717' },
    { property: '--bard-color-form-field-placeholder', value: '#8c8c8c' },

    // ─── Primary (the accent is simply ink) ─────────────────────────
    { property: '--gem-sys-color--primary', value: '#262626' },
    { property: '--gem-sys-color--on-primary', value: '#fafafa' },
    { property: '--gem-sys-color--primary-container', value: '#e5e5e5' },
    { property: '--gem-sys-color--on-primary-container', value: '#171717' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#737373' },
    { property: '--mat-focus-indicator-border-color', value: '#262626' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#262626' },

    // ─── Secondary ──────────────────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#525252' },
    { property: '--gem-sys-color--on-secondary', value: '#fafafa' },
    { property: '--gem-sys-color--secondary-container', value: '#ebebeb' },
    { property: '--gem-sys-color--on-secondary-container', value: '#262626' },
    { property: '--gem-sys-color--tertiary-container', value: '#f0f0f0' },

    // ─── Outline / Border ───────────────────────────────────────────
    // outline-low keeps a real step below the surface (~21 per channel);
    // AI Studio's region dividers read from it.
    { property: '--gem-sys-color--outline', value: '#b8b8b8' },
    { property: '--gem-sys-color--outline-variant', value: '#d4d4d4' },
    { property: '--gem-sys-color--outline-low', value: '#e5e5e5' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#171717' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#fafafa' },

    // ─── Error (the one place hue is allowed to carry meaning) ──────
    { property: '--gem-sys-color--error', value: '#b91c1c' },

    // ─── Brand Gradient (monochrome by design) ──────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#171717' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#525252' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#8c8c8c' },

    // ─── Code Block (hierarchy from lightness, not hue) ─────────────
    { property: '--bard-color-code-comment', value: '#a3a3a3' },
    { property: '--bard-color-code-variables', value: '#404040' },
    { property: '--bard-color-code-literal', value: '#737373' },
    { property: '--bard-color-code-class', value: '#262626' },
    { property: '--bard-color-code-string', value: '#525252' },
    { property: '--bard-color-code-quotes-and-meta', value: '#8c8c8c' },
    { property: '--bard-color-code-keyword', value: '#0a0a0a' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#262626' },
    { property: '--mat-button-filled-label-text-color', value: '#fafafa' },
    { property: '--mat-button-tonal-container-color', value: '#ebebeb' },
    { property: '--mat-button-tonal-label-text-color', value: '#262626' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#ffffff' },
    { property: '--mat-menu-item-label-text-color', value: '#171717' },
    { property: '--mat-menu-item-icon-color', value: '#404040' },
    { property: '--mat-menu-divider-color', value: '#e5e5e5' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 16px rgba(0,0,0,0.08), 0px 1px 4px rgba(0,0,0,0.05)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#171717' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#404040' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#404040' },
    { property: '--mat-list-active-indicator-color', value: '#e5e5e5' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#ebebeb' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#262626' },
  ],
  sidebarVariables: [
    { property: '--background', value: '242 242 242' },        // #f2f2f2
    { property: '--foreground', value: '23 23 23' },           // #171717
    { property: '--card', value: '250 250 250' },              // #fafafa
    { property: '--card-foreground', value: '23 23 23' },
    { property: '--popover', value: '255 255 255' },
    { property: '--popover-foreground', value: '23 23 23' },
    { property: '--primary', value: '38 38 38' },              // #262626
    { property: '--primary-foreground', value: '250 250 250' },
    { property: '--secondary', value: '235 235 235' },         // #ebebeb
    { property: '--secondary-foreground', value: '38 38 38' },
    { property: '--muted', value: '240 240 240' },             // #f0f0f0
    { property: '--muted-foreground', value: '140 140 140' },  // #8c8c8c
    { property: '--accent', value: '229 229 229' },            // #e5e5e5
    { property: '--accent-foreground', value: '23 23 23' },
    { property: '--destructive', value: '185 28 28' },          // #b91c1c
    { property: '--destructive-foreground', value: '250 250 250' },
    { property: '--border', value: '184 184 184' },             // #b8b8b8
    { property: '--input', value: '212 212 212' },              // #d4d4d4
    { property: '--ring', value: '38 38 38' },
    { property: '--sidebar-icon-color', value: '64 64 64' },    // #404040
    // Emphasis is expressed as darkness rather than colour, to stay achromatic
    { property: '--highlight', value: '38 38 38' },
    { property: '--highlight-foreground', value: '250 250 250' },
    // Status colours keep a desaturated hue: greying them out would remove the
    // only thing that tells success apart from warning.
    { property: '--success', value: '63 107 74' },              // #3f6b4a
    { property: '--success-foreground', value: '250 250 250' },
    { property: '--warning', value: '138 106 31' },             // #8a6a1f
    { property: '--warning-foreground', value: '250 250 250' },
    { property: '--font-sans', value: '"Manrope", "Inter", "PingFang SC", "Microsoft YaHei", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#e5e5e5' },
    { property: '--gem-sys-color--on-primary-container', value: '#171717' },
    { property: '--radius', value: '4px' },
  ],
};
