/**
 * Instruction targets — a uniform read/write surface over the native
 * "instructions" inputs we fill from the prompt library:
 *
 * - Gemini Gem editor: a Quill contenteditable (`rich-textarea .ql-editor`)
 * - Gemini Notebook settings: an Angular-bound plain <textarea>
 * - AI Studio system instructions: an Angular-bound plain <textarea>
 *
 * Writes must go through paths the host framework observes, otherwise the
 * page keeps its own stale copy (Save stays disabled, autosave skips it):
 * textarea → native value setter + `input`; Quill → execCommand('insertText').
 */

export interface InstructionTarget {
  /** Current plain text of the input */
  getText(): string;
  /** Replace the whole content */
  setText(text: string): void | Promise<void>;
  /**
   * Append to the end without retyping what's already there (keeps rich
   * formatting intact). Optional — callers fall back to setText(appendContent()).
   */
  append?(text: string): void;
  /** Suggested title when saving the current content as a prompt */
  getTitle?(): string;
}

/** Separator between existing content and an appended prompt */
export const APPEND_SEPARATOR = '\n\n';

/** Existing text + prompt, separated by a blank line when there is existing text */
export function appendContent(existing: string, addition: string): string {
  return existing.trim() ? `${existing.replace(/\s+$/, '')}${APPEND_SEPARATOR}${addition}` : addition;
}

// ─── Textarea ────────────────────────────────────────────────────────────────

const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  'value',
)?.set;

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  'value',
)?.set;

/** Set a textarea/input value the way Angular's value accessor will notice */
export function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const setter = el instanceof HTMLTextAreaElement ? nativeTextareaValueSetter : nativeInputValueSetter;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function createTextareaTarget(
  getEl: () => HTMLTextAreaElement | null,
  getTitle?: () => string,
): InstructionTarget {
  return {
    getText: () => getEl()?.value ?? '',
    setText: (text) => {
      const el = getEl();
      if (!el) return;
      setNativeValue(el, text);
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
      el.scrollTop = el.scrollHeight;
    },
    getTitle,
  };
}

// ─── Quill ───────────────────────────────────────────────────────────────────

/** Plain text of a Quill editor: one line per block, placeholder <br> ignored */
export function getQuillText(editor: HTMLElement): string {
  if (editor.classList.contains('ql-blank')) return '';
  const blocks = Array.from(editor.children);
  if (blocks.length === 0) return editor.textContent ?? '';
  return blocks.map((b) => (b.textContent ?? '').replace(/\u200B/g, '')).join('\n');
}

export function createQuillTarget(
  getEl: () => HTMLElement | null,
  getTitle?: () => string,
): InstructionTarget {
  return {
    getText: () => {
      const el = getEl();
      return el ? getQuillText(el) : '';
    },
    setText: (text) => {
      const el = getEl();
      if (!el) return;
      el.focus();
      // Select everything and type over it — Quill records it as one edit,
      // so the page's own undo button can revert it too.
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      if (text) document.execCommand('insertText', false, text);
      else document.execCommand('delete');
    },
    append: (text) => {
      const el = getEl();
      if (!el) return;
      const existing = getQuillText(el);
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      const prefix = existing.trim() ? (existing.endsWith('\n') ? '\n' : APPEND_SEPARATOR) : '';
      document.execCommand('insertText', false, prefix + text);
    },
    getTitle,
  };
}
