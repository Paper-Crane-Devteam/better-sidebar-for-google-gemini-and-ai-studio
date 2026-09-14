/**
 * SlashCommandFeature for AI Studio.
 *
 * AI Studio uses an Angular-controlled <textarea> inside:
 *   ms-chunk-editor ms-prompt-box .prompt-box-container textarea
 *
 * Unlike Gemini's Quill contenteditable, this is a plain textarea:
 * - No capsule (rich text) support — we expand content inline on select
 * - Text manipulation via native value setter + input event dispatch
 * - Cursor control via selectionStart/selectionEnd
 *
 * The shared useTriggerPopup + SlashCommandPopup are reused as-is.
 */

import React, { useRef, useCallback } from 'react';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  useSlashCommand,
  SlashCommandPopup,
  resolvePromptContent,
  applyVariables,
} from '@/entrypoints/overlay.content/shared/modules/slash-command';
import {
  VariableFillForm,
  type VariableFillFormRef,
} from '@/entrypoints/overlay.content/shared/modules/prompts/components/VariableFillForm';
import type { Prompt } from '@/shared/types/db';
import { useModalStore } from '@/shared/lib/modal';
import { useAIStudioEditorIntegration } from './useAIStudioEditorIntegration';

// ─── Textarea Selector ───────────────────────────────────────────────────────

const TEXTAREA_SELECTOR = 'ms-chunk-editor ms-prompt-box .prompt-box-container textarea';
const TEXTAREA_SELECTOR_FALLBACK = 'ms-chunk-editor textarea';

function getTextarea(): HTMLTextAreaElement | null {
  return (
    document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR) ||
    document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR_FALLBACK)
  );
}

export const SlashCommandFeature: React.FC = () => {
  const slashCommandEnabled = usePegasusStore(
    (s) => s.enhancedFeatures.aistudio?.slashCommand ?? true,
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

  const variableFormRef = useRef<VariableFillFormRef | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const getSelectedPromptRef = useRef(getSelectedPrompt);
  getSelectedPromptRef.current = getSelectedPrompt;

  function doInsertPrompt(prompt: Prompt) {
    const { resolvedContent, variables } = resolvePromptContent(prompt);
    const triggerPos = stateRef.current.slashPosition;
    const textarea = getTextarea();
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;

    if (variables.length > 0) {
      close();
      useModalStore.getState().open({
        type: 'confirm',
        title: t('slashCommand.fillVariables'),
        content: <VariableFillForm ref={variableFormRef} variables={variables} />,
        confirmText: t('slashCommand.insert'),
        cancelText: t('common.cancel'),
        onConfirm: () => {
          const values = variableFormRef.current?.getValues();
          if (values) {
            const finalContent = applyVariables(resolvedContent, values);
            replaceTextareaRange(textarea, triggerPos, cursorPos, finalContent);
          }
          useModalStore.getState().close();
        },
        onCancel: () => {
          useModalStore.getState().close();
          textarea.focus();
        },
      });
      return;
    }

    close();
    replaceTextareaRange(textarea, triggerPos, cursorPos, resolvedContent);
    textarea.focus();
  }

  const doInsertPromptRef = useRef(doInsertPrompt);
  doInsertPromptRef.current = doInsertPrompt;

  const { popupPosition } = useAIStudioEditorIntegration({
    getTextarea,
    enabled: slashCommandEnabled,
    triggerChar: '/',
    onInput: handleInput,
    getPopupState: () => stateRef.current as any,
    selectPrevious,
    selectNext,
    close,
    onConfirmSelection: () => {
      const prompt = getSelectedPromptRef.current();
      if (prompt) doInsertPromptRef.current(prompt);
    },
  });

  function handleSelect(index: number) {
    const match = state.matches[index];
    if (!match) return;
    doInsertPrompt(match.prompt);
  }

  if (!slashCommandEnabled) return null;

  return (
    <>
      {state.isOpen && (
        <SlashCommandPopup
          matches={state.matches}
          selectedIndex={state.selectedIndex}
          onHighlight={setHighlight}
          onConfirm={handleSelect}
          position={popupPosition}
          query={state.query}
        />
      )}
    </>
  );
};

// ─── Textarea Helpers ────────────────────────────────────────────────────────

/**
 * Replace a range [start, end) in the textarea value with new content.
 * Uses the native value setter to bypass Angular's ControlValueAccessor,
 * then dispatches an input event to trigger Angular's change detection.
 */
function replaceTextareaRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  content: string,
) {
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const newValue = before + content + after;

  // Use native setter to bypass Angular's property override
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  nativeInputValueSetter?.call(textarea, newValue);

  // Place cursor after inserted content
  const newCursorPos = start + content.length;
  textarea.selectionStart = newCursorPos;
  textarea.selectionEnd = newCursorPos;

  // Dispatch input event to sync Angular's model
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}
