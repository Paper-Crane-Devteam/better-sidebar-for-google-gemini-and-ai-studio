import { useState, useEffect, useMemo } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { debounce, throttle } from 'lodash';
import { useAppStore } from '@/shared/lib/store';
import { waitForElement } from '@/shared/lib/utils';

export const useGeminiUI = () => {
  const geminiSettings = useSettingsStore((s) => s.enhancedFeatures.gemini);
  const setGeminiFeature = useSettingsStore((s) => s.setGeminiFeature);

  const pegasusGeminiFeatures = usePegasusStore(
    (s) => s.enhancedFeatures.gemini,
  );
  const setPegasusGeminiFeature = usePegasusStore(
    (s) => s.setGeminiEnhancedFeature,
  );

  const {
    sidebarWidth: storeSidebarWidth,
    chatWidth: storeChatWidth,
    inputWidth: storeInputWidth,
    hideBrand,
    hideDisclaimer,
    hideUpgrade,
    zenMode,
    showSmartScrollbar,
  } = geminiSettings;
  const isSidebarExpanded = useAppStore((s) => s.ui.overlay.isSidebarExpanded);

  const [showUpgradeOption, setShowUpgradeOption] = useState(false);

  // Local state for immediate feedback on sliders
  const [localSidebarWidth, setLocalSidebarWidth] = useState(storeSidebarWidth);
  const [localChatWidth, setLocalChatWidth] = useState(storeChatWidth);
  const [localInputWidth, setLocalInputWidth] = useState(storeInputWidth);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measuredChatWidth, setMeasuredChatWidth] = useState(0);
  const [measuredInputWidth, setMeasuredInputWidth] = useState(0);

  // Check for upgrade option
  useEffect(() => {
    const checkUpgradeBtn = () => {
      const upgradeBtn = document.querySelector('upsell-button');
      setShowUpgradeOption(!!upgradeBtn);
    };
    checkUpgradeBtn();
    // Re-check after a delay in case of slow rendering
    const timer = setTimeout(checkUpgradeBtn, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Measure elements on window resize
  useEffect(() => {
    const updateMeasurements = throttle(() => {
      const chatHistory = document.getElementById('chat-history');
      if (chatHistory) {
        setContainerWidth(chatHistory.getBoundingClientRect().width);

        const chatContent = chatHistory.querySelector(
          '.conversation-container',
        );
        if (chatContent)
          setMeasuredChatWidth(chatContent.getBoundingClientRect().width);

        const inputField = chatHistory.querySelector(
          'input-container > fieldset',
        );
        if (inputField)
          setMeasuredInputWidth(inputField.getBoundingClientRect().width);
      }
    }, 100);

    updateMeasurements();

    window.addEventListener('resize', updateMeasurements);

    return () => {
      window.removeEventListener('resize', updateMeasurements);
      updateMeasurements.cancel();
    };
  }, []);

  // Sync local state when store changes (e.g., from another instance or initial load)
  useEffect(() => {
    setLocalSidebarWidth(storeSidebarWidth);
  }, [storeSidebarWidth]);

  useEffect(() => {
    setLocalChatWidth(storeChatWidth);
  }, [storeChatWidth]);

  useEffect(() => {
    setLocalInputWidth(storeInputWidth);
  }, [storeInputWidth]);

  // Debounced update to the store
  const debouncedSetSidebarWidth = useMemo(
    () => debounce((v: number) => setGeminiFeature('sidebarWidth', v), 300),
    [setGeminiFeature],
  );

  const debouncedSetChatWidth = useMemo(
    () => debounce((v: number) => setGeminiFeature('chatWidth', v), 300),
    [setGeminiFeature],
  );

  const debouncedSetInputWidth = useMemo(
    () => debounce((v: number) => setGeminiFeature('inputWidth', v), 300),
    [setGeminiFeature],
  );
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
    if (hideBrand) {
      css += `bard-mode-switcher:has(bard-logo) { display: none !important; }\n`;
    }
    if (hideDisclaimer) {
      css += `hallucination-disclaimer { visibility: hidden !important; height: 10px !important; }\n`;
    }
    if (hideUpgrade) {
      css += `upsell-button { display: none !important; }\n`;
    }

    // Layout Widths
    css += `
      bard-sidenav { 
        --bard-sidenav-open-width: ${storeSidebarWidth}px !important; 
      }

      ${
        storeChatWidth > 0
          ? `
      /* Chat Content Control */
      #chat-history .conversation-container {
        max-width: ${storeChatWidth}% !important;
        width: 100% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      #chat-history .conversation-container user-query {
        max-width: none !important;
      }`
          : ''
      }
      ${
        storeInputWidth > 0
          ? `
      /* Input Box Control */
      input-container > fieldset {
        max-width: ${storeInputWidth}% !important;
        width: 100% !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }`
          : ''
      }
    `;

    if (zenMode) {
      css += `
        bard-sidenav, top-bar-actions, .boqOnegoogleliteOgbOneGoogleBar, .side-nav-menu-button { display: none !important; }
      `;
    }

    if (geminiSettings.showTopBarTag) {
      css += `
      /* Override center-section max-width when showing tags */
      top-bar-actions .center-section {
        max-width: none !important;
      }
      `;
    }

    styleEl.textContent = css;
  }, [
    hideBrand,
    hideDisclaimer,
    hideUpgrade,
    storeSidebarWidth,
    storeChatWidth,
    storeInputWidth,
    geminiSettings.showTopBarTag,
    zenMode,
  ]);

  // Handle elements that need to react to sidebar expanded/collapsed state separately
  useEffect(() => {
    // Top bar actions offset
    waitForElement('top-bar-actions').then((el) => {
      const topBarActions = el as HTMLElement;
      if (topBarActions) {
        if (isSidebarExpanded) {
          topBarActions.style.left = `${storeSidebarWidth + 1}px`;
        } else {
          const density = useSettingsStore.getState().layoutDensity;
          topBarActions.style.left = density === 'compact' ? '57px' : '65px';
        }
      }
    });
  }, [isSidebarExpanded, storeSidebarWidth]);

  // Bard mode switcher (Gemini Logo/Brand) diff width
  // This element's width is calculated as current closed width + this diff.
  useEffect(() => {
    const updateBardModeSwitcher = (el?: HTMLElement) => {
      const bardModeSwitcher =
        el || (document.querySelector('bard-mode-switcher') as HTMLElement);
      if (bardModeSwitcher) {
        const density = useSettingsStore.getState().layoutDensity;
        const closedWidth = density === 'compact' ? 56 : 64;
        const diffWidth = storeSidebarWidth - closedWidth;
        bardModeSwitcher.style.setProperty(
          '--bard-sidenav-open-closed-width-diff',
          `${diffWidth}px`,
        );
      }
    };

    waitForElement('bard-mode-switcher').then((el) => {
      updateBardModeSwitcher(el as HTMLElement);
    });
  }, [storeSidebarWidth]);

  return {
    sidebarWidth: localSidebarWidth,
    chatWidth: localChatWidth,
    inputWidth: localInputWidth,
    containerWidth,
    measuredChatWidth,
    measuredInputWidth,
    hideBrand,
    hideDisclaimer,
    hideUpgrade,
    showUpgradeOption,
    showTopBarTag: geminiSettings.showTopBarTag,
    zenMode,
    removeWatermark: pegasusGeminiFeatures.removeWatermark,
    setSidebarWidth: (v: number) => {
      setLocalSidebarWidth(v);
      debouncedSetSidebarWidth(v);
    },
    setChatWidth: (v: number) => {
      setLocalChatWidth(v);
      debouncedSetChatWidth(v);
    },
    setInputWidth: (v: number) => {
      setLocalInputWidth(v);
      debouncedSetInputWidth(v);
    },
    setHideBrand: (v: boolean) => setGeminiFeature('hideBrand', v),
    setHideDisclaimer: (v: boolean) => setGeminiFeature('hideDisclaimer', v),
    setHideUpgrade: (v: boolean) => setGeminiFeature('hideUpgrade', v),
    setShowTopBarTag: (v: boolean) => setGeminiFeature('showTopBarTag', v),
    setZenMode: (v: boolean) => setGeminiFeature('zenMode', v),
    showSmartScrollbar,
    setShowSmartScrollbar: (v: boolean) =>
      setGeminiFeature('showSmartScrollbar', v),
    setRemoveWatermark: (v: boolean) =>
      setPegasusGeminiFeature('removeWatermark', v),
  };
};
