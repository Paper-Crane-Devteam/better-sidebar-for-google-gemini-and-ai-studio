import { applyShadowStyles } from './utils/utils';
import type { ThemeVariable } from '@/themes/types';
import { clearSidebarTheme } from '@/themes/engine';

export class TooltipHelper {
  private static instance: TooltipHelper;
  private container: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;

  private constructor() {}

  static getInstance(): TooltipHelper {
    if (!TooltipHelper.instance) {
      TooltipHelper.instance = new TooltipHelper();
    }
    return TooltipHelper.instance;
  }

  initialize(css: string) {
    if (this.container) return; // Already initialized

    // Create host element
    this.container = document.createElement('div');
    this.container.id = 'better-sidebar-for-google-ai-studio-tooltip-container';
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '0';
    this.container.style.height = '0';
    this.container.style.zIndex = '2147483647'; // Max z-index
    this.container.style.pointerEvents = 'none'; // Pass through clicks

    document.body.appendChild(this.container);

    // Create shadow root
    this.shadow = this.container.attachShadow({ mode: 'open' });

    // Inject styles
    applyShadowStyles(this.shadow, css);

    // Create wrapper for content (where we will portal to)
    this.wrapper = document.createElement('div');
    // Ensure wrapper doesn't block clicks but children do
    this.wrapper.style.pointerEvents = 'auto';

    // We add the theme class to this wrapper
    this.wrapper.classList.add('font-sans');

    this.shadow.appendChild(this.wrapper);
  }

  getContainer(): HTMLElement {
    return this.wrapper || document.body;
  }

  setTheme(isDark: boolean) {
    if (!this.wrapper) return;

    if (isDark) {
      this.wrapper.classList.add('dark');
    } else {
      this.wrapper.classList.remove('dark');
    }
  }

  /**
   * Apply custom theme variables to the tooltip container.
   * Pass null to clear custom theme variables.
   */
  setCustomThemeVariables(variables: ThemeVariable[] | null) {
    if (!this.wrapper) return;

    // Always clear previous theme first to prevent property leaking between themes
    clearSidebarTheme(this.wrapper);

    if (!variables || variables.length === 0) {
      return;
    }

    this.wrapper.setAttribute('data-custom-theme', 'active');
    for (const v of variables) {
      this.wrapper.style.setProperty(v.property, v.value);
    }
  }
}
