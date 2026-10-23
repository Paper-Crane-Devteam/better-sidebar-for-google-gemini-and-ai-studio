/**
 * AI Studio overlay layout: injects sidebar into .makersuite-layout, hides ms-navbar, mounts OverlayPanel
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayPanel } from './OverlayPanel';
import { AIStudioEnhancedFeatures } from './enhanced-features/AIStudioEnhancedFeatures';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { applyShadowStyles, querySelectorDeep, waitForElement } from '@/shared/lib/utils';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { initAiStudioThemeSync, bindAiStudioShadowRootToTheme } from '@/themes/platforms/aistudio';
import { useExclusiveContextMenuStore } from '../shared/components/ui/exclusive-context-menu';
import { registerPlatformDomAdapter } from '@/shared/lib/platform-dom-adapter';
import { AISTUDIO_SELECTORS } from '@/shared/lib/dom-selectors';
import { aistudioDomAdapter } from './lib/aistudio-dom-adapter';

/**
 * Width of the sidebar's left icon bar. Mirrors `--sidebar-width` in
 * _aistudio.scss.
 */
const ICON_BAR_WIDTH = 56;

export async function initAiStudioOverlay(mainStyles: string): Promise<void> {
  // Register AI Studio DOM adapter (must be before any React tree mounts)
  registerPlatformDomAdapter(aistudioDomAdapter);

  console.log('Better Sidebar: Overlay (AI Studio) Initialized');

  TooltipHelper.getInstance().initialize(mainStyles);

  // 1. Hide Navbar (supports both legacy ms-navbar and the new ms-navbar-v2)
  const style = document.createElement('style');
  style.id = 'better-sidebar-for-google-ai-studio-navbar-hider';
  style.textContent = `
    ${AISTUDIO_SELECTORS.navbar} {
      display: none !important;
      position: absolute !important;
      left: -9999px !important;
      top: -9999px !important;
    }
  `;
  document.head.appendChild(style);

  try {
    const navbar = await waitForElement(AISTUDIO_SELECTORS.navbar);
    if (navbar) {
      (navbar as HTMLElement).style.display = 'none';
      (navbar as HTMLElement).style.position = 'absolute';
      (navbar as HTMLElement).style.left = '-9999px';
    }
  } catch (e) {
    console.error('Better Sidebar: Failed to find navbar', e);
  }

  // 2. Inject SidePanel
  const anchor = await waitForElement('.makersuite-layout');

  const wrapper = document.createElement('div');
  wrapper.id = 'better-sidebar-for-google-ai-studio-sidebar-wrapper';
  anchor?.insertBefore(wrapper, anchor.firstChild);

  const syncSidebarWithNavbar = async () => {
    try {
      const navbar = await waitForElement(AISTUDIO_SELECTORS.navbar);
      if (!navbar) return;
      const firstChild = navbar.firstElementChild;
      if (!firstChild) return;
      const updateState = () => {
        const isCollapsed = firstChild.classList.contains('collapsed');
        if (isCollapsed) wrapper.classList.add('collapsed');
        else wrapper.classList.remove('collapsed');
      };
      const observer = new MutationObserver(updateState);
      observer.observe(firstChild, {
        attributes: true,
        attributeFilter: ['class'],
      });
      updateState();
    } catch (e) {
      console.error('Better Sidebar: Failed to sync with navbar', e);
    }
  };
  syncSidebarWithNavbar();

  const sidebarStyle = document.createElement('style');
  sidebarStyle.id = 'better-sidebar-for-google-ai-studio-sidebar-styles';
  
  // Function to update sidebar width based on user setting
  const updateSidebarWidth = (widthPx: number) => {
    sidebarStyle.textContent = `
      #better-sidebar-for-google-ai-studio-sidebar-wrapper {
        --better-sidebar-panel-width: ${widthPx}px;
        height: 100%;
        width: ${widthPx}px;
        flex-shrink: 0;
        box-sizing: border-box;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: hidden;
        z-index: 999;
        background: var(--background, #fff);
      }
      #better-sidebar-for-google-ai-studio-sidebar-wrapper.collapsed {
        width: 0px;
      }
      @media screen and (max-width: 960px) {
        #better-sidebar-for-google-ai-studio-sidebar-wrapper {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          box-shadow: 2px 0 8px rgba(0,0,0,0.1);
        }
      }
    `;
  };

  /**
   * Resolve the wrapper width from both stores.
   *
   * Compact mode shrinks the whole wrapper by the icon bar's width
   * instead of letting the content area stretch into the freed space. The
   * content area is `flex-1`, so it ends up exactly as wide as it was with the
   * icon bar visible — toggling never reflows the tree, only the sidebar's
   * right edge moves.
   */
  let lastAppliedWidth: number | null = null;
  const applySidebarWidth = () => {
    const baseWidth =
      usePegasusStore.getState().enhancedFeatures.aistudio?.sidebarWidth ?? 320;
    const { compactMode } = useSettingsStore.getState();
    const width = compactMode
      ? Math.max(baseWidth - ICON_BAR_WIDTH, 0)
      : baseWidth;
    // Both stores fire on unrelated changes too; skip redundant style writes.
    if (width === lastAppliedWidth) return;
    lastAppliedWidth = width;
    updateSidebarWidth(width);
  };

  applySidebarWidth();
  document.head.appendChild(sidebarStyle);

  // Width depends on the pegasus store (user slider) and the settings store
  // (icon bar visibility), so react to both.
  usePegasusStore.subscribe(applySidebarWidth);
  useSettingsStore.subscribe(applySidebarWidth);

  // Prevent keyboard/mouse events from bubbling to AI Studio's native listeners
  const stopPropagation = (e: Event) => {
    // Close context menu on pointerdown inside sidebar (since stopPropagation
    // prevents Radix's document-level dismiss listener from firing)
    if (e.type === 'pointerdown') {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-radix-menu-content]')) {
        useExclusiveContextMenuStore.getState().closeAll();
      }
    }
    e.stopPropagation();
  };
  for (const evt of [
    'click',
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'contextmenu',
    'keydown',
    'keyup',
    'keypress',
  ]) {
    wrapper.addEventListener(evt, stopPropagation);
  }

  const shadow = wrapper.attachShadow({ mode: 'open' });
  applyShadowStyles(shadow, mainStyles);

  const rootContainer = document.createElement('div');
  rootContainer.classList.add('shadow-body');
  rootContainer.classList.add('theme-aistudio');
  /*
    Pin the panel to the open width instead of `.shadow-body`'s 100%. The
    wrapper animates its width on collapse/expand and clips with
    overflow:hidden, so the panel just slides out of view. Tracking the
    wrapper's width would re-layout the whole tree on every animation frame
    and fire the folder tree's ResizeObserver, re-rendering react-arborist
    each frame — that was most of the stutter on our side. The custom
    property is set on the wrapper (see updateSidebarWidth) and inherits
    through the shadow boundary.
  */
  rootContainer.style.width = 'var(--better-sidebar-panel-width, 100%)';

  const syncTheme = () => {
    const isDark = document.body.classList.contains('dark-theme');
    TooltipHelper.getInstance().setTheme(isDark);
    if (isDark) rootContainer.classList.add('dark');
    else rootContainer.classList.remove('dark');
  };
  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });

  shadow.appendChild(rootContainer);

  // Bind custom theme to sidebar Shadow DOM
  bindAiStudioShadowRootToTheme(rootContainer);

  // Initialize custom theme sync (applies CSS variables to body for native AI Studio UI)
  initAiStudioThemeSync();

  const root = ReactDOM.createRoot(rootContainer);
  root.render(
    <ShadowRootProvider container={rootContainer}>
      <div className="h-full w-full bg-background sidebar-edge text-foreground">
        <OverlayPanel className="h-full" />
      </div>
    </ShadowRootProvider>
  );

  // Mount enhanced features independently (CSS-based features that work on the native page)
  mountAIStudioEnhancedFeatures(mainStyles);
}

/**
 * Mount AI Studio enhanced features (auto-hide input, snippet save, etc.)
 * Uses a shadow DOM container so visual features (SnippetDragDrawer) render properly.
 */
function mountAIStudioEnhancedFeatures(mainStyles: string) {
  try {
    const enhancedWrapper = document.createElement('div');
    enhancedWrapper.id = 'better-sidebar-aistudio-enhanced-features';
    enhancedWrapper.style.position = 'absolute';
    enhancedWrapper.style.top = '0';
    enhancedWrapper.style.left = '0';
    enhancedWrapper.style.width = '0';
    enhancedWrapper.style.height = '0';
    enhancedWrapper.style.overflow = 'visible';
    document.body.appendChild(enhancedWrapper);

    const enhancedShadow = enhancedWrapper.attachShadow({ mode: 'open' });
    applyShadowStyles(enhancedShadow, mainStyles);

    const enhancedRoot = document.createElement('div');
    enhancedRoot.classList.add('shadow-body', 'theme-aistudio');

    const syncEnhancedTheme = () => {
      const isDark = document.body.classList.contains('dark-theme');
      if (isDark) enhancedRoot.classList.add('dark');
      else enhancedRoot.classList.remove('dark');
    };
    syncEnhancedTheme();
    new MutationObserver(syncEnhancedTheme).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    enhancedShadow.appendChild(enhancedRoot);
    bindAiStudioShadowRootToTheme(enhancedRoot);

    const reactRoot = ReactDOM.createRoot(enhancedRoot);
    reactRoot.render(
      <ShadowRootProvider container={enhancedRoot}>
        <AIStudioEnhancedFeatures />
      </ShadowRootProvider>,
    );

    console.log('Better Sidebar: AI Studio enhanced features mounted');
  } catch (e) {
    console.error('Better Sidebar: AI Studio enhanced features initialization failed', e);
  }
}
