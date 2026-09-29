/**
 * QuillEditorHelper — Centralized utilities for interacting with Gemini's
 * Quill-based contenteditable editor.
 *
 * Quill maintains its own internal Delta model. Direct DOM manipulation
 * (innerHTML, appendChild, replaceChild) does NOT sync to Quill's model.
 * This helper provides Quill-safe methods that work around this limitation.
 *
 * Key insight: `document.execCommand('insertText')` is the only reliable way
 * to insert text that Quill will record in its Delta. After Quill processes
 * the insertion, we can safely manipulate the DOM in the next animation frame
 * to add formatting (like wrapping in <strong>).
 */

import i18n from '@/locale/i18n';

// ─── Editor Selector ─────────────────────────────────────────────────────────

const EDITOR_SELECTOR = 'rich-textarea .ql-editor[contenteditable="true"]';
const EDITOR_SELECTOR_FALLBACK = 'div.ql-editor[contenteditable="true"]';

// ─── Capsule Constants ───────────────────────────────────────────────────────

export const CAPSULE_CLASS = 'bs-prompt-capsule';
export const CAPSULE_ATTR_CONTENT = 'data-prompt-content';
export const CAPSULE_ATTR_ID = 'data-prompt-id';
export const RESULT_CAPSULE_CLASS = 'bs-agent-result-capsule';
export const RESULT_CAPSULE_ATTR_CONTENT = 'data-result-content';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CapsuleAttrs {
  /** CSS class for the capsule element */
  className: string;
  /** Map of data-* attributes to set on the <strong> */
  dataAttrs: Record<string, string>;
  /** Whether to set contentEditable="false" on the capsule */
  nonEditable?: boolean;
}

// ─── Capsule Display Text Helpers ────────────────────────────────────────────

/**
 * Build displayText for a prompt capsule.
 * Format: `>title` (matches trigger char + title shown in editor input).
 */
export function buildPromptCapsuleText(title: string): string {
  return `>${title}`;
}

/**
 * Build displayText for a result capsule.
 * Format: `${prefix}: ${label}` where prefix is i18n "Result"/"结果".
 */
export function buildResultCapsuleText(label: string): string {
  const prefix = i18n.t('agentLoop.resultCapsulePrefix');
  return `${prefix}: ${label}`;
}

// ─── Core Methods ────────────────────────────────────────────────────────────

/**
 * Create a standalone <strong> capsule element (not inserted into any editor).
 * Useful for rendering capsules outside the Quill editor (e.g. user-query display).
 */
export function createCapsuleElement(displayText: string, attrs: CapsuleAttrs): HTMLElement {
  const strong = document.createElement('strong');
  strong.className = attrs.className;
  for (const [key, value] of Object.entries(attrs.dataAttrs)) {
    strong.setAttribute(key, value);
  }
  if (attrs.nonEditable) {
    strong.contentEditable = 'false';
  }
  strong.textContent = displayText;
  return strong;
}

/**
 * Get the Quill editor DOM element.
 */
export function getEditor(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(EDITOR_SELECTOR) ||
    document.querySelector<HTMLElement>(EDITOR_SELECTOR_FALLBACK)
  );
}

/**
 * Get the current cursor position as a character offset from the start of the editor.
 */
export function getCursorPosition(editor: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;

  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

/**
 * Place the cursor at the end of the editor content.
 */
export function moveCursorToEnd(editor: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Clear the editor and set focus.
 */
export function clearEditor(editor: HTMLElement): void {
  editor.innerHTML = '';
  editor.focus();
}

/**
 * Replace the entire editor content with multi-line text.
 * Uses innerHTML approach (paragraphs per line) + input event dispatch.
 * Suitable for large content that doesn't need capsule formatting.
 */
export function replaceAllContent(editor: HTMLElement, text: string): void {
  editor.innerHTML = '';
  const lines = text.split('\n');
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line || '\u200B';
    editor.appendChild(p);
  }
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Insert text at the current cursor position via execCommand.
 * This is Quill-safe — Quill records the text in its Delta model.
 */
export function insertTextAtCursor(text: string): void {
  document.execCommand('insertText', false, text);
}

/**
 * Insert text at the end of the editor via execCommand (Quill-safe).
 */
export function insertTextAtEnd(editor: HTMLElement, text: string): void {
  editor.focus();
  moveCursorToEnd(editor);
  document.execCommand('insertText', false, text);
}

/**
 * Insert a capsule into the editor, replacing text from triggerPos to cursorPos.
 * Uses execCommand('insertText') for Quill compatibility, then wraps in <strong>
 * on the next animation frame.
 *
 * @param editor - The Quill editor element
 * @param triggerPos - Character offset where the trigger started
 * @param cursorPos - Current cursor character offset
 * @param displayText - Text to display inside the capsule
 * @param attrs - Capsule attributes (class, data-*)
 * @returns Promise that resolves once the capsule DOM is created
 */
export function insertCapsuleAtRange(
  editor: HTMLElement,
  triggerPos: number,
  cursorPos: number,
  displayText: string,
  attrs: CapsuleAttrs,
): Promise<HTMLElement | null> {
  // Walk text nodes to select the trigger+query range
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeLen = node.textContent?.length || 0;

    if (!startNode && offset + nodeLen > triggerPos) {
      startNode = node;
      startOffset = triggerPos - offset;
    }
    if (!endNode && offset + nodeLen >= cursorPos) {
      endNode = node;
      endOffset = cursorPos - offset;
      break;
    }
    offset += nodeLen;
  }

  if (!startNode || !endNode) return Promise.resolve(null);

  // Select and replace via execCommand (Quill-safe)
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  document.execCommand('insertText', false, displayText + '\u00A0');

  // After Quill processes, wrap in <strong>
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const capsule = wrapTextInCapsule(editor, displayText, attrs);
      resolve(capsule);
    });
  });
}

/**
 * Append a capsule at the end of the editor content.
 * Uses execCommand('insertText') + rAF wrap strategy.
 *
 * @param editor - The Quill editor element
 * @param displayText - Text to display inside the capsule
 * @param attrs - Capsule attributes (class, data-*)
 * @returns Promise that resolves once the capsule DOM is created
 */
export function appendCapsule(
  editor: HTMLElement,
  displayText: string,
  attrs: CapsuleAttrs,
): Promise<HTMLElement | null> {
  editor.focus();
  moveCursorToEnd(editor);
  document.execCommand('insertText', false, displayText + '\u00A0');

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const capsule = wrapTextInCapsule(editor, displayText, attrs);
      resolve(capsule);
    });
  });
}

/**
 * Replace everything after `capsule` with `text`, leaving the capsule and anything before it.
 *
 * Starts past the capsule's trailing nbsp when it is still there, so the new text sits in
 * the plain text node rather than inheriting the capsule's `<strong>`. If the user deleted
 * that separator, one is put back. execCommand keeps Quill's Delta in sync.
 */
export function replaceTextAfterCapsule(
  editor: HTMLElement,
  capsule: HTMLElement,
  text: string,
): void {
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
  const next = capsule.nextSibling;
  let separator = '';
  if (next?.nodeType === Node.TEXT_NODE && /^[\u00A0 ]/.test(next.textContent || '')) {
    range.setStart(next, 1);
  } else {
    range.setStartAfter(capsule);
    separator = '\u00A0';
  }
  range.setEnd(editor, editor.childNodes.length);

  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('insertText', false, separator + text);
}

/**
 * Select the editor's whole content so the next execCommand replaces it.
 *
 * Deliberately not `innerHTML = ''`: wiping the DOM leaves Quill without its
 * block structure, and a following `execCommand('insertText')` into that empty
 * shell silently no-ops in some builds — which left the composer empty, and an
 * empty composer means Gemini never renders the send button at all.
 */
function selectAllContent(editor: HTMLElement): void {
  editor.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Replace the editor content with a set of capsules.
 * Uses execCommand('insertText') for all texts at once, then wraps each in rAF.
 *
 * @param editor - The Quill editor element
 * @param capsules - Array of { displayText, attrs }
 * @returns Promise that resolves once the capsule DOMs are created
 */
export function insertMultipleCapsules(
  editor: HTMLElement,
  capsules: Array<{ displayText: string; attrs: CapsuleAttrs }>,
): Promise<Array<HTMLElement | null>> {
  selectAllContent(editor);

  // Insert all texts separated by nbsp
  const fullText = capsules.map((c) => c.displayText).join('\u00A0') + '\u00A0';
  const inserted = document.execCommand('insertText', false, fullText);
  const textAfter = editor.textContent || '';

  if (!inserted || !textAfter.includes(capsules[0]?.displayText ?? '')) {
    console.warn('[QuillEditor] insertText did not land in the editor', {
      execCommandReturned: inserted,
      documentHasFocus: document.hasFocus(),
      activeElement: describeElement(document.activeElement),
      editorIsActive: document.activeElement === editor,
      editorTextLength: textAfter.length,
      editorHTML: editor.innerHTML.slice(0, 200),
    });
  }

  // Wrap each in next frame
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const results: Array<HTMLElement | null> = [];
      for (const capsuleData of capsules) {
        const el = wrapTextInCapsule(editor, capsuleData.displayText, capsuleData.attrs);
        results.push(el);
      }
      if (results.some((el) => el === null)) {
        console.warn('[QuillEditor] Some capsules could not be wrapped', {
          requested: capsules.length,
          wrapped: results.filter(Boolean).length,
          editorTextLength: (editor.textContent || '').length,
        });
      }
      resolve(results);
    });
  });
}

// ─── Capsule Query Helpers ───────────────────────────────────────────────────

/**
 * Check if the cursor is currently inside a capsule element.
 */
export function findCapsuleAtCursor(editor: HTMLElement, capsuleClass: string): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  let node: Node | null = range.startContainer;
  while (node && node !== editor) {
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).classList?.contains(capsuleClass)
    ) {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Remove a capsule element and its trailing nbsp/space.
 */
export function removeCapsule(capsule: HTMLElement): void {
  const next = capsule.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE) {
    const text = next.textContent || '';
    if (text[0] === '\u00A0' || text[0] === ' ') {
      next.textContent = text.slice(1);
      if (!next.textContent) next.parentNode?.removeChild(next);
    }
  }
  capsule.remove();
}

/**
 * Expand all capsules matching a class (optionally filtered by trigger char)
 * by replacing them with their stored content text.
 * Dispatches input event after expansion.
 */
export function expandCapsules(
  editor: HTMLElement,
  capsuleClass: string,
  triggerChar?: string,
): string {
  const selector = triggerChar
    ? `.${capsuleClass}[data-trigger="${triggerChar}"]`
    : `.${capsuleClass}`;
  const capsules = editor.querySelectorAll(selector);
  capsules.forEach((capsule) => {
    const content = capsule.getAttribute(CAPSULE_ATTR_CONTENT) || '';
    const textNode = document.createTextNode(content);
    capsule.parentNode?.replaceChild(textNode, capsule);
  });
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return editor.textContent || '';
}

/**
 * Check if editor has any capsules matching a class + optional trigger char.
 */
export function hasCapsules(editor: HTMLElement, capsuleClass: string, triggerChar?: string): boolean {
  const selector = triggerChar
    ? `.${capsuleClass}[data-trigger="${triggerChar}"]`
    : `.${capsuleClass}`;
  return editor.querySelector(selector) !== null;
}

// ─── Send Button ─────────────────────────────────────────────────────────────

const SEND_BUTTON_SELECTOR = '.text-input-field .send-button-container>gem-icon-button>button';

/** Minimum pause before clicking send (ms) */
const SEND_DELAY_MIN_MS = 800;
/** Maximum pause before clicking send (ms) */
const SEND_DELAY_MAX_MS = 2000;
/** How long to wait for the button to leave its "stop" state */
const STOP_STATE_TIMEOUT_MS = 120000;
/** Poll interval while waiting for the button to become a send button */
const STOP_STATE_POLL_MS = 300;
/** How long to wait for the send button to appear after content is staged */
const SEND_BUTTON_WAIT_MS = 3000;
/** Poll interval while waiting for the send button to appear */
const SEND_BUTTON_POLL_MS = 100;

/**
 * Gemini reuses one button for send and stop-generating. Which one it currently
 * is has to be read off the icon / label — the class and disabled state are the
 * same for both.
 *
 * `absent` and `unknown` mean opposite things and must not be merged:
 *
 * - **absent** — no button in the DOM. Gemini only renders it when the composer has
 *   content or a turn is in flight, so this is an authoritative reading of the page:
 *   nothing is generating and nobody is typing. Measured behaviour, and the send
 *   button never disappears in the gap after a click either — it flips straight to
 *   `stop`, even on a slow connection.
 * - **unknown** — a button was found but none of the four cascades could classify
 *   it, i.e. our selectors are lost. Nothing about the button can be trusted here.
 *
 * Collapsing them into one value is what made a page that was provably idle look
 * identical to a broken selector, and the loop reported "the AI went silent" for
 * messages that had never left the composer.
 */
export type SendButtonState = 'send' | 'stop' | 'absent' | 'unknown';

const STOP_LABEL_RE = /stop|停止|停止生成|中止/i;
const SEND_LABEL_RE = /send|发送|傳送/i;

/** Short description of an element, for diagnostics. */
function describeElement(el: Element | null): string | null {
  if (!el) return null;
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/).join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

/**
 * Snapshot of the composer, logged when the send button cannot be found.
 *
 * The button is conditionally rendered: no content in the composer means no send
 * button, so "not found" is usually a staging failure rather than a selector
 * problem. This tells the two apart.
 */
export function describeComposer(): Record<string, unknown> {
  const editor = getEditor();
  const container = document.querySelector('.send-button-container');
  return {
    editorFound: !!editor,
    editorTextLength: editor?.textContent?.length ?? -1,
    editorHTML: editor?.innerHTML.slice(0, 200) ?? null,
    resultCapsules: editor?.querySelectorAll(`.${RESULT_CAPSULE_CLASS}`).length ?? -1,
    hasTextInputField: !!document.querySelector('.text-input-field'),
    hasSendButtonContainer: !!container,
    sendButtonContainerHTML: container?.outerHTML.slice(0, 400) ?? null,
    gemIconButtons: Array.from(document.querySelectorAll('.text-input-field gem-icon-button')).map(
      (el) => describeElement(el),
    ),
    matIcons: Array.from(document.querySelectorAll('.text-input-field mat-icon')).map(
      (el) => el.getAttribute('fonticon') || el.getAttribute('data-mat-icon-name') || el.textContent?.trim(),
    ),
  };
}

/** Locate the send/stop button, trying the specific selector then fallbacks. */
export function findSendButton(): HTMLButtonElement | null {
  const primary = document.querySelector<HTMLButtonElement>(SEND_BUTTON_SELECTOR);
  if (primary) return primary;

  const fallback = document.querySelector<HTMLButtonElement>(
    'button.send-button, button[aria-label="Send message"], button[data-at-shortcutkeys]',
  );
  if (fallback) return fallback;

  // Last resort: match on the gem-icon-button with send-button class
  const gemSendBtn = document.querySelector<HTMLElement>('gem-icon-button.send-button button');
  if (gemSendBtn) return gemSendBtn as HTMLButtonElement;

  // Or match on the material icon fonticon attribute
  for (const btn of document.querySelectorAll('button')) {
    const matIcon = btn.querySelector('mat-icon');
    const fonticon = matIcon?.getAttribute('fonticon') || matIcon?.getAttribute('data-mat-icon-name') || '';
    if (fonticon === 'arrow_upward' || fonticon === 'send' || fonticon === 'stop' || fonticon === 'stop_circle') {
      return btn as HTMLButtonElement;
    }
  }
  return null;
}

/**
 * Read whether the button would currently send a message or stop generation.
 *
 * This matters because clicking during generation aborts the answer instead of
 * sending: the agent loop lost whole turns that way, and the icon lags behind the
 * actual stream end, so "response looks done" is not enough on its own.
 *
 * Primary signal: the parent `gem-icon-button` element gains a `stop` class
 * while streaming. This is language-agnostic and the most reliable indicator.
 *
 * No button at all is `'absent'`, not `'unknown'` — see the type. It is a state of
 * the page (idle composer), and the agent loop reads it as such.
 */
export function getSendButtonState(button?: HTMLButtonElement | null): SendButtonState {
  const btn = button ?? findSendButton();
  if (!btn) return 'absent';

  // Primary: gem-icon-button adds "stop" class during generation
  const gemIconButton = btn.closest('gem-icon-button');
  if (gemIconButton?.classList.contains('stop')) return 'stop';
  // If gem-icon-button exists but has no "stop" class, it's in send mode
  if (gemIconButton?.classList.contains('send-button')) return 'send';

  // Fallback: check mat-icon fonticon attribute (Gemini uses fonticon, not textContent)
  const matIcon = btn.querySelector('mat-icon');
  const fonticon = matIcon?.getAttribute('fonticon') || matIcon?.getAttribute('data-mat-icon-name') || '';
  if (fonticon === 'stop' || fonticon === 'stop_circle') return 'stop';
  if (fonticon === 'arrow_upward' || fonticon === 'send') return 'send';

  // Last resort: aria-label (language-dependent, but better than nothing)
  const label = `${btn.getAttribute('aria-label') ?? ''} ${btn.getAttribute('mattooltip') ?? ''}`;
  if (STOP_LABEL_RE.test(label)) return 'stop';
  if (SEND_LABEL_RE.test(label)) return 'send';

  // Container class fallback
  if (btn.closest('.stop-button-container')) return 'stop';
  if (btn.closest('.send-button-container')) return 'send';

  return 'unknown';
}

/** Human-ish pause: a fixed cadence looks automated and risks rate limiting. */
function randomSendDelay(): number {
  return SEND_DELAY_MIN_MS + Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS);
}

/**
 * Wait for the send button to exist.
 *
 * Gemini only renders it once the composer has content, and Angular needs a few
 * frames to notice a programmatic insert, so a single synchronous lookup right
 * after staging can miss a button that shows up milliseconds later.
 */
export async function waitForSendButton(
  timeoutMs = SEND_BUTTON_WAIT_MS,
): Promise<HTMLButtonElement | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const btn = findSendButton();
    if (btn) return btn;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, SEND_BUTTON_POLL_MS));
  }
}

/**
 * Wait until the button is no longer a stop button.
 * Returns false if it stayed in stop state until the timeout.
 */
async function waitForSendState(timeoutMs = STOP_STATE_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (getSendButtonState() !== 'stop') return true;
    await new Promise((r) => setTimeout(r, STOP_STATE_POLL_MS));
  }
  return false;
}

export interface TriggerSendOptions {
  /**
   * Pause a random 0.8–2s before clicking. On for automated sends (gives the DOM
   * time to settle and avoids a robotic cadence); off for sends the user just
   * initiated, where the extra lag would only feel broken.
   */
  humanDelay?: boolean;
}

/**
 * Click the send button.
 *
 * Guards, in order:
 * 1. let Quill flush the pending input changes
 * 2. wait out any in-progress generation — the same button is "stop generating"
 *    while streaming, and clicking it there kills the answer instead of sending
 * 3. optional random pause, then re-check the state right before clicking,
 *    since the icon can still flip during the pause
 *
 * Returns whether a send was actually clicked.
 */
export async function triggerSend(options: TriggerSendOptions = {}): Promise<boolean> {
  const { humanDelay = true } = options;

  await new Promise((r) => setTimeout(r, 150));

  // The button is conditionally rendered on composer content, so wait for it
  // before anything else — every later guard needs it to exist.
  let button = await waitForSendButton();
  if (!button) {
    const editor = getEditor();
    if (editor && (editor.textContent || '').trim()) {
      // Content is there but Angular never reacted to it: nudge it and retry.
      console.warn('[QuillEditor] Send button missing while composer has content, nudging');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      button = await waitForSendButton(1000);
    }
  }
  if (!button) {
    console.warn('[QuillEditor] Could not find send button', describeComposer());
    return false;
  }

  if (!(await waitForSendState())) {
    console.warn('[QuillEditor] Send button stuck in stop state, not clicking');
    return false;
  }

  if (humanDelay) {
    await new Promise((r) => setTimeout(r, randomSendDelay()));
  }

  // Re-resolve and re-check: the delay above is long enough for Gemini to swap
  // the button back into stop state (e.g. the user sent something meanwhile).
  const btn = findSendButton() ?? button;
  if (!btn.isConnected) {
    console.warn('[QuillEditor] Send button detached before click', describeComposer());
    return false;
  }
  if (getSendButtonState(btn) === 'stop') {
    console.warn('[QuillEditor] Button flipped back to stop, not clicking');
    return false;
  }
  if (btn.disabled) {
    console.warn('[QuillEditor] Send button is disabled, not clicking');
    return false;
  }

  btn.click();
  return true;
}

// ─── Send Button Interceptor ─────────────────────────────────────────────────

let sendInterceptorInstalled = false;

/**
 * Module-level registered onBeforeSend callback.
 * Set by useEditorIntegration so that both Enter keydown and send button click
 * share the same send-handling logic.
 */
let registeredBeforeSendHandler: ((editor: HTMLElement) => boolean) | null = null;

/**
 * Register a beforeSend handler that will be called by both keydown and click paths.
 * Returns an unregister function.
 */
export function registerBeforeSendHandler(handler: (editor: HTMLElement) => boolean): () => void {
  registeredBeforeSendHandler = handler;
  return () => {
    if (registeredBeforeSendHandler === handler) {
      registeredBeforeSendHandler = null;
    }
  };
}

/**
 * Get the currently registered beforeSend handler (used by useEditorIntegration).
 */
export function getRegisteredBeforeSendHandler(): ((editor: HTMLElement) => boolean) | null {
  return registeredBeforeSendHandler;
}

/**
 * Install a click interceptor on the send button that expands all capsules
 * before Gemini processes the send. This handles the case where the user
 * clicks the send button instead of pressing Enter.
 *
 * Uses capture phase to fire before Gemini's own handler.
 * Must be called once during initialization.
 */
export function installSendButtonInterceptor(): void {
  if (sendInterceptorInstalled) return;
  sendInterceptorInstalled = true;

  // Use event delegation on document to catch clicks on the send button
  // even if it gets re-created by Angular.
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const sendBtn = target.closest(SEND_BUTTON_SELECTOR);
    if (!sendBtn) return;

    const editor = getEditor();
    if (!editor) return;

    // Check for result capsules first (same priority as keydown handler)
    const resultCapsules = editor.querySelectorAll(`.${RESULT_CAPSULE_CLASS}`);
    if (resultCapsules.length > 0) {
      e.preventDefault();
      e.stopPropagation();

      const sections: string[] = [];
      resultCapsules.forEach((capsule) => {
        const content = capsule.getAttribute(RESULT_CAPSULE_ATTR_CONTENT) || '';
        sections.push(content);
      });

      const mergedContent = sections.join('\n\n---\n\n');
      const wrappedResult = `<bs_agent_result>\n${mergedContent}\n</bs_agent_result>`;

      replaceAllContent(editor, wrappedResult);
      // User already clicked — no artificial pause, but still wait out generation
      void triggerSend({ humanDelay: false });
      return;
    }

    // Check for trigger capsules — use registered handler (shared with keydown)
    const hasTriggerCapsules = editor.querySelector(`.${CAPSULE_CLASS}`) !== null;
    if (hasTriggerCapsules && registeredBeforeSendHandler) {
      const handled = registeredBeforeSendHandler(editor);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // Fallback: expand any remaining capsules in place, let platform send
    const promptCapsules = editor.querySelectorAll(`.${CAPSULE_CLASS}`);
    if (promptCapsules.length > 0) {
      expandCapsules(editor, CAPSULE_CLASS);
    }
  }, true); // capture phase — fires before Gemini's handler
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Find displayText in the editor's text nodes and wrap it in a <strong> element.
 * Returns the created <strong> element or null if not found.
 */
function wrapTextInCapsule(
  editor: HTMLElement,
  displayText: string,
  attrs: CapsuleAttrs,
): HTMLElement | null {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent || '';
    const idx = text.indexOf(displayText);
    if (idx === -1) continue;

    const parent = node.parentNode;
    if (!parent) continue;
    // Already wrapped in a capsule
    if ((parent as HTMLElement).classList?.contains(attrs.className)) continue;

    const before = text.slice(0, idx);
    const after = text.slice(idx + displayText.length);

    const strong = document.createElement('strong');
    strong.className = attrs.className;
    for (const [key, value] of Object.entries(attrs.dataAttrs)) {
      strong.setAttribute(key, value);
    }
    if (attrs.nonEditable) {
      strong.contentEditable = 'false';
    }
    strong.textContent = displayText;

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(strong);
    if (after) frag.appendChild(document.createTextNode(after));

    parent.replaceChild(frag, node);

    // Place cursor after capsule
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
    return strong;
  }
  return null;
}
