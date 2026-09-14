import { useState, useEffect } from 'react';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { waitForElement } from '@/shared/lib/utils';
import { useUrl } from '@/shared/hooks/useUrl';

/**
 * Width of the sidebar's left icon bar. Mirrors `--sidebar-width` in
 * _gemini.scss and the `--bard-sidenav-closed-width` set in Layout.tsx.
 */
const ICON_BAR_WIDTH = 56;

export const useGeminiUI = () => {
  const geminiSettings = usePegasusStore((s) => s.enhancedFeatures?.gemini);
  const setGeminiFeature = usePegasusStore((s) => s.setGeminiEnhancedFeature);

  const {
    sidebarWidth: storeSidebarWidth = 360,
    chatWidth: storeChatWidth = 46,
    inputWidth: storeInputWidth = 42,
    hideBrand = false,
    hideDisclaimer = false,
    hideUpgrade = false,
    zenMode = false,
    showSmartScrollbar = true,
    tableAutoWidth = false,
  } = geminiSettings ?? {};

  const { path } = useUrl();
  const isGemsCreatePage = path.includes('/gems/create');

  const isSidebarExpanded = useAppStore((s) => s.ui.overlay.isSidebarExpanded);
  const compactMode = useSettingsStore((s) => s.compactMode);

  /**
   * Compact mode shrinks the whole sidenav by the icon bar's width
   * rather than letting the content area stretch into the freed space. That
   * keeps the conversation tree exactly as wide as before, so toggling the
   * icon bar never reflows the tree — only the sidebar's right edge moves.
   */
  const effectiveSidebarWidth = compactMode
    ? storeSidebarWidth - ICON_BAR_WIDTH
    : storeSidebarWidth;

  const [showUpgradeOption, setShowUpgradeOption] = useState(false);


  // Check for upgrade option
  useEffect(() => {
    const checkUpgradeBtn = () => {
      const upgradeBtn =
        document.querySelector('upsell-button') ||
        document.querySelector('g1-dynamic-upsell-button');
      setShowUpgradeOption(!!upgradeBtn);
    };
    checkUpgradeBtn();
    // Re-check after a delay in case of slow rendering
    const timer = setTimeout(checkUpgradeBtn, 2000);
    return () => clearTimeout(timer);
  }, []);

  // On first use (store value is -1), measure current DOM percentage and persist it
  useEffect(() => {
    if (storeChatWidth >= 0 && storeInputWidth >= 0) return;

    const measure = () => {
      const chatHistory = document.getElementById('chat-history');
      if (!chatHistory) return;

      const containerW = chatHistory.getBoundingClientRect().width;
      if (!containerW) return;

      if (storeChatWidth < 0) {
        const chatContent = chatHistory.querySelector(
          '.conversation-container',
        );
        if (chatContent) {
          const percent = Math.round(
            (chatContent.getBoundingClientRect().width / containerW) * 100,
          );
          setGeminiFeature('chatWidth', percent);
        }
      }

      if (storeInputWidth < 0) {
        // Skip measurement on gems creation page
        if (isGemsCreatePage) return;

        const inputField = document.querySelector(
          'input-container > fieldset',
        );
        if (inputField) {
          const percent = Math.round(
            (inputField.getBoundingClientRect().width / containerW) * 100,
          );
          setGeminiFeature('inputWidth', percent);
        }
      }
    };

    // Try immediately, then retry after a short delay for slow-rendering pages
    measure();
    const timer = setTimeout(measure, 1500);
    return () => clearTimeout(timer);
  }, [storeChatWidth, storeInputWidth, setGeminiFeature, isGemsCreatePage]);

  // Apply CSS for all UI tweaks
  useEffect(() => {
    const styleId = 'better-sidebar-gemini-ui-tweaks';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    let css = '';

    // Visibility Toggles
    // [DEPRECATED] hideBrand - bard-mode-switcher element no longer exists in new Gemini UI
    // if (hideBrand) {
    //   css += `bard-mode-switcher:has(bard-logo) { display: none !important; }\n`;
    // }
    if (hideDisclaimer) {
      css += `hallucination-disclaimer { visibility: hidden !important; height: 10px !important; }\n`;
    }
    if (hideUpgrade) {
      css += `upsell-button, g1-dynamic-upsell-button { display: none !important; }\n`;
    }

    // Layout Widths
    css += `
      bard-sidenav { 
        --bard-sidenav-open-width: ${effectiveSidebarWidth}px !important; 
      }
    `;

    if (storeChatWidth > 0 || storeInputWidth > 0) {
      css += `@media (min-width: 960px) {\n`;
      if (storeChatWidth > 0) {
        css += `
        /* Chat Content Control */
        #chat-history .conversation-container {
          max-width: ${storeChatWidth}% !important;
          min-width: 724px !important;
          width: 100% !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        #chat-history .conversation-container user-query {
          max-width: none !important;
        }
        `;
      }
      if (storeInputWidth > 0 && !isGemsCreatePage) {
        css += `
        /* Input Box Control */
        input-container > fieldset {
          max-width: ${storeInputWidth}% !important;
          min-width: 660px !important;
          width: 100% !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        `;
      }
      css += `}\n`;
    }

    if (zenMode) {
      css += `
        bard-sidenav, top-bar-actions, .boqOnegoogleliteOgbOneGoogleBar, .side-nav-menu-button, side-nav-sparkle-button { display: none !important; }
      `;
    }

    if (tableAutoWidth) {
      css += `
        .table-block.new-table-style { max-width: none !important; }
      `;
    }

    // [DEPRECATED] showTopBarTag - removed due to Gemini UI redesign
    // if (geminiSettings.showTopBarTag) {
    //   css += `
    //   /* Override center-section max-width when showing tags */
    //   top-bar-actions .center-section {
    //     max-width: none !important;
    //   }
    //   `;
    // }

    styleEl.textContent = css;
  }, [
    // [DEPRECATED] hideBrand,
    hideDisclaimer,
    hideUpgrade,
    effectiveSidebarWidth,
    storeChatWidth,
    storeInputWidth,
    // [DEPRECATED] geminiSettings.showTopBarTag,
    zenMode,
    tableAutoWidth,
    isGemsCreatePage,
  ]);

  // Handle elements that need to react to sidebar expanded/collapsed state separately
  // gemini new UI seems put top bar on the right side, so this code is not usable, keep commented, later check if delete or not
  // useEffect(() => {
  //   // Top bar actions offset
  //   waitForElement('top-bar-actions').then((el) => {
  //     const topBarActions = el as HTMLElement;
  //     if (topBarActions) {
  //       if (isSidebarExpanded) {
  //         topBarActions.style.left = `${storeSidebarWidth + 1}px`;
  //       } else {
  //         topBarActions.style.left = '57px';
  //       }
  //     }
  //   });
  // }, [isSidebarExpanded, storeSidebarWidth]);
};
