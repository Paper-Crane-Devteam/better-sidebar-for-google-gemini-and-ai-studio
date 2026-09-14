/**
 * useAIStudioEditorIntegration — Editor integration for AI Studio's textarea.
 *
 * AI Studio uses a plain Angular-controlled <textarea> (not a contenteditable).
 * This hook provides:
 * - Input event listening for trigger char detection
 * - Keyboard navigation (↑↓ Enter Tab Escape)
 * - MutationObserver to handle SPA navigation (textarea re-creation)
 * - Popup positioning relative to the textarea
 *
 * - Send interception, for consumers that need to rewrite the message on its way out
 *
 * No capsule support — AI Studio's textarea is plain text only.
 * Content is expanded inline immediately on selection.
 *
 * Used by both trigger features: `/` (snippets, plain insert) and `>` (agent entries,
 * which also claim the send). One instance per trigger char, same as on Gemini.
 */

import { useEffect, useRef, useState } from 'react';
import type { TriggerPopupState } from '@/entrypoints/overlay.content/shared/features/trigger-popup/types';
import {
  installRunInterceptor,
  registerBeforeRunHandler,
} from '@/entrypoints/overlay.content/shared/lib/aistudio-editor';
import { isImeComposing } from '@/entrypoints/overlay.content/shared/lib/ime';

export interface PopupPosition {
  bottom: number;
  left: number;
}

export interface AIStudioEditorIntegrationConfig {
  /** Get the textarea element */
  getTextarea: () => HTMLTextAreaElement | null;
  /** Whether the feature is enabled */
  enabled: boolean;
  /** The trigger character (e.g. '/') */
  triggerChar: string;
  /** Called with (text, cursorPos) on input */
  onInput: (text: string, cursorPos: number) => void;
  /** Get current popup state */
  getPopupState: () => TriggerPopupState;
  /** Keyboard handlers */
  selectPrevious: () => void;
  selectNext: () => void;
  close: () => void;
  /** Called when user confirms selection via Enter/Tab */
  onConfirmSelection: () => void;
  /**
   * Take over the send, both from the Run button and from the Enter key.
   *
   * Return true to claim it — the caller is then responsible for actually sending.
   * Return false to let AI Studio send normally.
   *
   * ⚠️ Only one consumer per page can register this (`registerBeforeRunHandler` is a
   * single module-level slot, same as the Gemini side). `/` leaves it undefined and
   * `>` claims it.
   */
  onBeforeSend?: () => boolean;
}

export function useAIStudioEditorIntegration(config: AIStudioEditorIntegrationConfig) {
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({ bottom: 0, left: 0 });

  const configRef = useRef(config);
  configRef.current = config;

  /** Suppress input handling briefly after a programmatic write */
  const suppressUntilRef = useRef(0);

  useEffect(() => {
    if (!configRef.current.enabled) {
      configRef.current.close();
      return;
    }

    let currentTextarea: HTMLTextAreaElement | null = null;

    // Both send paths (Run button click, Enter) funnel through one handler so they
    // cannot disagree about what a send means.
    installRunInterceptor();
    const unregisterBeforeRun = configRef.current.onBeforeSend
      ? registerBeforeRunHandler(() => configRef.current.onBeforeSend?.() ?? false)
      : null;

    const onInput = () => {
      const textarea = configRef.current.getTextarea();
      if (!textarea) return;
      if (Date.now() < suppressUntilRef.current) return;

      const text = textarea.value;
      const cursorPos = textarea.selectionStart;

      configRef.current.onInput(text, cursorPos);

      // Update popup position based on textarea location
      const rect = textarea.getBoundingClientRect();
      setPopupPosition({
        bottom: window.innerHeight - rect.top + 8,
        left: Math.max(rect.left, 16),
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // While a candidate list is up, every key below belongs to the input method:
      // Enter commits the candidate, the arrows move through it, Escape cancels it.
      if (isImeComposing(e)) return;

      const state = configRef.current.getPopupState();

      if (!state.isOpen) return;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          configRef.current.selectPrevious();
          return;
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          configRef.current.selectNext();
          return;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          // The write that follows fires input events of its own; letting them through
          // would immediately re-open the popup on the inserted text.
          suppressUntilRef.current = Date.now() + 100;
          configRef.current.onConfirmSelection();
          return;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          configRef.current.close();
          return;
      }
    };

    const onBlur = () => {
      // Delay to allow popup click events to fire before closing
      setTimeout(() => {
        if (configRef.current.getPopupState().isOpen) {
          configRef.current.close();
        }
      }, 300);
    };

    // Also listen to selectionchange for cursor movement without typing
    // (e.g. clicking to a different position in the textarea)
    const onSelectionChange = () => {
      const textarea = configRef.current.getTextarea();
      if (!textarea || document.activeElement !== textarea) return;

      // Only process if popup is open — no need to re-trigger detection
      // on every cursor move
      if (configRef.current.getPopupState().isOpen) {
        const text = textarea.value;
        const cursorPos = textarea.selectionStart;
        configRef.current.onInput(text, cursorPos);
      }
    };

    const attachListeners = (textarea: HTMLTextAreaElement) => {
      textarea.addEventListener('input', onInput);
      textarea.addEventListener('keydown', onKeyDown, true);
      textarea.addEventListener('blur', onBlur);
      document.addEventListener('selectionchange', onSelectionChange);
    };

    const detachListeners = (textarea: HTMLTextAreaElement) => {
      textarea.removeEventListener('input', onInput);
      textarea.removeEventListener('keydown', onKeyDown, true);
      textarea.removeEventListener('blur', onBlur);
      document.removeEventListener('selectionchange', onSelectionChange);
    };

    // Attach to existing textarea
    currentTextarea = configRef.current.getTextarea();
    if (currentTextarea) {
      attachListeners(currentTextarea);
    }

    // Watch for textarea appearing/changing (SPA navigation, Angular re-render)
    const bodyObserver = new MutationObserver(() => {
      const textarea = configRef.current.getTextarea();
      if (textarea && textarea !== currentTextarea) {
        if (currentTextarea) detachListeners(currentTextarea);
        currentTextarea = textarea;
        attachListeners(textarea);
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (currentTextarea) detachListeners(currentTextarea);
      bodyObserver.disconnect();
      unregisterBeforeRun?.();
    };
  }, [config.enabled]);

  return { popupPosition };
}
