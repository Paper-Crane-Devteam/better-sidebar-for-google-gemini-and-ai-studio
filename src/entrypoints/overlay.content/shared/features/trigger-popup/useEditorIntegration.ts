/**
 * useEditorIntegration — Shared editor DOM integration for trigger popups.
 *
 * Handles:
 * - Attaching input/keydown/blur listeners to contenteditable editor
 * - MutationObserver for SPA navigation (editor re-creation)
 * - Keyboard navigation (↑↓ Enter Tab Escape)
 * - Capsule insertion (replacing trigger+query text with <strong>)
 * - Backspace: delete entire capsule at once
 * - Enter/Send: expand capsules before submission
 * - Popup positioning
 *
 * Both SlashCommandFeature and AgentLoopFeature use this instead of
 * duplicating ~200 lines of nearly identical DOM plumbing.
 */

import { useEffect, useRef, useState } from 'react';
import type { EditorIntegrationConfig, TriggerPopupItem, CapsuleClickInfo } from './types';
import {
  CAPSULE_CLASS,
  CAPSULE_ATTR_CONTENT,
  CAPSULE_ATTR_ID,
  RESULT_CAPSULE_CLASS,
  RESULT_CAPSULE_ATTR_CONTENT,
  insertCapsuleAtRange,
  findCapsuleAtCursor,
  removeCapsule,
  expandCapsules,
  hasCapsules,
  replaceAllContent,
  triggerSend,
  registerBeforeSendHandler,
} from '@/entrypoints/overlay.content/shared/lib/quill-editor';
import { isImeComposing } from '@/entrypoints/overlay.content/shared/lib/ime';

export interface PopupPosition {
  bottom: number;
  left: number;
}

export function useEditorIntegration(config: EditorIntegrationConfig) {
  const [popupPosition, setPopupPosition] = useState<PopupPosition>({ bottom: 0, left: 0 });

  // Store config in refs for stable access inside event handlers
  const configRef = useRef(config);
  configRef.current = config;

  // Expose suppressInput so consumers can suppress input after mouse-click capsule insertion
  const suppressInputRef = useRef<() => void>(() => {});

  useEffect(() => {
    const cfg = configRef.current;
    if (!cfg.enabled) {
      cfg.close();
      return;
    }

    let currentEditor: HTMLElement | null = null;
    // After confirming a selection, suppress input events briefly
    // (capsule insertion via execCommand + rAF DOM manipulation triggers multiple input events)
    let suppressUntil = 0;

    suppressInputRef.current = () => { suppressUntil = Date.now() + 100; };

    // Register the onBeforeSend handler so send-button clicks share the same logic as Enter key
    const unregisterBeforeSend = configRef.current.onBeforeSend
      ? registerBeforeSendHandler((editor) => {
          return configRef.current.onBeforeSend?.(editor) ?? false;
        })
      : null;

    const onInput = () => {
      if (Date.now() < suppressUntil) return;

      const editor = configRef.current.getEditor();
      if (!editor) return;

      const triggerChar = configRef.current.triggerChar;
      const capsuleClass = configRef.current.capsuleClass || CAPSULE_CLASS;

      // Get text and cursor position, but exclude text inside capsules belonging
      // to this trigger — prevents the trigger char inside a capsule from re-opening the popup.
      const { text, cursorPos } = getTextExcludingCapsules(editor, capsuleClass, triggerChar);

      configRef.current.onInput(text, cursorPos);

      // Update popup position
      const rect = editor.getBoundingClientRect();
      setPopupPosition({
        bottom: window.innerHeight - rect.top + 8,
        left: Math.max(rect.left, 16),
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      /**
       * Nothing below is ours while an IME is composing: Enter commits the candidate,
       * Backspace edits the composition, the arrows move through the candidate list.
       *
       * Same bug as AI Studio's — see `isImeComposing`. It bit there first only because
       * that platform's interceptor is the one that owns the send; here it would have
       * expanded a capsule and sent mid-composition just as readily.
       */
      if (isImeComposing(e)) return;

      const state = configRef.current.getPopupState();
      const capsuleClass = configRef.current.capsuleClass || CAPSULE_CLASS;

      // ─── Popup open: intercept navigation ───────────────────
      if (state.isOpen) {
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
            suppressUntil = Date.now() + 100;
            configRef.current.onConfirmSelection();
            configRef.current.close();
            return;
          case 'Escape':
            e.preventDefault();
            e.stopPropagation();
            configRef.current.close();
            return;
        }
      }

      // ─── Backspace: delete entire capsule if cursor is inside one ─────
      if (e.key === 'Backspace' && !state.isOpen) {
        const editor = configRef.current.getEditor();
        if (!editor) return;
        const capsule = findCapsuleAtCursor(editor, capsuleClass);
        if (capsule) {
          e.preventDefault();
          e.stopPropagation();
          removeCapsule(capsule);
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }

      // ─── Enter (send): expand capsules before submission ──────────
      if (e.key === 'Enter' && !e.shiftKey && !state.isOpen) {
        const editor = configRef.current.getEditor();
        if (!editor) return;

        // First: expand any result capsules (bs-agent-result-capsule)
        const resultCapsules = editor.querySelectorAll(`.${RESULT_CAPSULE_CLASS}`);
        if (resultCapsules.length > 0) {
          e.preventDefault();
          e.stopPropagation();

          // Collect all capsule contents and merge into a single <bs_agent_result> block
          const sections: string[] = [];
          resultCapsules.forEach((capsule) => {
            const content = capsule.getAttribute(RESULT_CAPSULE_ATTR_CONTENT) || '';
            sections.push(content);
          });

          // Build merged result text
          const mergedContent = sections.join('\n\n---\n\n');
          const wrappedResult = `<bs_agent_result>\n${mergedContent}\n</bs_agent_result>`;

          // Rewrite editor content via helper (handles Quill sync)
          replaceAllContent(editor, wrappedResult);

          // After Quill processes the new content, click the send button.
          // User pressed Enter, so skip the anti-automation pause.
          void triggerSend({ humanDelay: false });
          return;
        }

        const triggerChar = configRef.current.triggerChar;
        if (hasCapsules(editor, capsuleClass, triggerChar)) {
          // Let consumer handle sending if they want to
          if (configRef.current.onBeforeSend) {
            const handled = configRef.current.onBeforeSend(editor);
            if (handled) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
          // Default: expand only our own capsules in-place, let platform handle the send
          expandCapsules(editor, capsuleClass, triggerChar);
        }
      }
    };

    const onBlur = () => {
      setTimeout(() => {
        if (configRef.current.getPopupState().isOpen) {
          configRef.current.close();
        }
      }, 300);
    };

    const onClick = (e: MouseEvent) => {
      const capsuleClass = configRef.current.capsuleClass || CAPSULE_CLASS;
      const triggerChar = configRef.current.triggerChar;
      const target = (e.target as HTMLElement).closest(`.${capsuleClass}[data-trigger="${triggerChar}"]`);
      if (!target) return;

      const onCapsuleClick = configRef.current.onCapsuleClick;
      if (!onCapsuleClick) return;

      e.preventDefault();
      e.stopPropagation();

      const info: CapsuleClickInfo = {
        element: target as HTMLElement,
        content: target.getAttribute(CAPSULE_ATTR_CONTENT) || '',
        promptId: target.getAttribute(CAPSULE_ATTR_ID) || '',
        rect: target.getBoundingClientRect(),
      };
      onCapsuleClick(info);
    };

    const attachListeners = (editor: HTMLElement) => {
      editor.addEventListener('input', onInput);
      editor.addEventListener('keydown', onKeyDown, true);
      editor.addEventListener('blur', onBlur);
      editor.addEventListener('click', onClick);
    };

    const detachListeners = (editor: HTMLElement) => {
      editor.removeEventListener('input', onInput);
      editor.removeEventListener('keydown', onKeyDown, true);
      editor.removeEventListener('blur', onBlur);
      editor.removeEventListener('click', onClick);
    };

    // Attach to existing editor
    currentEditor = configRef.current.getEditor();
    if (currentEditor) {
      attachListeners(currentEditor);
    }

    // Watch for editor appearing/changing (SPA navigation)
    const bodyObserver = new MutationObserver(() => {
      const editor = configRef.current.getEditor();
      if (editor && editor !== currentEditor) {
        if (currentEditor) detachListeners(currentEditor);
        currentEditor = editor;
        attachListeners(editor);
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (currentEditor) detachListeners(currentEditor);
      bodyObserver.disconnect();
      unregisterBeforeSend?.();
    };
  }, [config.enabled]); // Only re-run if enabled changes

  return {
    popupPosition,
    /** Call before inserting a capsule via mouse click to suppress the subsequent input events */
    suppressInput: () => suppressInputRef.current(),
  };
}

// ─── Capsule DOM helpers (shared between both features) ──────────────────────

/**
 * Insert a capsule into the editor, replacing text from triggerPos to cursorPos.
 * Delegates to quill-editor helper's insertCapsuleAtRange.
 */
export function insertCapsule(
  editor: HTMLElement,
  triggerPos: number,
  cursorPos: number,
  item: TriggerPopupItem,
  triggerChar: string,
): void {
  const displayText = `${triggerChar}${item.title}`;
  insertCapsuleAtRange(editor, triggerPos, cursorPos, displayText, {
    className: CAPSULE_CLASS,
    dataAttrs: {
      [CAPSULE_ATTR_ID]: item.id,
      [CAPSULE_ATTR_CONTENT]: item.content,
      'data-trigger': triggerChar,
    },
  });
}

/**
 * Expand all capsules in the editor — replace <strong> with their stored text content.
 * Returns the full expanded text content of the editor.
 */
export function expandAllCapsules(editor: HTMLElement, capsuleClass: string = CAPSULE_CLASS): string {
  return expandCapsules(editor, capsuleClass);
}

/** Get cursor offset in editor (plain text character count before cursor) */
function getLocalCursorPosition(editor: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;

  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

/**
 * Get editor text and cursor position with capsule text belonging to a specific
 * trigger character replaced by a placeholder that won't contain the trigger char.
 * This prevents the trigger char inside `>Title` capsules from re-opening the popup.
 */
function getTextExcludingCapsules(
  editor: HTMLElement,
  capsuleClass: string,
  triggerChar: string,
): { text: string; cursorPos: number } {
  const sel = window.getSelection();
  const hasSel = sel && sel.rangeCount > 0;
  const cursorRange = hasSel ? sel!.getRangeAt(0) : null;

  let text = '';
  let cursorPos = 0;
  let cursorFound = false;

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeText = node.textContent || '';
      if (!cursorFound && cursorRange && cursorRange.startContainer === node) {
        cursorPos = text.length + cursorRange.startOffset;
        cursorFound = true;
      }
      text += nodeText;
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;

      if (
        el.classList.contains(capsuleClass) &&
        el.getAttribute('data-trigger') === triggerChar
      ) {
        const placeholder = '\u200B'.repeat(el.textContent?.length || 1);
        if (!cursorFound && cursorRange && el.contains(cursorRange.startContainer)) {
          cursorPos = text.length + placeholder.length;
          cursorFound = true;
        }
        text += placeholder;
        return;
      }

      const tag = el.tagName.toLowerCase();
      if (tag === 'br') {
        text += '\n';
        return;
      }

      for (const child of el.childNodes) {
        walk(child);
      }

      if ((tag === 'p' || tag === 'div') && el.nextSibling) {
        text += '\n';
      }
    }
  };

  for (const child of editor.childNodes) {
    walk(child);
  }

  if (!cursorFound) {
    cursorPos = getLocalCursorPosition(editor);
  }

  return { text, cursorPos };
}

/** Get the prompt ID from the first capsule in the editor */
export function getCapsulePromptId(editor: HTMLElement, capsuleClass: string = CAPSULE_CLASS): string | null {
  const capsule = editor.querySelector(`.${capsuleClass}`);
  return capsule?.getAttribute(CAPSULE_ATTR_ID) || null;
}

/** Get the prompt content from the first capsule in the editor */
export function getCapsuleContent(editor: HTMLElement, capsuleClass: string = CAPSULE_CLASS): string | null {
  const capsule = editor.querySelector(`.${capsuleClass}`);
  return capsule?.getAttribute(CAPSULE_ATTR_CONTENT) || null;
}

export { CAPSULE_CLASS, CAPSULE_ATTR_CONTENT, CAPSULE_ATTR_ID };
