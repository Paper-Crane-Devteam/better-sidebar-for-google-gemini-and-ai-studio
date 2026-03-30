/**
 * Gemini overlay layout: injects sidebar into bard-sidenav -> .sidenav-with-history-container
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayPanel } from './OverlayPanel';
import { mountEnhancedFeatures } from './enhanced-features/mount';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import {
  applyShadowStyles,
  querySelectorDeep,
  waitForElement,
} from '@/shared/lib/utils';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useAppStore } from '@/shared/lib/store';

export async function initGeminiOverlay(mainStyles: string): Promise<void> {
  console.log('Better Sidebar: Overlay (Gemini) Initialized');

  TooltipHelper.getInstance().initialize(mainStyles);

  try {
    // 0. Override bard-sidenav CSS variables based on density settings
    const bardSidenav = await waitForElement('bard-sidenav');
    const bardSidenavEl = bardSidenav as HTMLElement;

    // Capture original values (check inline style first, then computed if needed, but usually we want to know if we should remove the inline override)
    // Actually, if we use setProperty on the element, we are setting inline styles.
    // If the original site used inline styles, we want to restore them.
    // If it used class/stylesheet styles, removing our inline style will restore them.
    // So storing what was in `style` attribute is correct.
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
        // Restore original
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
        // relaxed (default)
        bardSidenavEl.style.setProperty('--bard-sidenav-closed-width', '64px');
        bardSidenavEl.style.setProperty('--bard-sidenav-open-width', '360px');
      }
    };

    // Initial application handled in updateState

    // Subscribe to density changes
    useSettingsStore.subscribe((state) => {
      const enabled = useAppStore.getState().ui.overlay.isOpen;
      updateSidebarWidths(state.layoutDensity, enabled);
    });

    // 0.5. Monitor bard-sidenav width to detect open/close state
    if (bardSidenav) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = entry.contentRect.width;
          const density = useSettingsStore.getState().layoutDensity;
          const closedWidth = density === 'compact' ? 56 : 64;
          // If current width is greater than closed width + margin, sidebar is open
          const isSidebarExpanded = width > closedWidth + 10;

          const currentExpanded = useAppStore.getState().ui.overlay.isSidebarExpanded;
          if (currentExpanded !== isSidebarExpanded) {
            useAppStore.getState().setSidebarExpanded(isSidebarExpanded);
          }
        }
      });
      resizeObserver.observe(bardSidenavEl);
    }

    // 1. Find the container
    const container = await waitForElement('.sidenav-with-history-container');

    if (!container) {
      console.error(
        'Better Sidebar: Failed to find .sidenav-with-history-container',
      );
      return;
    }

    console.log('Better Sidebar: Found Gemini sidebar container', container);

    const wrapperId = 'better-sidebar-for-google-ai-studio-sidebar-wrapper';

    // Store references to elements we need to toggle
    const elements = {
      wrapper: null as HTMLElement | null,
      sideNavMenuBtn: null as HTMLElement | null,
      // bardModeSwitcher: null as HTMLElement | null,
      searchNavBtn: null as HTMLElement | null,
      // topBarActions: null as HTMLElement | null,
    };

    // Start looking for external elements
    waitForElement('side-nav-menu-button').then((el) => {
      elements.sideNavMenuBtn = el as HTMLElement;
      // Apply current state
      const enabled = useAppStore.getState().ui.overlay.isOpen;
      if (enabled) {
        (el as HTMLElement).style.position = 'absolute';
        (el as HTMLElement).style.top = '-9999px';
        (el as HTMLElement).style.left = '-9999px';
      }
    });

    // waitForElement('bard-mode-switcher').then((el) => {
    //   elements.bardModeSwitcher = el as HTMLElement;
    //   const enabled = useAppStore.getState().ui.overlay.isOpen;
    //   if (enabled) {
    //     const density = useSettingsStore.getState().layoutDensity;
    //     const width = density === 'compact' ? '281px' : '296px';
    //     (el as HTMLElement).style.setProperty(
    //       '--bard-sidenav-open-closed-width-diff',
    //       width,
    //     );
    //   }
    // });

    waitForElement('search-nav-button').then((el) => {
      elements.searchNavBtn = el as HTMLElement;
      const enabled = useAppStore.getState().ui.overlay.isOpen;
      if (enabled) {
        (el as HTMLElement).style.display = 'none';
      }
    });

    // waitForElement('top-bar-actions').then((el) => {
    //   elements.topBarActions = el as HTMLElement;
    //   const enabled = useAppStore.getState().ui.overlay.isOpen;
    //   if (enabled) {
    //     (el as HTMLElement).style.left = '361px';
    //   }
    // });

    // Function to update visibility/state based on enabled status
    const updateState = (enabled: boolean) => {
      // 0. Update Sidebar Widths
      const density = useSettingsStore.getState().layoutDensity;
      updateSidebarWidths(density, enabled);

      // 1. Manage Wrapper
      if (enabled) {
        if (!elements.wrapper) {
          // Create wrapper if doesn't exist
          const wrapper = document.createElement('div');
          wrapper.id = wrapperId;
          wrapper.style.height = '100%';
          wrapper.style.width = '100%';
          wrapper.style.overflow = 'hidden';

          // Prevent all mouse/pointer events from bubbling out to Gemini's native listeners
          const stopPropagation = (e: Event) => e.stopPropagation();
          for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu']) {
            wrapper.addEventListener(evt, stopPropagation);
          }

          container.appendChild(wrapper);
          elements.wrapper = wrapper;

          const shadow = wrapper.attachShadow({ mode: 'open' });
          applyShadowStyles(shadow, mainStyles);

          const rootContainer = document.createElement('div');
          rootContainer.classList.add('shadow-body');
          rootContainer.classList.add('theme-gemini');
          rootContainer.style.height = '100%';

          // Theme sync
          const syncTheme = () => {
            const themeValue = localStorage.getItem('Bard-Color-Theme');
            let isDark = false;
            if (!themeValue) {
              isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            } else {
              isDark = themeValue === 'Bard-Dark-Theme';
            }

            TooltipHelper.getInstance().setTheme(isDark);
            if (isDark) rootContainer.classList.add('dark');
            else rootContainer.classList.remove('dark');
          };
          syncTheme();

          window.addEventListener('storage', (e) => {
            if (e.key === 'Bard-Color-Theme') {
              syncTheme();
            }
          });
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);

          const observer = new MutationObserver(syncTheme);
          observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class', 'data-theme'],
          });

          shadow.appendChild(rootContainer);

          // Render React App
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

      // 2. Hide/Show Original Elements (children of container)
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

      // 3. Update External Elements
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

      // if (elements.bardModeSwitcher) {
      //   if (!enabled) {
      //     elements.bardModeSwitcher.style.removeProperty(
      //       '--bard-sidenav-open-closed-width-diff',
      //     );
      //   }
      // }

      if (elements.searchNavBtn) {
        if (enabled) {
          elements.searchNavBtn.style.display = 'none';
        } else {
          elements.searchNavBtn.style.display = '';
        }
      }

      // if (elements.topBarActions) {
      //   if (!enabled) {
      //     elements.topBarActions.style.left = '';
      //   }
      // }
    };

    // Initial state check
    updateState(useAppStore.getState().ui.overlay.isOpen);

    // Subscribe to state changes
    useAppStore.subscribe((state, prevState) => {
      if (state.ui.overlay.isOpen !== prevState.ui.overlay.isOpen) {
        updateState(state.ui.overlay.isOpen);
      }
    });
  } catch (e) {
    console.error('Better Sidebar: Gemini overlay initialization failed', e);
  }

  // Mount Enhanced Features independently from OverlayPanel
  mountEnhancedFeatures(mainStyles);
}
