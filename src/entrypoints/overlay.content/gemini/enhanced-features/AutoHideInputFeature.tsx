import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useCurrentConversationId } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';

/**
 * Auto-hide input feature for Gemini conversation pages.
 *
 * Strategy:
 * - `input-container` stays in normal flow as the hover trigger zone
 * - Its child `fieldset` gets `position: absolute` to visually slide down
 * - On `input-container:hover` or `input-container:focus-within`, fieldset slides back up
 * - When `.cdk-overlay-container` has children (popups/dropdowns open), keep fieldset visible
 * - On conversation switch (detected via useCurrentConversationId), temporarily reveal fieldset
 *
 * Uses a MutationObserver on .cdk-overlay-container to toggle a body class
 * that forces fieldset to stay visible via CSS.
 */
export const AutoHideInputFeature = () => {
  const autoHideInput = useSettingsStore(
    (s) => s.enhancedFeatures.gemini.autoHideInput,
  );
  const conversationId = useCurrentConversationId();
  const prevConversationIdRef = useRef<string | null | undefined>(undefined);

  // Temporarily reveal input when conversation switches
  useEffect(() => {
    // Skip the initial mount (undefined → first value)
    if (prevConversationIdRef.current === undefined) {
      prevConversationIdRef.current = conversationId;
      return;
    }

    // Only reveal when switching between conversations (both old and new are non-null)
    if (
      autoHideInput &&
      conversationId &&
      prevConversationIdRef.current &&
      conversationId !== prevConversationIdRef.current
    ) {
      document.body.classList.add('bs-input-reveal');

      // Focus the contenteditable input so user can start typing immediately.
      // Once focused, :focus-within keeps the fieldset visible — no timeout needed.
      const focusTimer = setTimeout(() => {
        const editableDiv = document.querySelector(
          'rich-textarea > div[contenteditable]',
        ) as HTMLElement | null;
        if (editableDiv) {
          editableDiv.focus();
          // :focus-within now keeps it visible, remove the reveal class
          document.body.classList.remove('bs-input-reveal');
        }
      }, 300);

      prevConversationIdRef.current = conversationId;
      return () => {
        clearTimeout(focusTimer);
        document.body.classList.remove('bs-input-reveal');
      };
    }

    prevConversationIdRef.current = conversationId;
  }, [conversationId, autoHideInput]);

  useEffect(() => {
    const styleId = 'better-sidebar-auto-hide-input';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    let overlayObserver: MutationObserver | null = null;

    if (!autoHideInput) {
      if (styleEl) styleEl.remove();
      document.body.classList.remove('bs-overlay-open');
      document.body.classList.remove('bs-input-reveal');
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
        // When navigating back to new chat, our absolute positioning CSS is removed.
        // Gemini's layout may have stale calculations — fire resize to fix it.
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
        });
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
          transform: translateY(101px);
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

        /* Temporarily reveal on conversation switch */
        body.bs-input-reveal input-container > fieldset {
          transform: translateY(-12px) !important;
          opacity: 1 !important;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease !important;
        }
      `;

      setupOverlayObserver();
    };

    applyStyle();

    // Re-apply on SPA navigation (title changes)
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
      document.body.classList.remove('bs-input-reveal');
      if (styleEl) styleEl.remove();
    };
  }, [autoHideInput]);

  return null;
};
