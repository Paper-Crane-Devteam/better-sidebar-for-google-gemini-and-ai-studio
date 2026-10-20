/**
 * `/` in the native instruction inputs (Gem editor, Notebook settings,
 * AI Studio system instructions).
 *
 * Same popup and search as the composer's slash command, but the prompt is
 * inserted as plain text — instruction boxes store configuration, so the
 * composer's capsules (expanded on send) don't apply here.
 */
import React, { useRef, useState } from 'react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useModalStore } from '@/shared/lib/modal';
import type { Prompt } from '@/shared/types/db';
import {
  useSlashCommand,
  SlashCommandPopup,
  resolvePromptContent,
  applyVariables,
} from '../../slash-command';
import { VariableFillForm, type VariableFillFormRef } from '../components/VariableFillForm';
import { useEditorIntegration } from '../../../features/trigger-popup';
import { useTextareaEditorIntegration } from '../../../features/trigger-popup/useTextareaEditorIntegration';
import { setNativeValue } from './targets';

type PopupPosition = { bottom?: number; top?: number; left: number };

/** Popup height budget (header + 240px list + footer) */
const POPUP_HEIGHT = 300;

/** Above the input when it fits, otherwise below — instruction boxes sit high on the page */
function positionFor(el: HTMLElement | null): PopupPosition {
  if (!el) return { bottom: 0, left: 16 };
  const rect = el.getBoundingClientRect();
  const left = Math.max(rect.left, 16);
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceAbove >= POPUP_HEIGHT + 8 || spaceAbove >= spaceBelow) {
    return { bottom: window.innerHeight - rect.top + 8, left };
  }
  return { top: rect.bottom + 8, left };
}

/**
 * Shared flow: resolve the prompt, ask for variables if any, then `write`.
 */
function useInsertFlow() {
  const { t } = useI18n();
  const variableFormRef = useRef<VariableFillFormRef | null>(null);

  return (prompt: Prompt, write: (content: string) => void, onCancel?: () => void) => {
    const { resolvedContent, variables } = resolvePromptContent(prompt);
    if (variables.length === 0) {
      write(resolvedContent);
      return;
    }
    useModalStore.getState().open({
      type: 'confirm',
      title: t('slashCommand.fillVariables'),
      content: <VariableFillForm ref={variableFormRef} variables={variables} />,
      confirmText: t('slashCommand.insert'),
      cancelText: t('common.cancel'),
      onConfirm: () => {
        const values = variableFormRef.current?.getValues();
        useModalStore.getState().close();
        if (values) write(applyVariables(resolvedContent, values));
      },
      onCancel: () => {
        useModalStore.getState().close();
        onCancel?.();
      },
    });
  };
}

// ─── Textarea ────────────────────────────────────────────────────────────────

interface TextareaSlashProps {
  getTextarea: () => HTMLTextAreaElement | null;
  enabled: boolean;
}

export const TextareaInstructionSlash: React.FC<TextareaSlashProps> = ({ getTextarea, enabled }) => {
  const slash = useSlashCommand();
  const insertFlow = useInsertFlow();
  const [position, setPosition] = useState<PopupPosition>({ bottom: 0, left: 16 });

  const stateRef = useRef(slash.state);
  stateRef.current = slash.state;
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const getTextareaRef = useRef(getTextarea);
  getTextareaRef.current = getTextarea;

  const insert = (prompt: Prompt) => {
    const textarea = getTextareaRef.current();
    if (!textarea) return;
    const start = stateRef.current.slashPosition;
    const end = textarea.selectionStart;
    slashRef.current.close();

    insertFlow(
      prompt,
      (content) => {
        const value = textarea.value;
        setNativeValue(textarea, value.slice(0, start) + content + value.slice(end));
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + content.length;
      },
      () => textarea.focus(),
    );
  };
  const insertRef = useRef(insert);
  insertRef.current = insert;

  useTextareaEditorIntegration({
    getTextarea: () => getTextareaRef.current(),
    enabled,
    triggerChar: '/',
    interceptRun: false,
    onInput: (text, cursor) => {
      slashRef.current.handleInput(text, cursor);
      setPosition(positionFor(getTextareaRef.current()));
    },
    getPopupState: () => stateRef.current as any,
    selectPrevious: () => slashRef.current.selectPrevious(),
    selectNext: () => slashRef.current.selectNext(),
    close: () => slashRef.current.close(),
    onConfirmSelection: () => {
      const prompt = slashRef.current.getSelectedPrompt();
      if (prompt) insertRef.current(prompt);
    },
  });

  if (!enabled || !slash.state.isOpen) return null;
  return (
    <SlashCommandPopup
      matches={slash.state.matches}
      selectedIndex={slash.state.selectedIndex}
      onHighlight={slash.setHighlight}
      onConfirm={(i) => {
        const match = slash.state.matches[i];
        if (match) insert(match.prompt);
      }}
      position={position}
      query={slash.state.query}
    />
  );
};

// ─── Quill ───────────────────────────────────────────────────────────────────

/**
 * Map a plain-text offset (as counted by useEditorIntegration: text nodes,
 * <br> = 1, block boundary = 1) back to a DOM position.
 */
function locateOffset(editor: HTMLElement, target: number): { node: Node; offset: number } | null {
  let count = 0;
  let found: { node: Node; offset: number } | null = null;

  const walk = (node: Node) => {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (target <= count + len) {
        found = { node, offset: target - count };
        return;
      }
      count += len;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      count += 1;
      return;
    }
    for (const child of Array.from(el.childNodes)) {
      walk(child);
      if (found) return;
    }
    if ((tag === 'p' || tag === 'div') && el.nextSibling) count += 1;
  };

  for (const child of Array.from(editor.childNodes)) {
    walk(child);
    if (found) break;
  }
  return found;
}

/** Select [start, end) in the editor so the next insertText replaces it */
function selectRange(editor: HTMLElement, start: number, end: number): boolean {
  const a = locateOffset(editor, start);
  const b = locateOffset(editor, end);
  const sel = window.getSelection();
  if (!a || !b || !sel) return false;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

interface QuillSlashProps {
  getEditor: () => HTMLElement | null;
  enabled: boolean;
}

export const QuillInstructionSlash: React.FC<QuillSlashProps> = ({ getEditor, enabled }) => {
  const slash = useSlashCommand();
  const insertFlow = useInsertFlow();
  const [position, setPosition] = useState<PopupPosition>({ bottom: 0, left: 16 });

  const stateRef = useRef(slash.state);
  stateRef.current = slash.state;
  const slashRef = useRef(slash);
  slashRef.current = slash;
  const getEditorRef = useRef(getEditor);
  getEditorRef.current = getEditor;
  // Cursor offset at the last input — the selection is gone once a modal opens
  const cursorRef = useRef(0);

  const insert = (prompt: Prompt) => {
    const editor = getEditorRef.current();
    if (!editor) return;
    const start = stateRef.current.slashPosition;
    const end = cursorRef.current;
    slashRef.current.close();
    suppressInput();

    insertFlow(
      prompt,
      (content) => {
        editor.focus();
        if (selectRange(editor, start, end)) {
          document.execCommand('insertText', false, content);
        }
      },
      () => editor.focus(),
    );
  };
  const insertRef = useRef(insert);
  insertRef.current = insert;

  const { suppressInput } = useEditorIntegration({
    getEditor: () => getEditorRef.current(),
    enabled,
    triggerChar: '/',
    onInput: (text, cursor) => {
      cursorRef.current = cursor;
      slashRef.current.handleInput(text, cursor);
      setPosition(positionFor(getEditorRef.current()));
    },
    getPopupState: () => stateRef.current as any,
    selectPrevious: () => slashRef.current.selectPrevious(),
    selectNext: () => slashRef.current.selectNext(),
    close: () => slashRef.current.close(),
    onConfirmSelection: () => {
      const prompt = slashRef.current.getSelectedPrompt();
      if (prompt) insertRef.current(prompt);
    },
  });

  if (!enabled || !slash.state.isOpen) return null;
  return (
    <SlashCommandPopup
      matches={slash.state.matches}
      selectedIndex={slash.state.selectedIndex}
      onHighlight={slash.setHighlight}
      onConfirm={(i) => {
        const match = slash.state.matches[i];
        if (match) insert(match.prompt);
      }}
      position={position}
      query={slash.state.query}
    />
  );
};
