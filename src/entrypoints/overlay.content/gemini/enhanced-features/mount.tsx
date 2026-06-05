import React from 'react';
import ReactDOM from 'react-dom/client';
import { GeminiEnhancedFeatures } from './GeminiEnhancedFeatures';
import { ShadowRootProvider } from '@/shared/components/ShadowRootContext';
import { applyShadowStyles } from '@/shared/lib/utils';
import { bindShadowRootToTheme } from '@/themes';
import { useSettingsStore } from '@/shared/lib/settings-store';

/**
 * Independent mounting of Gemini enhanced features (like Default Model selector)
 * that should persist regardless of whether the main OverlayPanel is active.
 */
export function mountEnhancedFeatures(mainStyles: string) {
  try {
    const enhancedWrapper = document.createElement('div');
    enhancedWrapper.id = 'better-sidebar-enhanced-features';
    enhancedWrapper.style.position = 'relative';
    // Keep below overlay modals (z-50 = 50) but above normal page content
    enhancedWrapper.style.zIndex = '40';
    document.body.appendChild(enhancedWrapper);

    const enhancedShadow = enhancedWrapper.attachShadow({ mode: 'open' });
    applyShadowStyles(enhancedShadow, mainStyles);

    const enhancedRoot = document.createElement('div');
    enhancedRoot.classList.add('shadow-body', 'theme-gemini');

    // Gemini style sync (default v2 vs classic)
    const syncGeminiStyle = () => {
      const style = useSettingsStore.getState().geminiStyle;
      if (style === 'classic') {
        enhancedRoot.classList.remove('theme-gemini');
        enhancedRoot.classList.add('theme-gemini-classic');
      } else {
        enhancedRoot.classList.remove('theme-gemini-classic');
        enhancedRoot.classList.add('theme-gemini');
      }
    };
    syncGeminiStyle();
    useSettingsStore.subscribe((state, prevState) => {
      if (state.geminiStyle !== prevState.geminiStyle) {
        syncGeminiStyle();
      }
    });

    // Theme sync for enhanced features container
    const syncEnhancedTheme = () => {
      const themeValue = localStorage.getItem('Bard-Color-Theme');
      let isDark = false;
      if (!themeValue) {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = themeValue === 'Bard-Dark-Theme';
      }
      if (isDark) enhancedRoot.classList.add('dark');
      else enhancedRoot.classList.remove('dark');
    };
    syncEnhancedTheme();

    window.addEventListener('storage', (e) => {
      if (e.key === 'Bard-Color-Theme') syncEnhancedTheme();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncEnhancedTheme);
    new MutationObserver(syncEnhancedTheme).observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    enhancedShadow.appendChild(enhancedRoot);

    // Bind custom theme to this Shadow DOM container
    bindShadowRootToTheme(enhancedRoot);

    const enhancedReactRoot = ReactDOM.createRoot(enhancedRoot);
    enhancedReactRoot.render(
      <ShadowRootProvider container={enhancedRoot}>
        <GeminiEnhancedFeatures />
      </ShadowRootProvider>,
    );

    console.log('Better Sidebar: Enhanced features mounted independently');
  } catch (e) {
    console.error('Better Sidebar: Enhanced features initialization failed', e);
  }
}
