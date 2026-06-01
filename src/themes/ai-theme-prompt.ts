/**
 * AI Theme Generator prompt template.
 *
 * This prompt is injected into the user's Prompt Manager when they click
 * "Create AI Theme Prompt" in the Theme Settings panel.
 * It uses the {{theme_description}} variable for user input.
 */

export const AI_THEME_PROMPT_TITLE = '🎨 AI Theme Generator';

export const AI_THEME_PROMPT_CONTENT = `You are a theme designer for a browser extension that customizes Google Gemini / AI Studio's appearance. Generate a complete theme JSON based on the user's requirements.

## User Requirements
{{theme_description}}

## Output Format
Output ONLY a valid JSON object (no markdown code fences, no explanation) with this exact structure:

{
  "id": "kebab-case-id",
  "name": "Display Name",
  "description": "Brief description of the theme aesthetic",
  "preferredMode": "light" or "dark",
  "fonts": ["GoogleFontName:wght@400;500;700"],
  "extraCss": "body.bs-theme--{id} { /* optional extra CSS */ }",
  "variables": [
    // ─── Surface / Background (REQUIRED) ───
    { "property": "--gem-sys-color--surface", "value": "#hex" },
    { "property": "--gem-sys-color--surface-bright", "value": "#hex" },
    { "property": "--gem-sys-color--surface-dim", "value": "#hex" },
    { "property": "--gem-sys-color--surface-container", "value": "#hex" },
    { "property": "--gem-sys-color--surface-container-low", "value": "#hex" },
    { "property": "--gem-sys-color--surface-container-high", "value": "#hex" },
    { "property": "--gem-sys-color--surface-container-highest", "value": "#hex" },
    { "property": "--gem-sys-color--surface-container-lowest", "value": "#hex" },
    { "property": "--gem-sys-color--surface-variant", "value": "#hex" },
    { "property": "--mat-app-background-color", "value": "#hex" },
    { "property": "--lumi-sys-color--surface", "value": "#hex" },
    { "property": "--lumi-sys-color--surface-bright", "value": "#hex" },
    { "property": "--lumi-sys-color--surface-dim", "value": "#hex" },
    { "property": "--bard-color-synthetic--chat-window-surface", "value": "#hex" },
    { "property": "--bard-color-synthetic--chat-window-surface-container", "value": "#hex" },
    { "property": "--bard-color-synthetic--chat-window-surface-container-highest", "value": "#hex" },
    { "property": "--bard-color-sidenav-background-desktop", "value": "#hex" },
    { "property": "--bard-color-sidenav-background-mobile", "value": "#hex" },

    // ─── Text / On-Surface (REQUIRED) ───
    { "property": "--gem-sys-color--on-surface", "value": "#hex" },
    { "property": "--gem-sys-color--on-surface-variant", "value": "#hex" },
    { "property": "--gem-sys-color--on-surface-low", "value": "#hex" },
    { "property": "--mat-app-text-color", "value": "#hex" },
    { "property": "--lumi-sys-color--on-surface", "value": "#hex" },
    { "property": "--bard-color-form-field-placeholder", "value": "#hex" },

    // ─── Primary Accent (REQUIRED) ───
    { "property": "--gem-sys-color--primary", "value": "#hex" },
    { "property": "--gem-sys-color--on-primary", "value": "#hex" },
    { "property": "--gem-sys-color--primary-container", "value": "#hex" },
    { "property": "--gem-sys-color--on-primary-container", "value": "#hex" },
    { "property": "--gem-sys-color--primary-fixed-dim", "value": "#hex" },
    { "property": "--mat-focus-indicator-border-color", "value": "#hex" },
    { "property": "--mat-progress-spinner-active-indicator-color", "value": "#hex" },

    // ─── Secondary ───
    { "property": "--gem-sys-color--secondary", "value": "#hex" },
    { "property": "--gem-sys-color--on-secondary", "value": "#hex" },
    { "property": "--gem-sys-color--secondary-container", "value": "#hex" },
    { "property": "--gem-sys-color--on-secondary-container", "value": "#hex" },
    { "property": "--gem-sys-color--tertiary-container", "value": "#hex" },

    // ─── Outline / Border ───
    { "property": "--gem-sys-color--outline", "value": "#hex" },
    { "property": "--gem-sys-color--outline-variant", "value": "#hex" },
    { "property": "--gem-sys-color--outline-low", "value": "#hex" },

    // ─── Inverse ───
    { "property": "--gem-sys-color--inverse-surface", "value": "#hex" },
    { "property": "--gem-sys-color--inverse-on-surface", "value": "#hex" },

    // ─── Error ───
    { "property": "--gem-sys-color--error", "value": "#hex" },

    // ─── Brand Gradient ───
    { "property": "--bard-color-brand-text-gradient-stop-1", "value": "#hex" },
    { "property": "--bard-color-brand-text-gradient-stop-2", "value": "#hex" },
    { "property": "--bard-color-brand-text-gradient-stop-3", "value": "#hex" },

    // ─── Code Syntax Colors ───
    { "property": "--bard-color-code-comment", "value": "#hex" },
    { "property": "--bard-color-code-variables", "value": "#hex" },
    { "property": "--bard-color-code-literal", "value": "#hex" },
    { "property": "--bard-color-code-class", "value": "#hex" },
    { "property": "--bard-color-code-string", "value": "#hex" },
    { "property": "--bard-color-code-quotes-and-meta", "value": "#hex" },
    { "property": "--bard-color-code-keyword", "value": "#hex" },

    // ─── Buttons ───
    { "property": "--mat-button-filled-container-color", "value": "#hex" },
    { "property": "--mat-button-filled-label-text-color", "value": "#hex" },
    { "property": "--mat-button-tonal-container-color", "value": "#hex" },
    { "property": "--mat-button-tonal-label-text-color", "value": "#hex" },

    // ─── Menu ───
    { "property": "--mat-menu-container-color", "value": "#hex" },
    { "property": "--mat-menu-item-label-text-color", "value": "#hex" },
    { "property": "--mat-menu-item-icon-color", "value": "#hex" },
    { "property": "--mat-menu-divider-color", "value": "#hex" },

    // ─── List ───
    { "property": "--mat-list-list-item-label-text-color", "value": "#hex" },
    { "property": "--mat-list-list-item-supporting-text-color", "value": "#hex" },
    { "property": "--mat-list-list-item-leading-icon-color", "value": "#hex" },
    { "property": "--mat-list-active-indicator-color", "value": "#hex" },

    // ─── Prompt Chips ───
    { "property": "--bard-color-zero-state-prompt-chip-background", "value": "#hex" },
    { "property": "--bard-color-zero-state-prompt-chip-text", "value": "#hex" }
  ],
  "sidebarVariables": [
    // All color values here are RGB triplets: "R G B" (0-255, space-separated, NO # prefix)
    { "property": "--background", "value": "R G B" },
    { "property": "--foreground", "value": "R G B" },
    { "property": "--card", "value": "R G B" },
    { "property": "--card-foreground", "value": "R G B" },
    { "property": "--popover", "value": "R G B" },
    { "property": "--popover-foreground", "value": "R G B" },
    { "property": "--primary", "value": "R G B" },
    { "property": "--primary-foreground", "value": "R G B" },
    { "property": "--secondary", "value": "R G B" },
    { "property": "--secondary-foreground", "value": "R G B" },
    { "property": "--muted", "value": "R G B" },
    { "property": "--muted-foreground", "value": "R G B" },
    { "property": "--accent", "value": "R G B" },
    { "property": "--accent-foreground", "value": "R G B" },
    { "property": "--destructive", "value": "R G B" },
    { "property": "--destructive-foreground", "value": "R G B" },
    { "property": "--border", "value": "R G B" },
    { "property": "--input", "value": "R G B" },
    { "property": "--ring", "value": "R G B" },
    { "property": "--sidebar-icon-color", "value": "R G B" },
    // These two use hex format (not RGB triplet):
    { "property": "--gem-sys-color--primary-container", "value": "#hex" },
    { "property": "--gem-sys-color--on-primary-container", "value": "#hex" }
  ]
}

## Rules
- All color values in "variables" must be valid CSS color values (hex #rrggbb preferred, rgba() also acceptable)
- All color values in "sidebarVariables" must be RGB triplets "R G B" (e.g. "255 255 255") EXCEPT --gem-sys-color--* which use hex
- Ensure sufficient contrast between text and background (WCAG AA: 4.5:1 for normal text)
- "preferredMode" should match the overall brightness ("light" for bright backgrounds, "dark" for dark backgrounds)
- "fonts" uses Google Fonts format: "FontName:wght@300;400;500;700" (omit if using system fonts)
- "extraCss" must scope all rules with body.bs-theme--{id} selector. Can include font-family overrides, textures, or visual effects
- "id" must be kebab-case (lowercase, hyphens only), unique, and descriptive
- Replace all "R G B" and "#hex" placeholders with actual color values
- Design a cohesive color palette — all colors should work harmoniously together
- For dark themes: use dark surfaces with light text; for light themes: use light surfaces with dark text`;
