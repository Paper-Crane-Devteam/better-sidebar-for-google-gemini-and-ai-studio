/**
 * 💻 复古终端机 (Retro Terminal)
 *
 * 完全剔除圆角，像素分割线，全局等宽字体 (Fira Code / JetBrains Mono)。
 * 整个界面像一个专属的本地命令控制台。
 *
 * ─── 为什么绿色不是 #00ff41 ─────────────────────────────────────────────
 *
 * 第一版用纯荧光绿 #00ff41 铺满全部文字，铺纯黑 #0a0a0a 打底。看起来很像
 * Cool Retro Term 的截图，读十分钟就头疼，原因有三个，都是可测量的：
 *
 * 1. #00ff41 基本只点亮 G 子像素，R/B 近乎为零。眼睛靠亮度边缘对焦，单通道
 *    的字没有亮度边缘可用，于是持续微调焦距 —— 主观上就是"字在发光、在抖"。
 *    这里所有绿色都掺进 R 和 B，让三通道都出力，字才对得上焦。
 *
 * 2. #00ff41 对 #0a0a0a 是 14.5:1，AAA 只要 7:1。暗色主题上对比度过高本身
 *    就是眩光源，亮字会往黑底里"渗"。正文这里定在 9.3:1：稳过 AAA，又不刺。
 *
 * 3. 底色也从纯黑抬到 #0b0f0d 并带一点绿味。真实磷光 CRT 的黑从来不是 0,0,0；
 *    纯黑把光晕放到最大，而带绿味的底让绿字落在同一个色域里，而不是浮在上面。
 *
 * 另外两条也一并修掉：
 *
 * - 绿底绿字。原来 accent / muted / primary-container 都是绿面色，上面又放
 *    #00ff41，选中项、chip、hover 全糊成一团。现在面色降饱和往中性绿走，面色
 *    与其上文字始终拉开 ~9:1，靠亮度而不是靠色相区分。
 *
 * - 层级。原来正文、次要文字、图标、链接、按钮全是同一个绿，没有东西能后退，
 *    眼睛没法扫读；而 muted 文字又只有 3.0:1，连 AA 都不过。下面的 phosphor
 *    梯队每一档都标了实测对比度，最弱的一档也过 AA。
 *
 * 亮到扎眼的那支绿被保留了，但只留给面积极小的地方：光标、焦点环、实心主按钮。
 */

import type { ThemePreset } from '../types';

export const retroTerminal: ThemePreset = {
  id: 'retro-terminal',
  name: 'Retro Terminal',
  description:
    'CRT terminal aesthetic with easy-on-the-eyes phosphor green and monospace typography',
  isPremium: true,
  preferredMode: 'dark',
  // CRT phosphor bloom: tighter than Gemini's soft wash, but faded — a bright
  // halo sitting directly behind the composer text is exactly what makes the
  // caret area hard to read.
  lmGlow: { blur: '100px', maxHeight: '200px', intensity: 0.6 },
  fonts: ['Fira+Code:wght@300;400;500;600', 'JetBrains+Mono:wght@300;400;500;600'],
  fontMono: `'Fira Code', 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace`,
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
  opacity: 0.025;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 1px,
    rgba(92, 201, 129, 0.03) 1px,
    rgba(92, 201, 129, 0.03) 2px
  );
}

/* Pixel border style */
body.bs-theme--retro-terminal .mat-mdc-list-item {
  border-bottom: 1px solid #1e3a2a !important;
}

/*
 * No text-shadow glow.
 *
 * The first version put text-shadow: 0 0 4px on every link and button. On a
 * phosphor-green-on-black page the text already reads as blurry (see the note
 * at the top of this file), so a real blur on top of it pushed links from
 * "glowing" to "illegible". The CRT character is carried by the scanline
 * overlay and the composer bloom instead, neither of which sits under text.
 */

/*
 * Selection: a tinted block rather than a bright green fill with black text.
 * Dragging over a paragraph should not flash the page.
 */
body.bs-theme--retro-terminal ::selection {
  background: #1e4a30;
  color: #b6f0c8;
}

/* Terminal-style caret color on inputs and contenteditable */
body.bs-theme--retro-terminal input,
body.bs-theme--retro-terminal textarea,
body.bs-theme--retro-terminal [contenteditable="true"],
body.bs-theme--retro-terminal .ql-editor,
body.bs-theme--retro-terminal rich-textarea {
  /* One of the three places the hot phosphor green is still allowed: it is a
     1-character block that has to be findable at a glance. */
  caret-color: #25f57a;
  caret-shape: block;
}
`,
  fontCss: `
/* Monospace font override */
body.bs-fonts--retro-terminal {
  font-family: 'Fira Code', 'JetBrains Mono', 'Cascadia Code', 'Consolas', 'Microsoft YaHei', monospace !important;
}

body.bs-fonts--retro-terminal *:not(.material-symbols-outlined):not(.material-symbols-rounded):not(.material-symbols-sharp):not(.google-symbols):not(mat-icon):not(.mat-icon):not([class*="material-symbols"]):not([class*="google-symbols"]) {
  font-family: inherit;
}
`,
  fontVariables: [
    { property: '--mat-menu-item-label-text-font', value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace' },
    { property: '--mat-list-list-item-label-text-font', value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace' },
    { property: '--mat-list-list-item-supporting-text-font', value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace' },
    { property: '--mat-button-text-label-text-font', value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace' },
    { property: '--mat-button-filled-label-text-font', value: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace' },
  ],
  variables: [
    // ─── Surface / Background (near-black, faint green cast) ────────
    //
    // Lifted off pure black on purpose. #000 maximises halation under bright
    // text, and a neutral black leaves the green text looking pasted on; a
    // green-tinted charcoal puts background and text in the same colour family.
    //
    //   #070a08  lowest / deepest
    //   #080b09  dim
    //   #0b0f0d  surface  ← the page
    //   #0e1310  container-low
    //   #111713  container
    //   #161d18  container-high
    //   #1c241e  container-highest / bright
    { property: '--gem-sys-color--surface', value: '#0b0f0d' },
    { property: '--gem-sys-color--surface-bright', value: '#1c241e' },
    { property: '--gem-sys-color--surface-dim', value: '#080b09' },
    { property: '--gem-sys-color--surface-container', value: '#111713' },
    {
      property: '--gem-sys-color--surface-container-low',
      value: '#0e1310',
    },
    {
      property: '--gem-sys-color--surface-container-high',
      value: '#161d18',
    },
    {
      property: '--gem-sys-color--surface-container-highest',
      value: '#1c241e',
    },
    {
      property: '--gem-sys-color--surface-container-lowest',
      value: '#070a08',
    },
    { property: '--gem-sys-color--surface-variant', value: '#131a15' },
    { property: '--mat-app-background-color', value: '#0b0f0d' },
    { property: '--lumi-sys-color--surface', value: '#0b0f0d' },
    { property: '--lumi-sys-color--surface-bright', value: '#1c241e' },
    { property: '--lumi-sys-color--surface-dim', value: '#080b09' },
    {
      property: '--bard-color-synthetic--chat-window-surface',
      value: '#0b0f0d',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container',
      value: '#111713',
    },
    {
      property: '--bard-color-synthetic--chat-window-surface-container-highest',
      value: '#1c241e',
    },
    { property: '--bard-color-sidenav-background-desktop', value: '#090d0b' },
    { property: '--bard-color-sidenav-background-mobile', value: '#0b0f0d' },

    // ─── Text (磷光绿梯队, contrast measured against #0b0f0d) ────────
    //
    //   #5cc981  body            9.3:1   AAA
    //   #4fae70  secondary       6.4:1   AA
    //   #3f8c59  placeholder     4.7:1   AA
    //
    // All three carry R and B, so they light all three subpixels and the eye can
    // focus on them — that, not the contrast number, is what #00ff41 got wrong.
    { property: '--gem-sys-color--on-surface', value: '#5cc981' },
    { property: '--gem-sys-color--on-surface-variant', value: '#4fae70' },
    { property: '--gem-sys-color--on-surface-low', value: '#3f8c59' },
    { property: '--mat-app-text-color', value: '#5cc981' },
    { property: '--lumi-sys-color--on-surface', value: '#5cc981' },
    { property: '--bard-color-form-field-placeholder', value: '#3f8c59' },

    // ─── Primary (accent green) ─────────────────────────────────────
    //
    // `primary` is a *text* colour in Gemini (links, text buttons), so it has to
    // stay readable rather than maximally bright: #2ce87f at 11.9:1 sits one step
    // above body text, which is what makes a link look like a link here. The hot
    // #25f57a is reserved for the filled-button fill below, where it is a
    // background behind near-black text and covers very little of the screen.
    { property: '--gem-sys-color--primary', value: '#2ce87f' },
    { property: '--gem-sys-color--on-primary', value: '#04120a' },
    // Selected/active surface. Desaturated towards neutral green so that the
    // label on top separates by luminance (9.7:1) instead of by hue — the old
    // #00ff41-on-#0a2a0a pairing was the "green on green" the report described.
    { property: '--gem-sys-color--primary-container', value: '#14301f' },
    { property: '--gem-sys-color--on-primary-container', value: '#8ee8ab' },
    { property: '--gem-sys-color--primary-fixed-dim', value: '#4fae70' },
    { property: '--mat-focus-indicator-border-color', value: '#25f57a' },
    {
      property: '--mat-progress-spinner-active-indicator-color',
      value: '#2ce87f',
    },

    // ─── Secondary (Amber / 琥珀橙) ────────────────────────────────
    { property: '--gem-sys-color--secondary', value: '#ffb000' },
    { property: '--gem-sys-color--on-secondary', value: '#1a1200' },
    { property: '--gem-sys-color--secondary-container', value: '#2b2005' },
    { property: '--gem-sys-color--on-secondary-container', value: '#ffc74d' },
    { property: '--gem-sys-color--tertiary-container', value: '#1e1a08' },

    // ─── Outline / Border (暗绿分割线) ──────────────────────────────
    // Nudged off pure green so a table full of 1px rules does not read as a
    // green grid laid over the page.
    { property: '--gem-sys-color--outline', value: '#1e3a2a' },
    { property: '--gem-sys-color--outline-variant', value: '#182e21' },
    { property: '--gem-sys-color--outline-low', value: '#132419' },

    // ─── Inverse (tooltips, snackbars) ──────────────────────────────
    // Was a #00ff41 block with pure-black text: small, but the brightest thing
    // on screen and it appears on hover, i.e. exactly when the eye is settled.
    { property: '--gem-sys-color--inverse-surface', value: '#a5dcb8' },
    { property: '--gem-sys-color--inverse-on-surface', value: '#08120c' },

    // ─── Error (Red Alert) ──────────────────────────────────────────
    // #ff0033 is the red-channel twin of the #00ff41 problem — near single
    // channel, so it halates the same way. #ff4d6a keeps the alarm at 6.0:1.
    { property: '--gem-sys-color--error', value: '#ff4d6a' },

    // ─── Brand Gradient (terminal colors) ───────────────────────────
    // Decorative and blurred, so the hot green is fine here.
    { property: '--bard-color-brand-text-gradient-stop-1', value: '#25f57a' },
    { property: '--bard-color-brand-text-gradient-stop-2', value: '#ffb000' },
    { property: '--bard-color-brand-text-gradient-stop-3', value: '#00ccff' },

    // ─── Code Block (native terminal colors) ────────────────────────
    // Comments moved from #4a7a4a (4.0:1) to #5c8a6c (5.0:1): a comment should
    // recede, not disappear.
    { property: '--bard-color-code-comment', value: '#5c8a6c' },
    { property: '--bard-color-code-variables', value: '#ff8a8a' },
    { property: '--bard-color-code-literal', value: '#ffb000' },
    { property: '--bard-color-code-class', value: '#5cc8f0' },
    { property: '--bard-color-code-string', value: '#5cc981' },
    { property: '--bard-color-code-quotes-and-meta', value: '#66d9ef' },
    { property: '--bard-color-code-keyword', value: '#ff92d0' },
    { property: '--lumi-sys-color--code-background', value: '#070a08' },
    { property: '--lumi-sys-color--code-primary-text', value: '#7fd8a0' },
    { property: '--lumi-sys-color--code-grey-text', value: '#5c8a6c' },
    { property: '--lumi-sys-color--code-blue-text', value: '#66d9ef' },
    { property: '--lumi-sys-color--code-pink-text', value: '#ff79c6' },
    { property: '--lumi-sys-color--code-yellow-text', value: '#ffb000' },
    { property: '--lumi-sys-color--code-green-text', value: '#5cd98a' },
    { property: '--lumi-sys-color--code-red-text', value: '#ff8a8a' },
    { property: '--lumi-sys-color--code-purple-text', value: '#c8a8f9' },

    // ─── Buttons ────────────────────────────────────────────────────
    // The one place the hot phosphor green survives at full strength: a filled
    // button is a small block carrying near-black text, so it reads as a lit key
    // on a console rather than as glare.
    { property: '--mat-button-filled-container-color', value: '#25f57a' },
    { property: '--mat-button-filled-label-text-color', value: '#04120a' },
    { property: '--mat-button-tonal-container-color', value: '#17301f' },
    { property: '--mat-button-tonal-label-text-color', value: '#8ee8ab' },

    // ─── Menu ───────────────────────────────────────────────────────
    { property: '--mat-menu-container-color', value: '#111713' },
    { property: '--mat-menu-item-label-text-color', value: '#5cc981' },
    { property: '--mat-menu-item-icon-color', value: '#4fae70' },
    { property: '--mat-menu-divider-color', value: '#1e3a2a' },
    {
      property: '--mat-menu-container-elevation-shadow',
      value: '0px 0px 10px rgba(37,245,122,0.08), 0px 2px 6px rgba(0,0,0,0.6)',
    },

    // ─── List ───────────────────────────────────────────────────────
    { property: '--mat-list-list-item-label-text-color', value: '#5cc981' },
    {
      property: '--mat-list-list-item-supporting-text-color',
      value: '#4fae70',
    },
    {
      property: '--mat-list-list-item-leading-icon-color',
      value: '#4fae70',
    },
    { property: '--mat-list-active-indicator-color', value: '#14301f' },

    // ─── Prompt Chips ───────────────────────────────────────────────
    {
      property: '--bard-color-zero-state-prompt-chip-background',
      value: '#13241b',
    },
    {
      property: '--bard-color-zero-state-prompt-chip-text',
      value: '#7fd8a0',
    },

    // ─── Shadows ────────────────────────────────────────────────────
    // Green glow kept, but halved and paired with a real dark shadow. A pure
    // glow with no dark component gives an elevated panel no edge to sit on, so
    // menus floated in a green haze instead of reading as layered.
    {
      property: '--mat-app-elevation-shadow-level-1',
      value: '0px 0px 4px rgba(37,245,122,0.05), 0px 1px 3px rgba(0,0,0,0.5)',
    },
    {
      property: '--mat-app-elevation-shadow-level-2',
      value: '0px 0px 8px rgba(37,245,122,0.06), 0px 2px 6px rgba(0,0,0,0.55)',
    },
    {
      property: '--mat-app-elevation-shadow-level-3',
      value: '0px 0px 12px rgba(37,245,122,0.07), 0px 4px 10px rgba(0,0,0,0.6)',
    },

    // ─── Processing Animation ───────────────────────────────────────
    { property: '--bard-color-processing-animation-color-1', value: '#14301f' },
    { property: '--bard-color-processing-animation-color-2', value: '#0d2115' },
  ],
  sidebarVariables: [
    // Same ramp as the page tokens above. The sidebar is where the old palette
    // hurt most: it is dense, it is always on screen, and every one of its
    // surfaces was a green tint carrying #00ff41 text.
    { property: '--background', value: '11 15 13' },          // #0b0f0d
    { property: '--foreground', value: '92 201 129' },         // #5cc981  9.3:1
    { property: '--card', value: '17 23 19' },                 // #111713
    { property: '--card-foreground', value: '92 201 129' },
    { property: '--popover', value: '17 23 19' },
    { property: '--popover-foreground', value: '92 201 129' },
    { property: '--primary', value: '44 232 127' },            // #2ce87f  11.9:1
    { property: '--primary-foreground', value: '4 18 10' },
    { property: '--secondary', value: '19 27 22' },            // #131b16
    { property: '--secondary-foreground', value: '127 216 160' }, // #7fd8a0
    { property: '--muted', value: '19 27 22' },
    // Was #008020 on #142814 — 3.0:1, below AA. Now 6.4:1.
    { property: '--muted-foreground', value: '79 174 112' },    // #4fae70
    { property: '--accent', value: '20 48 31' },               // #14301f
    { property: '--accent-foreground', value: '142 232 171' },  // #8ee8ab  9.7:1
    { property: '--destructive', value: '255 77 106' },         // #ff4d6a
    { property: '--destructive-foreground', value: '8 18 12' },
    { property: '--border', value: '30 58 42' },               // #1e3a2a
    { property: '--input', value: '30 58 42' },
    { property: '--ring', value: '37 245 122' },               // #25f57a — focus only
    { property: '--sidebar-icon-color', value: '79 174 112' },  // #4fae70
    { property: '--highlight', value: '255 176 0' },            // #ffb000 - amber
    { property: '--highlight-foreground', value: '20 12 0' },
    { property: '--success', value: '55 214 122' },             // #37d67a - phosphor
    { property: '--success-foreground', value: '4 18 10' },
    { property: '--warning', value: '255 176 0' },              // #ffb000 - amber CRT
    { property: '--warning-foreground', value: '20 12 0' },
    { property: '--font-sans', value: '"Fira Code", "JetBrains Mono", "Cascadia Code", "Consolas", "Microsoft YaHei", monospace' },
    { property: '--gem-sys-color--primary-container', value: '#14301f' },
    { property: '--gem-sys-color--on-primary-container', value: '#8ee8ab' },
    { property: '--radius', value: '0px' },
  ],
};
