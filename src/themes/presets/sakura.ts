/**
 * 🌸 樱 (Sakura)
 *
 * 粉白底调配暖灰紫文字，玫红作主色、鼠尾草绿作配色 ——
 * 花与叶的关系。整套主题里此前没有任何粉调，
 * 玫瑰松是唯一沾玫瑰色的但它是深色。
 * 使用 Quicksand + Zen Maru Gothic 圆体，后者带 CJK 字形，
 * 中日文界面下不会掉回系统默认字体。
 */

import type { ThemePreset } from '../types';

export const sakura: ThemePreset = {
  id: 'sakura',
  name: 'Sakura',
  description:
    'Soft blossom light theme with rose and sage accents, paired with rounded typography',
  isPremium: true,
  preferredMode: 'light',
  fonts: ['Quicksand:wght@300;400;500;600;700', 'Zen+Maru+Gothic:wght@300;400;500;700'],
  extraCss: `
/* Faint blossom wash in the upper corners — no texture, just a tint */
body.bs-theme--sakura::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(60% 40% at 100% 0%, rgba(217,138,165,0.10) 0%, transparent 70%),
    radial-gradient(45% 35% at 0% 0%, rgba(125,154,118,0.07) 0%, transparent 70%);
}
`,
  fontCss: `
/* Rounded sans — Quicksand for Latin, Zen Maru Gothic for CJK */
body.bs-fonts--sakura {
  font-family: 'Quicksand', 'Zen Maru Gothic', 'PingFang SC', 'Microsoft YaHei', sans-serif !important;
}

body.bs-fonts--sakura *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Quicksand", "Zen Maru Gothic", sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Quicksand", "Zen Maru Gothic", sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Quicksand", "Zen Maru Gothic", sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Quicksand", "Zen Maru Gothic", sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Quicksand", "Zen Maru Gothic", sans-serif' },
  ],
  variables: [
    // ─── Surface / Background (Blossom White) ───────────────────────
    { property: '--gem-sys-color--surface', value: '#fff7f8' },
    { property: '--gem-sys-color--surface-bright', value: '#fffdfd' },
    { property: '--gem-sys-color--surface-dim', value: '#f7e9ec' },
    { property: '--gem-sys-color--surface-container', value: '#fdeff2' },
    { property: '--gem-sys-color--surface-container-low', value: '#fff3f5' },
    { property: '--gem-sys-color--surface-container-high', value: '#f9e4e8' },
    { property: '--gem-sys-color--surface-container-highest', value: '#f2d6dc' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#fffdfd' },
    { property: '--gem-sys-color--surface-variant', value: '#fbeaee' },
    { property: '--mat-app-background-color', value: '#fff7f8' },
    { property: '--lumi-sys-color--surface', value: '#fff7f8' },
    { property: '--lumi-sys-color--surface-bright', value: '#fffdfd' },
    { property: '--lumi-sys-color--surface-dim', value: '#f7e9ec' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#fff7f8' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#fdeff2' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#f2d6dc' },
    { property: '--bard-color-sidenav-background-desktop', value: '#fdeff2' },
    { property: '--bard-color-sidenav-background-mobile', value: '#fff3f5' },

    // ─── Text (Warm Plum Charcoal, 9.3:1 on the surface) ────────────
    { property: '--gem-sys-color--on-surface', value: '#4a3b40' },
    { property: '--gem-sys-color--on-surface-variant', value: '#6e5a60' },
    { property: '--gem-sys-color--on-surface-low', value: '#a4909a' },
    { property: '--mat-app-text-color', value: '#4a3b40' },
    { property: '--lumi-sys-color--on-surface', value: '#4a3b40' },
    { property: '--bard-color-form-field-placeholder', value: '#a4909a' },

    // ─── Primary (Blossom Rose) ─────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#c04f72' },
    { property: '--gem-sys-color--on-primary', value: '#fff7f8' },
    { property: '--gem-sys-color--primary-container', value: '#fadfe6' },
    { property: '--gem-sys-color--on-primary-container', value: '#7a2a45' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#d98aa5' },
    { property: '--mat-focus-indicator-border-color', value: '#c04f72' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#c04f72' },

    // ─── Secondary (Leaf Sage) ──────────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#7d9a76' },
    { property: '--gem-sys-color--on-secondary', value: '#fff7f8' },
    { property: '--gem-sys-color--secondary-container', value: '#e4ecdf' },
    { property: '--gem-sys-color--on-secondary-container', value: '#3f5a3a' },
    { property: '--gem-sys-color--tertiary-container', value: '#f9e4e8' },

    // ─── Outline / Border ───────────────────────────────────────────
    // Same rule as the other light presets: outline-low keeps a real step
    // below the surface so AI Studio's region dividers stay visible.
    { property: '--gem-sys-color--outline', value: '#c9b3ba' },
    { property: '--gem-sys-color--outline-variant', value: '#e7d3d9' },
    { property: '--gem-sys-color--outline-low', value: '#f0dde3' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#3a2c30' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#fff7f8' },

    // ─── Error ──────────────────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#c0392b' },

    // ─── Brand Gradient ─────────────────────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#c04f72' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#d98aa5' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#7d9a76' },

    // ─── Code Block ─────────────────────────────────────────────────
    { property: '--bard-color-code-comment', value: '#a4909a' },
    { property: '--bard-color-code-variables', value: '#b06a8a' },
    { property: '--bard-color-code-literal', value: '#c07a3a' },
    { property: '--bard-color-code-class', value: '#8a6aa8' },
    { property: '--bard-color-code-string', value: '#5f8a5a' },
    { property: '--bard-color-code-quotes-and-meta', value: '#7d9a76' },
    { property: '--bard-color-code-keyword', value: '#c04f72' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#c04f72' },
    { property: '--mat-button-filled-label-text-color', value: '#fff7f8' },
    { property: '--mat-button-tonal-container-color', value: '#fadfe6' },
    { property: '--mat-button-tonal-label-text-color', value: '#7a2a45' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#fff7f8' },
    { property: '--mat-menu-item-label-text-color', value: '#4a3b40' },
    { property: '--mat-menu-item-icon-color', value: '#6e5a60' },
    { property: '--mat-menu-divider-color', value: '#f0dde3' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 18px rgba(122,42,69,0.10), 0px 1px 4px rgba(122,42,69,0.06)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#4a3b40' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#6e5a60' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#6e5a60' },
    { property: '--mat-list-active-indicator-color', value: '#fadfe6' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#fadfe6' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#7a2a45' },
  ],
  sidebarVariables: [
    { property: '--background', value: '253 239 242' },        // #fdeff2
    { property: '--foreground', value: '74 59 64' },           // #4a3b40
    { property: '--card', value: '255 247 248' },              // #fff7f8
    { property: '--card-foreground', value: '74 59 64' },
    { property: '--popover', value: '255 247 248' },
    { property: '--popover-foreground', value: '74 59 64' },
    { property: '--primary', value: '192 79 114' },            // #c04f72
    { property: '--primary-foreground', value: '255 247 248' },
    { property: '--secondary', value: '249 228 232' },         // #f9e4e8
    { property: '--secondary-foreground', value: '110 90 96' },
    { property: '--muted', value: '249 228 232' },
    { property: '--muted-foreground', value: '164 144 154' },  // #a4909a
    { property: '--accent', value: '250 223 230' },            // #fadfe6
    { property: '--accent-foreground', value: '122 42 69' },
    { property: '--destructive', value: '192 57 43' },          // #c0392b
    { property: '--destructive-foreground', value: '255 247 248' },
    { property: '--border', value: '201 179 186' },             // #c9b3ba
    { property: '--input', value: '231 211 217' },              // #e7d3d9
    { property: '--ring', value: '192 79 114' },
    { property: '--sidebar-icon-color', value: '110 90 96' },   // #6e5a60
    { property: '--highlight', value: '217 138 165' },           // #d98aa5 - petal pink
    { property: '--highlight-foreground', value: '58 44 48' },
    { property: '--success', value: '125 154 118' },             // #7d9a76 - leaf sage
    { property: '--success-foreground', value: '255 247 248' },
    { property: '--warning', value: '192 122 58' },              // #c07a3a - warm amber
    { property: '--warning-foreground', value: '255 247 248' },
    { property: '--font-sans', value: '"Quicksand", "Zen Maru Gothic", "PingFang SC", "Microsoft YaHei", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#fadfe6' },
    { property: '--gem-sys-color--on-primary-container', value: '#7a2a45' },
    { property: '--radius', value: '12px' },
  ],
};
