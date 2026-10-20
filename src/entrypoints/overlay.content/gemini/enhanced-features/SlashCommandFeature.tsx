import React, { useRef, useCallback } from 'react';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { showCapsuleDetailModal } from '@/entrypoints/overlay.content/shared/lib/capsule-modal';
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
import {
  useEditorIntegration,
  insertCapsule,
} from '@/entrypoints/overlay.content/shared/features/trigger-popup';
import type { TriggerPopupItem, CapsuleClickInfo } from '@/entrypoints/overlay.content/shared/features/trigger-popup';
import { useModalStore } from '@/shared/lib/modal';
import { getEditor as getComposerEditor } from '@/entrypoints/overlay.content/shared/lib/quill-editor';

// Shared composer lookup — skips the Gem instructions editor on the Gem page
const getEditor = getComposerEditor;

export const SlashCommandFeature: React.FC = () => {
  const slashCommandEnabled = usePegasusStore(
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

  const variableFormRef = useRef<VariableFillFormRef | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const getSelectedPromptRef = useRef(getSelectedPrompt);
  getSelectedPromptRef.current = getSelectedPrompt;

  const handleCapsuleClick = useCallback((info: CapsuleClickInfo) => {
    showCapsuleDetailModal(t('slashCommand.promptInserted'), info.content);
  }, [t]);

  function doInsertPrompt(prompt: Prompt) {
    const { resolvedContent, variables } = resolvePromptContent(prompt);
    const triggerPos = stateRef.current.slashPosition;
    const editor = getEditor();
    if (!editor) return;

    const sel = window.getSelection();
    let cursorPos = 0;
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.startContainer, range.startOffset);
      cursorPos = preRange.toString().length;
    }

    const item: TriggerPopupItem = {
      id: prompt.id,
      title: prompt.title,
      icon: prompt.icon,
      content: resolvedContent,
    };

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
            insertCapsule(editor, triggerPos, cursorPos, { ...item, content: finalContent }, '/');
          }
          useModalStore.getState().close();
        },
        onCancel: () => {
          useModalStore.getState().close();
          editor.focus();
        },
      });
      return;
    }

    close();
    insertCapsule(editor, triggerPos, cursorPos, item, '/');
    editor.focus();
  }

  const doInsertPromptRef = useRef(doInsertPrompt);
  doInsertPromptRef.current = doInsertPrompt;

  const { popupPosition, suppressInput } = useEditorIntegration({
    getEditor,
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
    onCapsuleClick: handleCapsuleClick,
  });

  function handleSelect(index: number) {
    const match = state.matches[index];
    if (!match) return;
    suppressInput();
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
