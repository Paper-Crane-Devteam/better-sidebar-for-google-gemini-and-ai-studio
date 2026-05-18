import { useEffect } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';

/**
 * Auto-hide input feature for Gemini conversation pages.
 *
 * Strategy:
 * - `input-container` stays in normal flow as the hover trigger zone
 * - Its child `fieldset` gets `position: absolute` to visually slide down
 * - On `input-container:hover` or `input-container:focus-within`, fieldset slides back up
 * - When `.cdk-overlay-container` has children (popups/dropdowns open), keep fieldset visible
 *
 * Uses a MutationObserver on .cdk-overlay-container to toggle a body class
 * that forces fieldset to stay visible via CSS.
 */
export const AutoHideInputFeature = () => {
  const autoHideInput = useSettingsStore(
    (s) => s.enhancedFeatures.gemini.autoHideInput,
  );

  useEffect(() => {
    const styleId = 'better-sidebar-auto-hide-input';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    let overlayObserver: MutationObserver | null = null;

    if (!autoHideInput) {
      if (styleEl) styleEl.remove();
      document.body.classList.remove('bs-overlay-open');
      return;
    }

    const isConversationPage = () => {
      const path = window.location.pathname;
      return (
        /\/app\/[a-zA-Z0-9_-]+/.test(path) ||
        /\/gem\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/.test(path)
      );
    };

    // Watch .cdk-overlay-container for children (popups/dropdowns)
    // Only keep fieldset visible if it's currently in the "shown" state
    // (i.e., input-container is hovered or focused), because some overlays
    // are unrelated to the input area.
    // Note: .cdk-overlay-container may not exist initially — it's created
    // lazily on first popup. We use a MutationObserver on body to detect
    // when it appears, then attach a child observer to it.
    const setupOverlayObserver = () => {
      const tryAttach = () => {
        const overlayContainer = document.querySelector('.cdk-overlay-container');
        if (!overlayContainer) return false;

        const checkOverlay = () => {
          const inputContainer = document.querySelector('input-container');
          const isInputExpanded =
            inputContainer?.matches(':hover') ||
            inputContainer?.matches(':focus-within');

          if (overlayContainer.children.length > 0 && isInputExpanded) {
            document.body.classList.add('bs-overlay-open');
          } else {
            document.body.classList.remove('bs-overlay-open');
          }
        };

        checkOverlay();
        overlayObserver = new MutationObserver(checkOverlay);
        overlayObserver.observe(overlayContainer, { childList: true });
        return true;
      };

      // Try immediately
      if (tryAttach()) return;

      // If not found, watch body for the container to appear
      const bodyObserver = new MutationObserver(() => {
        if (tryAttach()) {
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: false });

      // Store for cleanup
      const origDisconnect = overlayObserver?.disconnect.bind(overlayObserver);
      overlayObserver = {
        disconnect: () => {
          bodyObserver.disconnect();
          origDisconnect?.();
        },
      } as MutationObserver;
    };

    const applyStyle = () => {
      if (!isConversationPage()) {
        if (styleEl) styleEl.textContent = '';
        return;
      }

      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }

      styleEl.textContent = `
        /* input-container is the hover trigger, stays in flow */
        input-container {
          position: relative;
        }

        /* fieldset is the visual element that hides/shows */
        input-container > fieldset {
          position: absolute !important;
          transform: translateY(100%);
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease;
          opacity: 0.3;
        }

        /* Reveal on hover or when user is typing */
        input-container:hover > fieldset,
        input-container:focus-within > fieldset {
          transform: translateY(-12px) !important;
          opacity: 1 !important;
        }

        /* Keep visible when overlay popups are open */
        body.bs-overlay-open input-container > fieldset {
          transform: translateY(-12px) !important;
          opacity: 1 !important;
        }
      `;

      setupOverlayObserver();
    };

    applyStyle();

    // Re-apply on SPA navigation
    const navObserver = new MutationObserver(() => {
      requestAnimationFrame(applyStyle);
    });

    navObserver.observe(document.querySelector('title') || document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener('popstate', applyStyle);

    return () => {
      navObserver.disconnect();
      if (overlayObserver) overlayObserver.disconnect();
      window.removeEventListener('popstate', applyStyle);
      document.body.classList.remove('bs-overlay-open');
      if (styleEl) styleEl.remove();
    };
  }, [autoHideInput]);

  return null;
};
