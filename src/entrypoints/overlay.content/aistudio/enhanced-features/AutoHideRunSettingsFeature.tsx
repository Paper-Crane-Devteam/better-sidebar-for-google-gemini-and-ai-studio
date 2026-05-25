import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';

/**
 * Auto-hide run settings panel for AI Studio.
 *
 * Logic:
 * - When enabled, continuously observe the document for
 *   `[aria-label="Close run settings panel"]` button appearances.
 *   If it appears (and not suspended), click it automatically.
 * - If the user manually clicks `[aria-label="Toggle run settings panel"]`,
 *   temporarily suspend auto-close (the user wants to see it).
 * - When the user manually clicks `[aria-label="Close run settings panel"]`,
 *   resume auto-close logic.
 *
 * Uses a single MutationObserver on document.body (subtree) so it survives
 * SPA navigation where ms-right-side-panel gets destroyed and recreated.
 */
export const AutoHideRunSettingsFeature = () => {
  const autoHideRunSettings = useSettingsStore(
    (s) => s.enhancedFeatures.aistudio?.autoHideRunSettings ?? false,
  );

  const suspendedRef = useRef(false);

  // Inject CSS to kill Angular slideInOut animation on the panel
  useEffect(() => {
    const styleId = 'better-sidebar-aistudio-kill-run-settings-anim';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

    if (!autoHideRunSettings) {
      if (styleEl) styleEl.remove();
      // Notify main-world to stop killing animations
      window.dispatchEvent(
        new CustomEvent('BETTER_SIDEBAR_KILL_RUN_SETTINGS_ANIM', {
          detail: { enabled: false },
        }),
      );
      return;
    }

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      ms-right-side-panel {
        overflow: hidden !important;
      }
    `;

    // Notify main-world to patch Element.prototype.animate for this panel
    window.dispatchEvent(
      new CustomEvent('BETTER_SIDEBAR_KILL_RUN_SETTINGS_ANIM', {
        detail: { enabled: true },
      }),
    );

    return () => {
      if (styleEl) styleEl.remove();
      window.dispatchEvent(
        new CustomEvent('BETTER_SIDEBAR_KILL_RUN_SETTINGS_ANIM', {
          detail: { enabled: false },
        }),
      );
    };
  }, [autoHideRunSettings]);

  useEffect(() => {
    if (!autoHideRunSettings) {
      suspendedRef.current = false;
      return;
    }

    // Listen for user clicking "Toggle run settings panel" to suspend auto-close
    const toggleListener = (e: Event) => {
      const target = e.target as HTMLElement;
      const toggleBtn = target.closest(
        '[aria-label="Toggle run settings panel"]',
      );
      if (toggleBtn) {
        suspendedRef.current = true;
      }
    };

    // Listen for user clicking "Close run settings panel" to resume auto-close
    const closeListener = (e: Event) => {
      const target = e.target as HTMLElement;
      const closeBtn = target.closest(
        '[aria-label="Close run settings panel"]',
      );
      if (closeBtn && suspendedRef.current) {
        suspendedRef.current = false;
      }
    };

    document.addEventListener('click', toggleListener, true);
    document.addEventListener('click', closeListener, true);

    const tryAutoClose = () => {
      if (suspendedRef.current) return;
      const closeBtn = document.querySelector(
        'ms-right-side-panel [aria-label="Close run settings panel"]',
      ) as HTMLElement | null;
      if (closeBtn) {
        closeBtn.click();
      }
    };

    // Check immediately on mount
    tryAutoClose();

    // Observe the entire document for panel changes (survives SPA navigation)
    const observer = new MutationObserver(() => {
      tryAutoClose();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.removeEventListener('click', toggleListener, true);
      document.removeEventListener('click', closeListener, true);
      suspendedRef.current = false;
    };
  }, [autoHideRunSettings]);

  return null;
};
