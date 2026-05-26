import { useEffect } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';

/**
 * Auto-hide input feature for AI Studio conversation pages.
 *
 * Strategy:
 * - Target: `ms-chunk-editor > footer` (direct child <footer> element)
 * - The footer is positioned absolute at the bottom, translated down to hide
 * - A small peek strip (12px) remains as the hover trigger zone
 * - On hover or focus-within, the footer slides back up
 * - `.chunk-editor-main` gets relative + overflow:hidden to contain the layout
 * - When `.cdk-overlay-container` has children (popups/dropdowns open from the
 *   input area), keep footer visible via a body class `bs-aistudio-overlay-open`
 *
 * DOM structure (AI Studio):
 *   ms-chunk-editor
 *     .chunk-editor-main  (the conversation/content area)
 *     footer              (the input area we want to auto-hide)
 */
export const AutoHideInputFeature = () => {
  const autoHideInput = useSettingsStore(
    (s) => s.enhancedFeatures.aistudio?.autoHideInput ?? false,
  );

  useEffect(() => {
    const styleId = 'better-sidebar-aistudio-auto-hide-input';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!autoHideInput) {
      if (styleEl) styleEl.remove();
      document.body.classList.remove('bs-aistudio-overlay-open');
      return;
    }

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      /* Auto-hide input for AI Studio */

      /* The footer becomes the hover trigger zone */
      ms-chunk-editor footer {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        transform: translateY(calc(100% - 12px));
        transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.35s ease;
        opacity: 0.3;
        z-index: 10;
      }

      /* The main content area needs relative positioning and overflow hidden
         so the footer slides below it cleanly */
      ms-chunk-editor .chunk-editor-main {
        position: relative !important;
        overflow: hidden !important;
      }

      /* Reveal on hover or when user is typing/focusing */
      ms-chunk-editor footer:hover,
      ms-chunk-editor footer:focus-within {
        transform: translateY(0) !important;
        opacity: 1 !important;
      }

      /* Keep visible when overlay popups are open (e.g. model picker, attachments) */
      body.bs-aistudio-overlay-open ms-chunk-editor footer {
        transform: translateY(0) !important;
        opacity: 1 !important;
      }
    `;

    // Watch .cdk-overlay-container for children (popups/dropdowns).
    // The container may not exist yet (Angular creates it lazily).
    // If it doesn't exist, treat it as empty (no overlay open).
    // Use a single body subtree observer to handle both cases.
    let overlayObserver: MutationObserver | null = null;
    let currentOverlayContainer: Element | null = null;

    const checkOverlay = () => {
      const overlayContainer = document.querySelector(
        '.cdk-overlay-container',
      );

      // If container appeared/changed, re-attach dedicated observer
      if (overlayContainer && overlayContainer !== currentOverlayContainer) {
        overlayObserver?.disconnect();
        currentOverlayContainer = overlayContainer;
        overlayObserver = new MutationObserver(checkOverlay);
        overlayObserver.observe(overlayContainer, { childList: true });
      }

      // Determine state: no container or empty container = no overlay
      const hasOverlay =
        overlayContainer != null && overlayContainer.children.length > 0;

      if (hasOverlay) {
        document.body.classList.add('bs-aistudio-overlay-open');
      } else {
        document.body.classList.remove('bs-aistudio-overlay-open');
      }
    };

    checkOverlay();

    // Observe body subtree to detect when cdk-overlay-container is created/destroyed
    const bodyObserver = new MutationObserver(checkOverlay);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      bodyObserver.disconnect();
      if (overlayObserver) overlayObserver.disconnect();
      document.body.classList.remove('bs-aistudio-overlay-open');
      if (styleEl) styleEl.remove();
    };
  }, [autoHideInput]);

  return null;
};
