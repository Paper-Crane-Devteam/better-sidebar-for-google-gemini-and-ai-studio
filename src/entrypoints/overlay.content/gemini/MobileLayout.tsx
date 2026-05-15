/**
 * Gemini mobile overlay layout: injects sidebar into mat-sidenav
 * when chat-app has the "mobile" class.
 *
 * Unlike the desktop layout, this does NOT hide native Gemini elements.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayPanel } from './OverlayPanel';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { applyShadowStyles, waitForElement } from '@/shared/lib/utils';
import { useAppStore } from '@/shared/lib/store';

const MOBILE_WRAPPER_ID =
  'better-sidebar-for-google-ai-studio-sidebar-wrapper-mobile';

interface MobileLayoutHandle {
  destroy: () => void;
}

/**
 * Mount the overlay panel inside `mat-sidenav` for mobile mode.
 * Returns a handle with a `destroy()` method to cleanly unmount.
 */
export async function mountMobileLayout(
  mainStyles: string,
): Promise<MobileLayoutHandle | null> {
  try {
    const matSidenav = await waitForElement('mat-sidenav', 5000);
    if (!matSidenav) {
      console.warn(
        'Better Sidebar: Mobile mode - mat-sidenav not found, retrying...',
      );
      return null;
    }

    console.log('Better Sidebar: Mounting mobile layout into mat-sidenav');

    const wrapper = document.createElement('div');
    wrapper.id = MOBILE_WRAPPER_ID;
    wrapper.style.height = '100%';
    wrapper.style.width = '100%';
    wrapper.style.overflow = 'hidden';

    // Prevent events from bubbling to Gemini's native listeners
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

    // Override mat-sidenav styles so our content can size naturally
    (matSidenav as HTMLElement).style.width = 'auto';
    (matSidenav as HTMLElement).style.borderRadius = '0';

    matSidenav.appendChild(wrapper);

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
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = themeValue === 'Bard-Dark-Theme';
      }
      TooltipHelper.getInstance().setTheme(isDark);
      if (isDark) rootContainer.classList.add('dark');
      else rootContainer.classList.remove('dark');
    };
    syncTheme();

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'Bard-Color-Theme') syncTheme();
    };
    window.addEventListener('storage', onStorage);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', syncTheme);

    const bodyObserver = new MutationObserver(syncTheme);
    bodyObserver.observe(document.body, {
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

    // Hide original mat-sidenav children (except our wrapper)
    Array.from(matSidenav.children).forEach((child) => {
      if (child.id !== MOBILE_WRAPPER_ID) {
        (child as HTMLElement).style.display = 'none';
      }
    });

    // Subscribe to overlay open/close state
    const unsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.ui.overlay.isOpen !== prevState.ui.overlay.isOpen) {
        if (state.ui.overlay.isOpen) {
          (matSidenav as HTMLElement).style.width = 'auto';
          (matSidenav as HTMLElement).style.borderRadius = '0';
          wrapper.style.display = 'block';
          Array.from(matSidenav.children).forEach((child) => {
            if (child.id !== MOBILE_WRAPPER_ID) {
              (child as HTMLElement).style.display = 'none';
            }
          });
        } else {
          // Switch to original layout: restore styles
          (matSidenav as HTMLElement).style.width = '';
          (matSidenav as HTMLElement).style.borderRadius = '';
          wrapper.style.display = 'none';
          Array.from(matSidenav.children).forEach((child) => {
            if (child.id !== MOBILE_WRAPPER_ID) {
              (child as HTMLElement).style.display = '';
            }
          });
        }
      }
    });

    // Apply initial state
    if (!useAppStore.getState().ui.overlay.isOpen) {
      (matSidenav as HTMLElement).style.width = '';
      (matSidenav as HTMLElement).style.borderRadius = '';
      wrapper.style.display = 'none';
      Array.from(matSidenav.children).forEach((child) => {
        if (child.id !== MOBILE_WRAPPER_ID) {
          (child as HTMLElement).style.display = '';
        }
      });
    }

    // Force sidebar expanded in mobile since there's no collapsed icon bar
    useAppStore.getState().setSidebarExpanded(true);

    return {
      destroy: () => {
        console.log('Better Sidebar: Destroying mobile layout');
        unsubscribe();
        window.removeEventListener('storage', onStorage);
        mediaQuery.removeEventListener('change', syncTheme);
        bodyObserver.disconnect();
        root.unmount();

        // Restore mat-sidenav styles
        (matSidenav as HTMLElement).style.width = '';
        (matSidenav as HTMLElement).style.borderRadius = '';

        // Restore original mat-sidenav children
        Array.from(matSidenav.children).forEach((child) => {
          if (child.id !== MOBILE_WRAPPER_ID) {
            (child as HTMLElement).style.display = '';
          }
        });

        wrapper.remove();
      },
    };
  } catch (e) {
    console.error('Better Sidebar: Mobile layout mount failed', e);
    return null;
  }
}
