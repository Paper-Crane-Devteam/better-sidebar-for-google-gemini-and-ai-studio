/**
 * AI Studio overlay layout: injects sidebar into .makersuite-layout, hides ms-navbar, mounts OverlayPanel
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { OverlayPanel } from './OverlayPanel';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { TooltipHelper } from '@/shared/lib/tooltip-helper';
import { applyShadowStyles, querySelectorDeep, waitForElement } from '@/shared/lib/utils';
import { useSettingsStore } from '@/shared/lib/settings-store';

export async function initAiStudioOverlay(mainStyles: string): Promise<void> {
  console.log('Better Sidebar: Overlay (AI Studio) Initialized');

  TooltipHelper.getInstance().initialize(mainStyles);

  // 1. Hide Navbar (supports both legacy ms-navbar and the new ms-navbar-v2)
  const style = document.createElement('style');
  style.id = 'better-sidebar-for-google-ai-studio-navbar-hider';
  style.textContent = `
    ms-navbar,
    ms-navbar-v2 {
      display: none !important;
      position: absolute !important;
      left: -9999px !important;
      top: -9999px !important;
    }
  `;
  document.head.appendChild(style);

  try {
    const navbar = await waitForElement('ms-navbar, ms-navbar-v2');
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
  anchor.insertBefore(wrapper, anchor.firstChild);

  const syncSidebarWithNavbar = async () => {
    try {
      const navbar = await waitForElement('ms-navbar, ms-navbar-v2');
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
  
  // Function to update sidebar width based on layout density
  const updateSidebarWidth = (density: 'compact' | 'relaxed') => {
    const width = density === 'compact' ? '300px' : '320px';
    sidebarStyle.textContent = `
      #better-sidebar-for-google-ai-studio-sidebar-wrapper {
        height: 100%;
        width: ${width};
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

  // Initial width based on current density
  updateSidebarWidth(useSettingsStore.getState().layoutDensity);
  document.head.appendChild(sidebarStyle);

  // Subscribe to density changes
  useSettingsStore.subscribe((state) => {
    updateSidebarWidth(state.layoutDensity);
  });

  const shadow = wrapper.attachShadow({ mode: 'open' });
  applyShadowStyles(shadow, mainStyles);

  const rootContainer = document.createElement('div');
  rootContainer.classList.add('shadow-body');
  rootContainer.classList.add('theme-aistudio');

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

  const root = ReactDOM.createRoot(rootContainer);
  root.render(
    <ShadowRootProvider container={rootContainer}>
      <div className="h-full w-full bg-background border-r text-foreground">
        <OverlayPanel className="h-full" />
      </div>
    </ShadowRootProvider>
  );
}
