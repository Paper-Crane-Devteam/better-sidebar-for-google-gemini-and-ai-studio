/**
 * Gemini overlay layout: injects sidebar into bard-sidenav -> .sidenav-with-history-container
 * Monitors chat-app for "mobile" class to switch between desktop and mobile layouts.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayPanel } from './OverlayPanel';
import { mountMobileLayout } from './MobileLayout';
import { mountEnhancedFeatures } from './enhanced-features/mount';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import {
  applyShadowStyles,
  waitForElement,
} from '@/shared/lib/utils';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useAppStore } from '@/shared/lib/store';

export async function initGeminiOverlay(mainStyles: string): Promise<void> {
  console.log('Better Sidebar: Overlay (Gemini) Initialized');

  TooltipHelper.getInstance().initialize(mainStyles);

  // Track layout mode and handles for cleanup
  let currentMode: 'desktop' | 'mobile' | null = null;
  let desktopHandle: DesktopLayoutHandle | null = null;
  let mobileHandle: { destroy: () => void } | null = null;

  /**
   * Switch between desktop and mobile layouts based on chat-app class.
   */
  const switchLayout = async (isMobile: boolean) => {
    const targetMode = isMobile ? 'mobile' : 'desktop';
    if (currentMode === targetMode) return;

    console.log(`Better Sidebar: Switching to ${targetMode} layout`);

    // Destroy current layout
    if (currentMode === 'desktop' && desktopHandle) {
      desktopHandle.destroy();
      desktopHandle = null;
    }
    if (currentMode === 'mobile' && mobileHandle) {
      mobileHandle.destroy();
      mobileHandle = null;
    }

    // Mount new layout
    if (isMobile) {
      mobileHandle = await mountMobileLayout(mainStyles);
      if (mobileHandle) {
        currentMode = 'mobile';
      } else {
        // Fallback: if mobile mount fails, stay in current mode or try desktop
        console.warn(
          'Better Sidebar: Mobile layout mount failed, falling back to desktop',
        );
        if (!desktopHandle) {
          desktopHandle = await mountDesktopLayout(mainStyles);
          currentMode = desktopHandle ? 'desktop' : null;
        }
      }
    } else {
      desktopHandle = await mountDesktopLayout(mainStyles);
      currentMode = desktopHandle ? 'desktop' : null;
    }
  };

  // Monitor chat-app for mobile class
  try {
    const chatApp = await waitForElement('chat-app');
    if (!chatApp) {
      console.error('Better Sidebar: chat-app element not found');
      // Fallback: just mount desktop layout
      desktopHandle = await mountDesktopLayout(mainStyles);
      currentMode = desktopHandle ? 'desktop' : null;
      mountEnhancedFeatures(mainStyles);
      return;
    }

    // Check initial state
    const isMobileInitially = chatApp.classList.contains('mobile');
    await switchLayout(isMobileInitially);

    // Observe class changes on chat-app
    const chatAppObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          const isMobile = chatApp.classList.contains('mobile');
          switchLayout(isMobile);
        }
      }
    });
    chatAppObserver.observe(chatApp, {
      attributes: true,
      attributeFilter: ['class'],
    });
  } catch (e) {
    console.error('Better Sidebar: Gemini overlay initialization failed', e);
  }

  // Mount Enhanced Features independently from OverlayPanel
  mountEnhancedFeatures(mainStyles);
}

// ─── Desktop Layout ─────────────────────────────────────────────────────────

interface DesktopLayoutHandle {
  destroy: () => void;
}

async function mountDesktopLayout(
  mainStyles: string,
): Promise<DesktopLayoutHandle | null> {
  try {
    // 0. Override bard-sidenav CSS variables based on density settings
    const bardSidenav = await waitForElement('bard-sidenav');
    if (!bardSidenav) {
      console.error('Better Sidebar: bard-sidenav not found');
      return null;
    }
    const bardSidenavEl = bardSidenav as HTMLElement;

    const originalClosedWidth = bardSidenavEl.style.getPropertyValue(
      '--bard-sidenav-closed-width',
    );
    const originalOpenWidth = bardSidenavEl.style.getPropertyValue(
      '--bard-sidenav-open-width',
    );

    const updateSidebarWidths = (
      density: 'compact' | 'relaxed',
      enabled: boolean,
    ) => {
      if (!bardSidenav) return;
      if (!enabled) {
        if (originalClosedWidth) {
          bardSidenavEl.style.setProperty(
            '--bard-sidenav-closed-width',
            originalClosedWidth,
          );
        } else {
          bardSidenavEl.style.removeProperty('--bard-sidenav-closed-width');
        }
        if (originalOpenWidth) {
          bardSidenavEl.style.setProperty(
            '--bard-sidenav-open-width',
            originalOpenWidth,
          );
        } else {
          bardSidenavEl.style.removeProperty('--bard-sidenav-open-width');
        }
        return;
      }

      if (density === 'compact') {
        bardSidenavEl.style.setProperty('--bard-sidenav-closed-width', '56px');
        bardSidenavEl.style.setProperty('--bard-sidenav-open-width', '345px');
      } else {
        bardSidenavEl.style.setProperty('--bard-sidenav-closed-width', '64px');
        bardSidenavEl.style.setProperty('--bard-sidenav-open-width', '360px');
      }
    };

    // Subscribe to density changes
    const unsubDensity = useSettingsStore.subscribe((state) => {
      const enabled = useAppStore.getState().ui.overlay.isOpen;
      updateSidebarWidths(state.layoutDensity, enabled);
    });

    // 0.5. Monitor bard-sidenav width to detect open/close state
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const density = useSettingsStore.getState().layoutDensity;
        const closedWidth = density === 'compact' ? 56 : 64;
        const isSidebarExpanded = width > closedWidth + 10;

        const currentExpanded =
          useAppStore.getState().ui.overlay.isSidebarExpanded;
        if (currentExpanded !== isSidebarExpanded) {
          useAppStore.getState().setSidebarExpanded(isSidebarExpanded);
        }
      }
    });
    resizeObserver.observe(bardSidenavEl);

    // 1. Find the container
    const container = await waitForElement('.sidenav-with-history-container');
    if (!container) {
      console.error(
        'Better Sidebar: Failed to find .sidenav-with-history-container',
      );
      resizeObserver.disconnect();
      unsubDensity();
      return null;
    }

    console.log('Better Sidebar: Found Gemini sidebar container', container);

    const wrapperId = 'better-sidebar-for-google-ai-studio-sidebar-wrapper';

    // Store references to elements we need to toggle
    const elements = {
      wrapper: null as HTMLElement | null,
      sideNavMenuBtn: null as HTMLElement | null,
      searchNavBtn: null as HTMLElement | null,
    };

    // Start looking for external elements
    waitForElement('side-nav-menu-button').then((el) => {
      elements.sideNavMenuBtn = el as HTMLElement;
      const enabled = useAppStore.getState().ui.overlay.isOpen;
      if (enabled) {
        (el as HTMLElement).style.position = 'absolute';
        (el as HTMLElement).style.top = '-9999px';
        (el as HTMLElement).style.left = '-9999px';
      }
    });

    waitForElement('search-nav-button').then((el) => {
      elements.searchNavBtn = el as HTMLElement;
      const enabled = useAppStore.getState().ui.overlay.isOpen;
      if (enabled) {
        (el as HTMLElement).style.display = 'none';
      }
    });

    // Function to update visibility/state based on enabled status
    const updateState = (enabled: boolean) => {
      const density = useSettingsStore.getState().layoutDensity;
      updateSidebarWidths(density, enabled);

      // Manage Wrapper
      if (enabled) {
        if (!elements.wrapper) {
          const wrapper = document.createElement('div');
          wrapper.id = wrapperId;
          wrapper.style.height = '100%';
          wrapper.style.width = '100%';
          wrapper.style.overflow = 'hidden';

          const stopPropagation = (e: Event) => e.stopPropagation();
          for (const evt of [
            'click',
            'mousedown',
            'mouseup',
            'pointerdown',
            'pointerup',
            'contextmenu',
          ]) {
            wrapper.addEventListener(evt, stopPropagation);
          }

          container.appendChild(wrapper);
          elements.wrapper = wrapper;

          const shadow = wrapper.attachShadow({ mode: 'open' });
          applyShadowStyles(shadow, mainStyles);

          const rootContainer = document.createElement('div');
          rootContainer.classList.add('shadow-body', 'theme-gemini');
          rootContainer.style.height = '100%';

          // Theme sync
          const syncTheme = () => {
            const themeValue = localStorage.getItem('Bard-Color-Theme');
            let isDark = false;
            if (!themeValue) {
              isDark = window.matchMedia(
                '(prefers-color-scheme: dark)',
              ).matches;
            } else {
              isDark = themeValue === 'Bard-Dark-Theme';
            }
            TooltipHelper.getInstance().setTheme(isDark);
            if (isDark) rootContainer.classList.add('dark');
            else rootContainer.classList.remove('dark');
          };
          syncTheme();

          window.addEventListener('storage', (e) => {
            if (e.key === 'Bard-Color-Theme') syncTheme();
          });
          window
            .matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', syncTheme);

          const observer = new MutationObserver(syncTheme);
          observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class', 'data-theme'],
          });

          shadow.appendChild(rootContainer);

          const root = ReactDOM.createRoot(rootContainer);
          root.render(
            <ShadowRootProvider container={rootContainer}>
              <div className="h-full w-full bg-background text-foreground">
                <OverlayPanel className="h-full" />
              </div>
            </ShadowRootProvider>,
          );
        } else {
          elements.wrapper.style.display = 'block';
        }
      } else {
        if (elements.wrapper) {
          elements.wrapper.style.display = 'none';
        }
      }

      // Hide/Show Original Elements (children of container)
      Array.from(container.children).forEach((child) => {
        if (child.id !== wrapperId) {
          const el = child as HTMLElement;
          if (enabled) {
            el.style.position = 'absolute';
            el.style.top = '-9999px';
            el.style.left = '-9999px';
          } else {
            el.style.position = '';
            el.style.top = '';
            el.style.left = '';
          }
        }
      });

      // Update External Elements
      if (elements.sideNavMenuBtn) {
        if (enabled) {
          elements.sideNavMenuBtn.style.position = 'absolute';
          elements.sideNavMenuBtn.style.top = '-9999px';
          elements.sideNavMenuBtn.style.left = '-9999px';
        } else {
          elements.sideNavMenuBtn.style.position = '';
          elements.sideNavMenuBtn.style.top = '';
          elements.sideNavMenuBtn.style.left = '';
        }
      }

      if (elements.searchNavBtn) {
        if (enabled) {
          elements.searchNavBtn.style.display = 'none';
        } else {
          elements.searchNavBtn.style.display = '';
        }
      }
    };

    // Initial state check
    updateState(useAppStore.getState().ui.overlay.isOpen);

    // Subscribe to state changes
    const unsubOverlay = useAppStore.subscribe((state, prevState) => {
      if (state.ui.overlay.isOpen !== prevState.ui.overlay.isOpen) {
        updateState(state.ui.overlay.isOpen);
      }
    });

    // Return handle for cleanup
    return {
      destroy: () => {
        console.log('Better Sidebar: Destroying desktop layout');
        unsubDensity();
        unsubOverlay();
        resizeObserver.disconnect();

        // Restore sidebar widths
        if (originalClosedWidth) {
          bardSidenavEl.style.setProperty(
            '--bard-sidenav-closed-width',
            originalClosedWidth,
          );
        } else {
          bardSidenavEl.style.removeProperty('--bard-sidenav-closed-width');
        }
        if (originalOpenWidth) {
          bardSidenavEl.style.setProperty(
            '--bard-sidenav-open-width',
            originalOpenWidth,
          );
        } else {
          bardSidenavEl.style.removeProperty('--bard-sidenav-open-width');
        }

        // Restore original container children
        Array.from(container.children).forEach((child) => {
          if (child.id !== wrapperId) {
            const el = child as HTMLElement;
            el.style.position = '';
            el.style.top = '';
            el.style.left = '';
          }
        });

        // Restore external elements
        if (elements.sideNavMenuBtn) {
          elements.sideNavMenuBtn.style.position = '';
          elements.sideNavMenuBtn.style.top = '';
          elements.sideNavMenuBtn.style.left = '';
        }
        if (elements.searchNavBtn) {
          elements.searchNavBtn.style.display = '';
        }

        // Remove our wrapper
        if (elements.wrapper) {
          elements.wrapper.remove();
          elements.wrapper = null;
        }
      },
    };
  } catch (e) {
    console.error('Better Sidebar: Desktop layout mount failed', e);
    return null;
  }
}
