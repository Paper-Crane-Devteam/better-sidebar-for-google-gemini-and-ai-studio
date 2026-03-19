import { useEffect } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';

/**
 * Gemini disables the "Update" button when editing a sent message
 * unless the content has actually changed. This feature removes
 * that restriction by observing the DOM for disabled update buttons
 * and unlocking them immediately.
 *
 * Target selector: user-query-content .edit-container .update-button
 * Removes: disabled attribute, mat-ripple-loader-disabled attribute,
 *          mat-mdc-button-disabled class
 */
export const QuickResendFeature = () => {
  const quickResend = useSettingsStore((s) => s.enhancedFeatures.gemini.quickResend);

  useEffect(() => {
    if (!quickResend) return;

    const unlockButton = (btn: Element) => {
      btn.removeAttribute('disabled');
      btn.removeAttribute('mat-ripple-loader-disabled');
      btn.classList.remove('mat-mdc-button-disabled');
    };

    const unlockAll = () => {
      document
        .querySelectorAll('user-query-content .edit-container .update-button[disabled]')
        .forEach(unlockButton);
    };

    // Initial pass
    unlockAll();

    // Observe for dynamically added / toggled buttons
    const observer = new MutationObserver(unlockAll);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class'],
    });

    return () => observer.disconnect();
  }, [quickResend]);

  return null;
};
