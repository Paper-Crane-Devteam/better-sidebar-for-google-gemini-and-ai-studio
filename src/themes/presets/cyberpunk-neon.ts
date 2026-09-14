/**
 * 🌃 赛博朋克 (Cyberpunk Neon)
 *
 * 来自未来都市的霓虹灯光。
 * 深黑底色搭配品红和电光蓝的渐变高亮，
 * 强烈的视觉冲击力和未来感。
 * 使用 Orbitron / Space Grotesk 几何字体。
 */

import type { ThemePreset } from '../types';

export const cyberpunkNeon: ThemePreset = {
  id: 'cyberpunk-neon',
  name: 'Cyberpunk Neon',
  description:
    'Futuristic neon aesthetic with magenta and electric blue on deep black',
  isPremium: true,
  preferredMode: 'dark',
  // neon signage wants a denser halo
  lmGlow: { blur: '95px' },
  fonts: ['Space+Grotesk:wght@300;400;500;600;700', 'Orbitron:wght@400;500;600;700'],
  extraCss: `
/* Neon glow on primary text and links */
body.bs-theme--cyberpunk-neon a,
body.bs-theme--cyberpunk-neon .mat-mdc-button-base {
  text-shadow: 0 0 6px rgba(255, 0, 128, 0.4);
}

/* Subtle grid pattern background */
body.bs-theme--cyberpunk-neon::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.02;
  background-image: 
    linear-gradient(rgba(255, 0, 128, 0.3) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 0, 128, 0.3) 1px, transparent 1px);
  background-size: 40px 40px;
}

/* Neon border glow on focus */
body.bs-theme--cyberpunk-neon input:focus,
body.bs-theme--cyberpunk-neon textarea:focus,
body.bs-theme--cyberpunk-neon [contenteditable="true"]:focus {
  box-shadow: 0 0 8px rgba(255, 0, 128, 0.4), 0 0 16px rgba(0, 200, 255, 0.2) !important;
}
`,
  fontCss: `
/* Geometric font */
body.bs-fonts--cyberpunk-neon {
  font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif !important;
}

body.bs-fonts--cyberpunk-neon *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}

/* Headings use Orbitron for extra futuristic feel */
body.bs-fonts--cyberpunk-neon h1,
body.bs-fonts--cyberpunk-neon h2,
body.bs-fonts--cyberpunk-neon h3 {
  font-family: 'Orbitron', 'Space Grotesk', sans-serif !important;
  letter-spacing: 0.5px;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Space Grotesk", -apple-system, sans-serif' },
    { property: '--mat-list-list-item-label-text-font', value: '"Space Grotesk", -apple-system, sans-serif' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Space Grotesk", -apple-system, sans-serif' },
    { property: '--mat-button-text-label-text-font', value: '"Space Grotesk", -apple-system, sans-serif' },
    { property: '--mat-button-filled-label-text-font', value: '"Space Grotesk", -apple-system, sans-serif' },
  ],
  variables: [
    // ─── Surface / Background (Deep Black) ──────────────────────────
    { property: '--gem-sys-color--surface', value: '#0a0a0f' },
    { property: '--gem-sys-color--surface-bright', value: '#141420' },
    { property: '--gem-sys-color--surface-dim', value: '#050508' },
    { property: '--gem-sys-color--surface-container', value: '#0f0f18' },
    { property: '--gem-sys-color--surface-container-low', value: '#0c0c14' },
    { property: '--gem-sys-color--surface-container-high', value: '#161622' },
    { property: '--gem-sys-color--surface-container-highest', value: '#1e1e2e' },
    { property: '--gem-sys-color--surface-container-lowest', value: '#000000' },
    { property: '--gem-sys-color--surface-variant', value: '#12121c' },
    { property: '--mat-app-background-color', value: '#0a0a0f' },
    { property: '--lumi-sys-color--surface', value: '#0a0a0f' },
    { property: '--lumi-sys-color--surface-bright', value: '#141420' },
    { property: '--lumi-sys-color--surface-dim', value: '#050508' },
    { property: '--bard-color-synthetic--chat-window-surface', value: '#0a0a0f' },
    { property: '--bard-color-synthetic--chat-window-surface-container', value: '#0f0f18' },
    { property: '--bard-color-synthetic--chat-window-surface-container-highest', value: '#1e1e2e' },
    { property: '--bard-color-sidenav-background-desktop', value: '#08080c' },
    { property: '--bard-color-sidenav-background-mobile', value: '#0a0a0f' },

    // ─── Text (Cool White with slight blue tint) ────────────────────
    { property: '--gem-sys-color--on-surface', value: '#e8e8f0' },
    { property: '--gem-sys-color--on-surface-variant', value: '#b0b0c8' },
    { property: '--gem-sys-color--on-surface-low', value: '#6a6a88' },
    { property: '--mat-app-text-color', value: '#e8e8f0' },
    { property: '--lumi-sys-color--on-surface', value: '#e8e8f0' },
    { property: '--bard-color-form-field-placeholder', value: '#6a6a88' },

    // ─── Primary (Neon Magenta / Hot Pink) ──────────────────────────
    { property: '--gem-sys-color--primary', value: '#ff0080' },
    { property: '--gem-sys-color--on-primary', value: '#ffffff' },
    { property: '--gem-sys-color--primary-container', value: '#2a0020' },
    { property: '--gem-sys-color--on-primary-container', value: '#ff66b2' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#cc0066' },
    { property: '--mat-focus-indicator-border-color', value: '#ff0080' },
    { property: '--mat-progress-spinner-active-indicator-color', value: '#ff0080' },

    // ─── Secondary (Electric Cyan / Blue) ───────────────────────────
    { property: '--gem-sys-color--secondary', value: '#00c8ff' },
    { property: '--gem-sys-color--on-secondary', value: '#001a22' },
    { property: '--gem-sys-color--secondary-container', value: '#002838' },
    { property: '--gem-sys-color--on-secondary-container', value: '#66e0ff' },
    { property: '--gem-sys-color--tertiary-container', value: '#1a0030' },

    // ─── Outline / Border (Dark with neon hint) ─────────────────────
    { property: '--gem-sys-color--outline', value: '#2a2a40' },
    { property: '--gem-sys-color--outline-variant', value: '#1e1e30' },
    { property: '--gem-sys-color--outline-low', value: '#141422' },

    // ─── Inverse ────────────────────────────────────────────────────
    { property: '--gem-sys-color--inverse-surface', value: '#e8e8f0' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#0a0a0f' },

    // ─── Error (Neon Red) ───────────────────────────────────────────
    { property: '--gem-sys-color--error', value: '#ff2255' },

    // ─── Brand Gradient (Neon spectrum) ─────────────────────────────
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#ff0080' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#8000ff' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#00c8ff' },

    // ─── Code Block (Neon colors) ───────────────────────────────────
    { property: '--bard-color-code-comment', value: '#4a4a66' },
    { property: '--bard-color-code-variables', value: '#ff6b9d' },
    { property: '--bard-color-code-literal', value: '#ffb86c' },
    { property: '--bard-color-code-class', value: '#00c8ff' },
    { property: '--bard-color-code-string', value: '#50fa7b' },
    { property: '--bard-color-code-quotes-and-meta', value: '#8be9fd' },
    { property: '--bard-color-code-keyword', value: '#ff0080' },
    { property: '--lumi-sys-color--code-background', value: '#050508' },
    { property: '--lumi-sys-color--code-primary-text', value: '#e8e8f0' },
    { property: '--lumi-sys-color--code-grey-text', value: '#4a4a66' },
    { property: '--lumi-sys-color--code-blue-text', value: '#00c8ff' },
    { property: '--lumi-sys-color--code-pink-text', value: '#ff0080' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#ffb86c' },
    { property: '--lumi-sys-color--code-green-text', value: '#50fa7b' },
    { property: '--lumi-sys-color--code-red-text', value: '#ff6b9d' },
    { property: '--lumi-sys-color--code-purple-text', value: '#bd93f9' },

    // ─── Buttons ────────────────────────────────────────────────────
    { property: '--mat-button-filled-container-color', value: '#ff0080' },
    { property: '--mat-button-filled-label-text-color', value: '#ffffff' },
    { property: '--mat-button-tonal-container-color', value: '#2a0020' },
    { property: '--mat-button-tonal-label-text-color', value: '#ff66b2' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#0f0f18' },
    { property: '--mat-menu-item-label-text-color', value: '#e8e8f0' },
    { property: '--mat-menu-item-icon-color', value: '#b0b0c8' },
    { property: '--mat-menu-divider-color', value: '#2a2a40' },
    { property: '--mat-menu-container-elevation-shadow', value: '0px 4px 20px rgba(255,0,128,0.1), 0px 2px 8px rgba(0,0,0,0.4)' },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#e8e8f0' },
    { property: '--mat-list-list-item-supporting-text-color', value: '#b0b0c8' },
    { property: '--mat-list-list-item-leading-icon-color', value: '#b0b0c8' },
    { property: '--mat-list-active-indicator-color', value: '#2a0020' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    { property: '--bard-color-zero-state-prompt-chip-background', value: '#2a0020' },
    { property: '--bard-color-zero-state-prompt-chip-text', value: '#ff66b2' },

    // ─── Shadows (neon glow) ────────────────────────────────────────
    { property: '--mat-app-elevation-shadow-level-1', value: '0px 2px 8px rgba(255,0,128,0.08)' },
    { property: '--mat-app-elevation-shadow-level-2', value: '0px 4px 12px rgba(255,0,128,0.1)' },
    { property: '--mat-app-elevation-shadow-level-3', value: '0px 8px 24px rgba(255,0,128,0.12)' },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#2a0020' },
    { property: '--bard-color-processing-animation-color-2', value: '#001a30' },
  ],
  sidebarVariables: [
    { property: '--background', value: '8 8 12' },            // #08080c
    { property: '--foreground', value: '232 232 240' },       // #e8e8f0
    { property: '--card', value: '15 15 24' },                // #0f0f18
    { property: '--card-foreground', value: '232 232 240' },
    { property: '--popover', value: '15 15 24' },
    { property: '--popover-foreground', value: '232 232 240' },
    { property: '--primary', value: '255 0 128' },            // #ff0080
    { property: '--primary-foreground', value: '255 255 255' },
    { property: '--secondary', value: '30 30 48' },           // #1e1e30
    { property: '--secondary-foreground', value: '176 176 200' },
    { property: '--muted', value: '30 30 48' },
    { property: '--muted-foreground', value: '106 106 136' }, // #6a6a88
    { property: '--accent', value: '42 0 32' },               // #2a0020
    { property: '--accent-foreground', value: '255 102 178' },
    { property: '--destructive', value: '255 34 85' },        // #ff2255
    { property: '--destructive-foreground', value: '255 255 255' },
    { property: '--border', value: '42 42 64' },              // #2a2a40
    { property: '--input', value: '30 30 48' },               // #1e1e30
    { property: '--ring', value: '255 0 128' },
    { property: '--sidebar-icon-color', value: '176 176 200' },
    { property: '--highlight', value: '0 200 255' },            // #00c8ff - electric blue
    { property: '--highlight-foreground', value: '0 0 0' },
    { property: '--success', value: '57 255 136' },             // #39ff88 - neon green
    { property: '--success-foreground', value: '0 0 0' },
    { property: '--warning', value: '255 226 61' },             // #ffe23d - neon yellow
    { property: '--warning-foreground', value: '0 0 0' },
    { property: '--font-sans', value: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif' },
    { property: '--gem-sys-color--primary-container', value: '#2a0020' },
    { property: '--gem-sys-color--on-primary-container', value: '#ff66b2' },
    { property: '--radius', value: '4px' },
  ],
};
