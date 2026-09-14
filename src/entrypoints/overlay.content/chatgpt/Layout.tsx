/**
 * ChatGPT overlay layout: finds parent of #stage-slideover-sidebar, inserts custom sidebar as first child
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayPanel } from './OverlayPanel';
import { ChatGPTEnhancedFeatures } from './enhanced-features/ChatGPTEnhancedFeatures';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { applyShadowStyles, waitForElement } from '@/shared/lib/utils';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';

/** Default sidebar width for ChatGPT (no user-facing width slider here). */
const SIDEBAR_WIDTH = 300;

/**
 * Width of the sidebar's left icon bar. Mirrors `--sidebar-width` in
 * _chatgpt.scss.
 */
const ICON_BAR_WIDTH = 56;

export async function initChatGPTOverlay(mainStyles: string): Promise<void> {
  console.log('Better Sidebar: Overlay (ChatGPT) Initialized');

  TooltipHelper.getInstance().initialize(mainStyles);

  // Wait for ChatGPT's React to finish hydration before injecting our elements
  await new Promise<void>(resolve => {
    const waitForHydration = () => {
      if (document.readyState === 'complete') {
        // Use requestIdleCallback to wait for React hydration to complete
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => {
            // Add small delay after idle to ensure hydration is done
            setTimeout(resolve, 50);
          });
        } else {
          setTimeout(resolve, 150);
        }
      } else {
        window.addEventListener('load', waitForHydration, { once: true });
      }
    };
    waitForHydration();
  });

  // 1. Hide original sidebar (keep in render tree for scrolling during scan)
  const style = document.createElement('style');
  style.id = 'better-sidebar-for-google-ai-studio-chatgpt-sidebar-hider';
  style.textContent = `
    #stage-slideover-sidebar {
      opacity: 0 !important;
      pointer-events: none !important;
      position: absolute !important;
      z-index: -1 !important;
    }
  `;
  document.head.appendChild(style);

  // 2. Inject custom sidebar as first child of parent
  const originalSidebar = await waitForElement('#stage-slideover-sidebar');
  const parent = originalSidebar?.parentElement;
  
  if (!parent) {
    console.error('Better Sidebar: Failed to find parent of #stage-slideover-sidebar');
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'better-sidebar-for-google-ai-studio-sidebar-wrapper';
  
  // Mark the element to prevent ChatGPT's React from trying to hydrate it
  // These attributes tell React this is an independent React root
  wrapper.setAttribute('data-reactroot', '');
  wrapper.setAttribute('data-react-root', 'independent');
  
  // Insert using requestAnimationFrame to ensure it happens after React's render cycle
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      parent.insertBefore(wrapper, parent.firstChild);
      resolve();
    });
  });

  const sidebarHider = document.getElementById(
    'better-sidebar-for-google-ai-studio-chatgpt-sidebar-hider',
  ) as HTMLStyleElement;

  const sidebarStyle = document.createElement('style');
  sidebarStyle.id = 'better-sidebar-for-google-ai-studio-sidebar-styles';
  
  /**
   * Compact mode shrinks the whole wrapper by the icon bar's width
   * instead of letting the content area stretch into the freed space. The
   * content area is `flex-1`, so it stays exactly as wide as it was with the
   * icon bar visible — toggling never reflows the tree, only the sidebar's
   * right edge moves.
   */
  let lastAppliedWidth: number | null = null;
  const applySidebarWidth = () => {
    const { compactMode } = useSettingsStore.getState();
    const width = compactMode
      ? Math.max(SIDEBAR_WIDTH - ICON_BAR_WIDTH, 0)
      : SIDEBAR_WIDTH;
    // The settings store fires on unrelated changes too; skip redundant writes.
    if (width === lastAppliedWidth) return;
    lastAppliedWidth = width;
    sidebarStyle.textContent = `
    #better-sidebar-for-google-ai-studio-sidebar-wrapper {
      height: 100%;
      width: ${width}px;
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

  applySidebarWidth();
  useSettingsStore.subscribe(applySidebarWidth);

  document.head.appendChild(sidebarStyle);

  const shadow = wrapper.attachShadow({ mode: 'open' });
  applyShadowStyles(shadow, mainStyles);

  const rootContainer = document.createElement('div');
  rootContainer.classList.add('shadow-body');
  rootContainer.classList.add('theme-chatgpt');
  
  // Ensure container is completely empty to avoid hydration warnings
  rootContainer.innerHTML = '';

  const syncTheme = () => {
    // TODO: Detect ChatGPT theme (light/dark)
    const isDark = document.documentElement.classList.contains('dark');
    TooltipHelper.getInstance().setTheme(isDark);
    if (isDark) rootContainer.classList.add('dark');
    else rootContainer.classList.remove('dark');
  };
  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });

  shadow.appendChild(rootContainer);

  let reactRoot: ReactDOM.Root | null = null;
  const renderContent = () => {
    if (!reactRoot) {
      reactRoot = ReactDOM.createRoot(rootContainer);
    }
    reactRoot.render(
      <ShadowRootProvider container={rootContainer}>
        <div 
          className="h-full w-full bg-background border-r text-foreground"
          suppressHydrationWarning
        >
          <OverlayPanel className="h-full" />
        </div>
      </ShadowRootProvider>
    );
  };

  // Re-mount wrapper and re-render if ChatGPT's React removed our wrapper from the DOM
  const ensureWrapperAndRender = () => {
    if (!document.contains(wrapper) && parent) {
      parent.insertBefore(wrapper, parent.firstChild);
      renderContent();
    }
  };

  // Update visibility/state based on overlay open state (stylesheet alone hides/shows original)
  const updateState = (enabled: boolean) => {
    if (enabled) {
      if (sidebarHider) sidebarHider.disabled = false;
      if (wrapper) {
        ensureWrapperAndRender();
        wrapper.style.display = 'block';
      }
    } else {
      if (sidebarHider) sidebarHider.disabled = true;
      if (wrapper) wrapper.style.display = 'none';
    }
  };

  updateState(useAppStore.getState().ui.overlay.isOpen);
  useAppStore.subscribe((state, prevState) => {
    if (state.ui.overlay.isOpen !== prevState.ui.overlay.isOpen) {
      updateState(state.ui.overlay.isOpen);
    }
  });

  // Use requestAnimationFrame to ensure React renders after ChatGPT's React is done
  // This prevents hydration errors from ChatGPT's React interfering
  requestAnimationFrame(() => {
    // Temporarily suppress hydration warnings caused by ChatGPT's React
    const originalError = console.error;
    console.error = (...args: any[]) => {
      if (
        typeof args[0] === 'string' &&
        (args[0].includes('Hydration failed') ||
          args[0].includes('server rendered HTML') ||
          args[0].includes('hydration'))
      ) {
        return;
      }
      originalError.apply(console, args);
    };

    renderContent();
    mountChatGPTEnhancedFeatures(mainStyles);

    // Restore console.error after a delay
    setTimeout(() => {
      console.error = originalError;
    }, 1000);
  });
}

/**
 * Mount ChatGPT enhanced features (overlays, toasts, paywalls) in document.body
 */
function mountChatGPTEnhancedFeatures(mainStyles: string) {
  try {
    const enhancedWrapper = document.createElement('div');
    enhancedWrapper.id = 'better-sidebar-chatgpt-enhanced-features';
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
    enhancedRoot.classList.add('shadow-body', 'theme-chatgpt');

    const syncEnhancedTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      if (isDark) enhancedRoot.classList.add('dark');
      else enhancedRoot.classList.remove('dark');
    };
    syncEnhancedTheme();
    new MutationObserver(syncEnhancedTheme).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    enhancedShadow.appendChild(enhancedRoot);

    const reactRoot = ReactDOM.createRoot(enhancedRoot);
    reactRoot.render(
      <ShadowRootProvider container={enhancedRoot}>
        <ChatGPTEnhancedFeatures />
      </ShadowRootProvider>,
    );

    console.log('Better Sidebar: ChatGPT enhanced features mounted');
  } catch (e) {
    console.error('Better Sidebar: ChatGPT enhanced features initialization failed', e);
  }
}
