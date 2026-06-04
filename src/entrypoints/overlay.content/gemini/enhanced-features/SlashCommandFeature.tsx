import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import {
  useSlashCommand,
  SlashCommandPopup,
  resolvePromptContent,
  applyVariables,
  createCapsuleElement,
  expandCapsules,
  hasCapsules,
} from '@/entrypoints/overlay.content/shared/modules/slash-command';
import {
  VariableFillForm,
  type VariableFillFormRef,
} from '@/entrypoints/overlay.content/shared/modules/prompts/components/VariableFillForm';
import type { Prompt } from '@/shared/types/db';
import type { InputFieldAdapter } from '@/entrypoints/overlay.content/shared/modules/slash-command/types';

/**
 * Gemini-specific input field adapter.
 * Gemini uses a Quill-based rich-textarea with contenteditable div.
 */
function createGeminiAdapter(): InputFieldAdapter {
  const getEditor = (): HTMLElement | null =>
    document.querySelector('rich-textarea .ql-editor[contenteditable="true"]');

  return {
    getText() {
      const editor = getEditor();
      return editor?.textContent || '';
    },
    setText(text: string) {
      const editor = getEditor();
      if (!editor) return;
      editor.textContent = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    },
    getCursorPosition() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return 0;

      const editor = getEditor();
      if (!editor) return 0;

      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.startContainer, range.startOffset);
      return preRange.toString().length;
    },
    getInputElement() {
      return getEditor();
    },
    focus() {
      getEditor()?.focus();
    },
    replaceRange(start: number, end: number, content: string) {
      const editor = getEditor();
      if (!editor) return;

      // Walk text nodes to find the target range
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let startNode: Node | null = null;
      let startOffset = 0;
      let endNode: Node | null = null;
      let endOffset = 0;

      while (walker.nextNode()) {
        const node = walker.currentNode;
        const nodeLen = node.textContent?.length || 0;

        if (!startNode && offset + nodeLen > start) {
          startNode = node;
          startOffset = start - offset;
        }
        if (!endNode && offset + nodeLen >= end) {
          endNode = node;
          endOffset = end - offset;
          break;
        }
        offset += nodeLen;
      }

      if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);

        document.execCommand('insertText', false, content);
      }
    },
  };
}

/**
 * Insert a capsule into the editor replacing the /query text.
 *
 * Strategy: use execCommand('insertText') to let Quill handle the text
 * replacement properly (no DOM conflicts), then after Quill processes it,
 * wrap the inserted text in a <strong> element.
 */
function insertCapsuleViaSelection(
  editor: HTMLElement,
  slashPos: number,
  cursorPos: number,
  capsuleEl: HTMLElement,
) {
  // The text we want to display in the editor
  const displayText = capsuleEl.textContent || '';
  const promptContent = capsuleEl.getAttribute('data-prompt-content') || '';

  // Walk text nodes to select the /query range
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeLen = node.textContent?.length || 0;

    if (!startNode && offset + nodeLen > slashPos) {
      startNode = node;
      startOffset = slashPos - offset;
    }
    if (!endNode && offset + nodeLen >= cursorPos) {
      endNode = node;
      endOffset = cursorPos - offset;
      break;
    }
    offset += nodeLen;
  }

  if (!startNode || !endNode) return;

  // Select the /query text
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  // Replace with display text + space using insertText (Quill-safe)
  document.execCommand('insertText', false, displayText + '\u00A0');

  // After Quill processes the text insertion, wrap it in <strong>
  requestAnimationFrame(() => {
    wrapTextInCapsule(editor, displayText, promptContent);
  });
}

/**
 * Find the display text in the editor and wrap it in a <strong> capsule.
 * Called after Quill has finished processing the insertText command.
 */
function wrapTextInCapsule(editor: HTMLElement, displayText: string, promptContent: string) {
  // Walk all text nodes looking for our display text
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent || '';
    const idx = text.indexOf(displayText);
    if (idx === -1) continue;

    // Found it — split the text node and wrap the target portion
    const parent = node.parentNode;
    if (!parent) continue;

    // Don't re-wrap if already inside a capsule
    if ((parent as HTMLElement).classList?.contains('bs-prompt-capsule')) continue;

    // Split: [before][capsule text][after]
    const before = text.slice(0, idx);
    const after = text.slice(idx + displayText.length);

    const strong = document.createElement('strong');
    strong.className = 'bs-prompt-capsule';
    strong.setAttribute('data-prompt-content', promptContent);
    strong.textContent = displayText;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(strong);
    if (after) frag.appendChild(document.createTextNode(after));

    parent.replaceChild(frag, node);

    // Place cursor after the strong + nbsp
    const sel = window.getSelection();
    if (sel) {
      const afterNode = strong.nextSibling;
      if (afterNode) {
        const r = document.createRange();
        r.setStartAfter(afterNode);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    return;
  }
}

/**
 * Gemini SlashCommand feature component.
 * Monitors the rich-textarea for '/' input and shows the prompt popup.
 */
export const SlashCommandFeature: React.FC = () => {
  const slashCommandEnabled = useSettingsStore(
    (s) => s.enhancedFeatures.gemini.slashCommand,
  );
  const { t } = useI18n();
  const {
    state,
    handleInput,
    selectPrevious,
    selectNext,
    setHighlight,
    close,
    getSelectedPrompt,
  } = useSlashCommand();

  const adapterRef = useRef<InputFieldAdapter>(createGeminiAdapter());
  const variableFormRef = useRef<VariableFillFormRef | null>(null);
  const [popupPosition, setPopupPosition] = useState({ bottom: 0, left: 0 });

  // Use refs for values needed in event handlers to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleInputRef = useRef(handleInput);
  handleInputRef.current = handleInput;

  const selectPreviousRef = useRef(selectPrevious);
  selectPreviousRef.current = selectPrevious;

  const selectNextRef = useRef(selectNext);
  selectNextRef.current = selectNext;

  const closeRef = useRef(close);
  closeRef.current = close;

  const getSelectedPromptRef = useRef(getSelectedPrompt);
  getSelectedPromptRef.current = getSelectedPrompt;

  /** Insert capsule (<strong>) into editor replacing the /query text */
  const doInsertCapsule = useCallback((
    title: string,
    content: string,
    slashPos: number,
    cursorPos: number,
  ) => {
    const adapter = adapterRef.current;
    const editor = adapter.getInputElement();
    if (!editor) return;

    const capsuleEl = createCapsuleElement({ title, content });
    insertCapsuleViaSelection(editor, slashPos, cursorPos, capsuleEl);

    adapter.focus();
    closeRef.current();
  }, []);

  /** Insert the resolved prompt content, showing variable dialog if needed */
  const insertPromptContent = useCallback(
    (prompt: Prompt) => {
      const adapter = adapterRef.current;
      const { resolvedContent, variables } = resolvePromptContent(prompt);

      // Capture positions NOW before any async operation (dialog) might change state
      const slashPos = stateRef.current.slashPosition;
      const cursorPos = adapter.getCursorPosition();

      if (variables.length > 0) {
        // Close popup first so state doesn't interfere
        closeRef.current();

        // Show variable fill dialog
        useModalStore.getState().open({
          type: 'confirm',
          title: t('slashCommand.fillVariables'),
          content: (
            <VariableFillForm ref={variableFormRef} variables={variables} />
          ),
          confirmText: t('slashCommand.insert'),
          cancelText: t('common.cancel'),
          onConfirm: () => {
            const values = variableFormRef.current?.getValues();
            if (values) {
              const finalContent = applyVariables(resolvedContent, values);
              doInsertCapsule(prompt.title, finalContent, slashPos, cursorPos);
            }
            useModalStore.getState().close();
          },
          onCancel: () => {
            useModalStore.getState().close();
            adapter.focus();
          },
        });
        return;
      }

      doInsertCapsule(prompt.title, resolvedContent, slashPos, cursorPos);
    },
    [t, doInsertCapsule],
  );

  const insertPromptContentRef = useRef(insertPromptContent);
  insertPromptContentRef.current = insertPromptContent;

  /** Handle selecting a prompt from the popup (click) */
  const handleSelect = useCallback(
    (index: number) => {
      const match = state.matches[index];
      if (!match) return;
      insertPromptContent(match.prompt);
    },
    [state.matches, insertPromptContent],
  );

  // Set up input monitoring + submit interception
  useEffect(() => {
    if (!slashCommandEnabled) {
      closeRef.current();
      return;
    }

    const adapter = adapterRef.current;
    let currentEditor: HTMLElement | null = null;

    const onInput = () => {
      const text = adapter.getText();
      const cursorPos = adapter.getCursorPosition();
      handleInputRef.current(text, cursorPos);

      // Update popup position
      const editor = adapter.getInputElement();
      if (editor) {
        const rect = editor.getBoundingClientRect();
        setPopupPosition({
          bottom: window.innerHeight - rect.top + 8,
          left: Math.max(rect.left, 16),
        });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // When popup is open, intercept navigation/selection keys
      if (stateRef.current.isOpen) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            e.stopPropagation();
            selectPreviousRef.current();
            return;
          case 'ArrowDown':
            e.preventDefault();
            e.stopPropagation();
            selectNextRef.current();
            return;
          case 'Enter':
          case 'Tab':
            e.preventDefault();
            e.stopPropagation();
            const prompt = getSelectedPromptRef.current();
            if (prompt) {
              insertPromptContentRef.current(prompt);
            }
            return;
          case 'Escape':
            e.preventDefault();
            e.stopPropagation();
            closeRef.current();
            return;
        }
      }

      // Intercept Backspace: if cursor is inside a capsule <strong>,
      // delete the entire capsule at once instead of character by character.
      if (e.key === 'Backspace' && !stateRef.current.isOpen) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          // Find if cursor is inside a capsule
          let node: Node | null = range.startContainer;
          let capsule: HTMLElement | null = null;
          while (node && node !== adapter.getInputElement()) {
            if (
              node.nodeType === Node.ELEMENT_NODE &&
              (node as HTMLElement).classList?.contains('bs-prompt-capsule')
            ) {
              capsule = node as HTMLElement;
              break;
            }
            node = node.parentNode;
          }
          if (capsule) {
            e.preventDefault();
            e.stopPropagation();
            // Remove the trailing space if present
            const next = capsule.nextSibling;
            if (next?.nodeType === Node.TEXT_NODE && next.textContent?.[0] === ' ') {
              // Remove just the leading space from the text node
              next.textContent = next.textContent.slice(1);
              if (!next.textContent) next.parentNode?.removeChild(next);
            }
            // Remove capsule
            const parent = capsule.parentNode;
            capsule.remove();
            // Trigger input
            adapter.getInputElement()?.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
        }
      }

      // Intercept Enter (send message) to expand capsules first
      if (e.key === 'Enter' && !e.shiftKey && !stateRef.current.isOpen) {
        const editor = adapter.getInputElement();
        if (editor && hasCapsules(editor)) {
          // Expand capsules to their text content before Gemini sends
          expandCapsules(editor);
        }
      }
    };

    const onBlur = () => {
      // Delay to allow popup click to register
      setTimeout(() => {
        if (stateRef.current.isOpen) {
          closeRef.current();
        }
      }, 300);
    };

    const attachListeners = (editor: HTMLElement) => {
      editor.addEventListener('input', onInput);
      editor.addEventListener('keydown', onKeyDown, true);
      editor.addEventListener('blur', onBlur);
    };

    const detachListeners = (editor: HTMLElement) => {
      editor.removeEventListener('input', onInput);
      editor.removeEventListener('keydown', onKeyDown, true);
      editor.removeEventListener('blur', onBlur);
    };

    // Attach to existing editor
    currentEditor = adapter.getInputElement();
    if (currentEditor) {
      attachListeners(currentEditor);
    }

    // Watch for editor appearing/changing (SPA navigation creates new editors)
    const bodyObserver = new MutationObserver(() => {
      const editor = adapter.getInputElement();
      if (editor && editor !== currentEditor) {
        if (currentEditor) detachListeners(currentEditor);
        currentEditor = editor;
        attachListeners(editor);
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    // Also intercept the send button click to expand capsules
    const onSendClick = () => {
      const editor = adapter.getInputElement();
      if (editor && hasCapsules(editor)) {
        expandCapsules(editor);
      }
    };

    // Observe for send button and attach click listener
    const attachSendButton = () => {
      const sendBtn = document.querySelector('button.send-button, button[aria-label="Send message"]');
      if (sendBtn) {
        sendBtn.addEventListener('click', onSendClick, true);
        return sendBtn;
      }
      return null;
    };

    let sendBtn = attachSendButton();
    const sendBtnInterval = setInterval(() => {
      const btn = attachSendButton();
      if (btn && btn !== sendBtn) {
        if (sendBtn) sendBtn.removeEventListener('click', onSendClick, true);
        sendBtn = btn;
      }
    }, 2000);

    return () => {
      if (currentEditor) detachListeners(currentEditor);
      bodyObserver.disconnect();
      clearInterval(sendBtnInterval);
      if (sendBtn) sendBtn.removeEventListener('click', onSendClick, true);
    };
  }, [slashCommandEnabled]);

  if (!slashCommandEnabled || !state.isOpen) return null;

  return (
    <SlashCommandPopup
      matches={state.matches}
      selectedIndex={state.selectedIndex}
      onHighlight={setHighlight}
      onConfirm={handleSelect}
      position={popupPosition}
      query={state.query}
    />
  );
};
