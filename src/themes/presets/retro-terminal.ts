/**
 * 💻 复古终端机 (Retro Terminal)
 *
 * 纯黑底色，完全剔除圆角，像素分割线。
 * 经典荧光绿 / 琥珀橙文字。
 * 全局等宽字体 (Fira Code / JetBrains Mono)。
 * 整个界面像一个专属的本地命令控制台。
 */

import type { ThemePreset } from '../types';

export const retroTerminal: ThemePreset = {
  id: 'retro-terminal',
  name: 'Retro Terminal',
  nameZh: '复古终端机',
  description:
    'CRT terminal aesthetic with neon green text and monospace typography',
  descriptionZh: '纯黑底色，荧光绿文字，等宽字体，硬核极客命令控制台',
  isPremium: true,
  preferredMode: 'dark',
  fonts: ['Fira+Code:wght@300;400;500;600', 'JetBrains+Mono:wght@300;400;500;600'],
  extraCss: `
/* Remove all rounded corners */
body.bs-theme--retro-terminal *,
body.bs-theme--retro-terminal *::before,
body.bs-theme--retro-terminal *::after {
  border-radius: 0 !important;
}

/* CRT scanline effect (very subtle) */
body.bs-theme--retro-terminal::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  opacity: 0.03;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 1px,
    rgba(0, 255, 65, 0.03) 1px,
    rgba(0, 255, 65, 0.03) 2px
  );
}

/* Monospace font override */
body.bs-theme--retro-terminal {
  font-family: 'Fira Code', 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace !important;
}

body.bs-theme--retro-terminal *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}

/* Pixel border style */
body.bs-theme--retro-terminal .mat-mdc-list-item {
  border-bottom: 1px solid #1a3a1a !important;
}

/* Glow effect on primary elements */
body.bs-theme--retro-terminal a,
body.bs-theme--retro-terminal .mat-mdc-button-base {
  text-shadow: 0 0 4px rgba(0, 255, 65, 0.3);
}

/* Terminal-style caret color on inputs and contenteditable */
body.bs-theme--retro-terminal input,
body.bs-theme--retro-terminal textarea,
body.bs-theme--retro-terminal [contenteditable="true"],
body.bs-theme--retro-terminal .ql-editor,
body.bs-theme--retro-terminal rich-textarea {
  caret-color: #00ff41;
  caret-shape: block;
}
`,
  variables: [
    // ─── Surface / Background (纯黑) ────────────────────────────────
    { property: '--gem-sys-color--surface', value: '#0a0a0a' },
    { property: '--gem-sys-color--surface-bright', value: '#121212' },
    { property: '--gem-sys-color--surface-dim', value: '#050505' },
    { property: '--gem-sys-color--surface-container', value: '#0f0f0f' },
    {
      property: '--gem-sys-color--surface-container-low',
      value: '#0c0c0c',
    },
    {
      property: '--gem-sys-color--surface-container-high',
      value: '#141414',
    },
    {
      property: '--gem-sys-color--surface-container-highest',
      value: '#1a1a1a',
    },
    {
      property: '--gem-sys-color--surface-container-lowest',
      value: '#000000',
    },
    { property: '--gem-sys-color--surface-variant', value: '#111111' },
    { property: '--mat-app-background-color', value: '#0a0a0a' },
    { property: '--lumi-sys-color--surface', value: '#0a0a0a' },
    { property: '--lumi-sys-color--surface-bright', value: '#121212' },
    { property: '--lumi-sys-color--surface-dim', value: '#050505' },
    {
      property: '--bard-color-synthetic--chat-window-surface',
      value: '#0a0a0a',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container',
      value: '#0f0f0f',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container-highest',
      value: '#1a1a1a',
    },
    { property: '--bard-color-sidenav-background-desktop', value: '#080808' },
    { property: '--bard-color-sidenav-background-mobile', value: '#0a0a0a' },

    // ─── Text (荧光绿 Neon Green) ───────────────────────────────────
    { property: '--gem-sys-color--on-surface', value: '#00ff41' },
    { property: '--gem-sys-color--on-surface-variant', value: '#00cc33' },
    { property: '--gem-sys-color--on-surface-low', value: '#008020' },
    { property: '--mat-app-text-color', value: '#00ff41' },
    { property: '--lumi-sys-color--on-surface', value: '#00ff41' },
    { property: '--bard-color-form-field-placeholder', value: '#006618' },

    // ─── Primary (Bright Green) ─────────────────────────────────────
    { property: '--gem-sys-color--primary', value: '#00ff41' },
    { property: '--gem-sys-color--on-primary', value: '#000000' },
    { property: '--gem-sys-color--primary-container', value: '#0a2a0a' },
    { property: '--gem-sys-color--on-primary-container', value: '#00ff41' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#00cc33' },
    { property: '--mat-focus-indicator-border-color', value: '#00ff41' },
    {
      property: '--mat-progress-spinner-active-indicator-color',
      value: '#00ff41',
    },

    // ─── Secondary (Amber / 琥珀橙) ────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#ffb000' },
    { property: '--gem-sys-color--on-secondary', value: '#000000' },
    { property: '--gem-sys-color--secondary-container', value: '#2a1f00' },
    { property: '--gem-sys-color--on-secondary-container', value: '#ffb000' },
    { property: '--gem-sys-color--tertiary-container', value: '#1a1a00' },

    // ─── Outline / Border (暗绿分割线) ──────────────────────────────
    { property: '--gem-sys-color--outline', value: '#1a3a1a' },
    { property: '--gem-sys-color--outline-variant', value: '#143014' },
    { property: '--gem-sys-color--outline-low', value: '#0f250f' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#00ff41' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#000000' },

    // ─── Error (Red Alert) ──────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#ff0033' },

    // ─── Brand Gradient (terminal colors) ───────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#00ff41' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#ffb000' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#00ccff' },

    // ─── Code Block (native terminal colors) ────────────────────────
    { property: '--bard-color-code-comment', value: '#4a7a4a' },
    { property: '--bard-color-code-variables', value: '#ff6b6b' },
    { property: '--bard-color-code-literal', value: '#ffb000' },
    { property: '--bard-color-code-class', value: '#00ccff' },
    { property: '--bard-color-code-string', value: '#00ff41' },
    { property: '--bard-color-code-quotes-and-meta', value: '#66d9ef' },
    { property: '--bard-color-code-keyword', value: '#ff79c6' },
    { property: '--lumi-sys-color--code-background', value: '#000000' },
    { property: '--lumi-sys-color--code-primary-text', value: '#00ff41' },
    { property: '--lumi-sys-color--code-grey-text', value: '#4a7a4a' },
    { property: '--lumi-sys-color--code-blue-text', value: '#66d9ef' },
    { property: '--lumi-sys-color--code-pink-text', value: '#ff79c6' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#ffb000' },
    { property: '--lumi-sys-color--code-green-text', value: '#00ff41' },
    { property: '--lumi-sys-color--code-red-text', value: '#ff6b6b' },
    { property: '--lumi-sys-color--code-purple-text', value: '#bd93f9' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#00ff41' },
    { property: '--mat-button-filled-label-text-color', value: '#000000' },
    { property: '--mat-button-tonal-container-color', value: '#0a2a0a' },
    { property: '--mat-button-tonal-label-text-color', value: '#00ff41' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#0f0f0f' },
    { property: '--mat-menu-item-label-text-color', value: '#00ff41' },
    { property: '--mat-menu-item-icon-color', value: '#00cc33' },
    { property: '--mat-menu-divider-color', value: '#1a3a1a' },
    {
      property: '--mat-menu-container-elevation-shadow',
      value: '0px 0px 8px rgba(0,255,65,0.15), 0px 2px 4px rgba(0,0,0,0.5)',
    },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#00ff41' },
    {
      property: '--mat-list-list-item-supporting-text-color',
      value: '#00cc33',
    },
    {
      property: '--mat-list-list-item-leading-icon-color',
      value: '#00cc33',
    },
    { property: '--mat-list-active-indicator-color', value: '#0a2a0a' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    {
      property: '--bard-color-zero-state-prompt-chip-background',
      value: '#0a2a0a',
    },
    {
      property: '--bard-color-zero-state-prompt-chip-text',
      value: '#00ff41',
    },

    // ─── Font override via CSS variable ─────────────────────────────
    {
      property: '--mat-menu-item-label-text-font',
      value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
    },
    {
      property: '--mat-list-list-item-label-text-font',
      value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
    },
    {
      property: '--mat-list-list-item-supporting-text-font',
      value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
    },
    {
      property: '--mat-button-text-label-text-font',
      value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
    },
    {
      property: '--mat-button-filled-label-text-font',
      value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
    },

    // ─── Shadows (green glow) ───────────────────────────────────────
    {
      property: '--mat-app-elevation-shadow-level-1',
      value: '0px 0px 4px rgba(0,255,65,0.1)',
    },
    {
      property: '--mat-app-elevation-shadow-level-2',
      value: '0px 0px 8px rgba(0,255,65,0.12)',
    },
    {
      property: '--mat-app-elevation-shadow-level-3',
      value: '0px 0px 12px rgba(0,255,65,0.15)',
    },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#0a2a0a' },
    { property: '--bard-color-processing-animation-color-2', value: '#003300' },
  ],
  sidebarVariables: [
    // Pure black terminal
    { property: '--background', value: '8 8 8' },            // #080808
    { property: '--foreground', value: '0 255 65' },          // #00ff41
    { property: '--card', value: '15 15 15' },                // #0f0f0f
    { property: '--card-foreground', value: '0 255 65' },
    { property: '--popover', value: '15 15 15' },
    { property: '--popover-foreground', value: '0 255 65' },
    { property: '--primary', value: '0 255 65' },             // #00ff41
    { property: '--primary-foreground', value: '0 0 0' },
    { property: '--secondary', value: '20 40 20' },           // dark green
    { property: '--secondary-foreground', value: '0 255 65' },
    { property: '--muted', value: '20 40 20' },
    { property: '--muted-foreground', value: '0 128 32' },    // #008020
    { property: '--accent', value: '10 42 10' },              // #0a2a0a
    { property: '--accent-foreground', value: '0 255 65' },
    { property: '--destructive', value: '255 0 51' },         // #ff0033
    { property: '--destructive-foreground', value: '0 0 0' },
    { property: '--border', value: '26 58 26' },              // #1a3a1a
    { property: '--input', value: '26 58 26' },
    { property: '--ring', value: '0 255 65' },
    { property: '--sidebar-icon-color', value: '0 204 51' },  // #00cc33
    { property: '--font-sans', value: '"Fira Code", "JetBrains Mono", "Cascadia Code", "Consolas", monospace' },
    { property: '--gem-sys-color--primary-container', value: '#0a2a0a' },
    { property: '--gem-sys-color--on-primary-container', value: '#00ff41' },
    { property: '--radius', value: '0px' },
  ],
};
