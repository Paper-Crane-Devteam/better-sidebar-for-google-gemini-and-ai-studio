/**
 * Gemini Platform Adapter.
 * Implements AgentPlatformAdapter for Google Gemini's Quill-based rich-textarea.
 */

import type { AgentPlatformAdapter, ComposerState, ResultSection } from './types';
import { waitForResponseToSettle } from './response-settle';
import { extractLiteralResponseText } from './response-text';
import {
  getEditor as quillGetEditor,
  getCursorPosition as quillGetCursorPosition,
  replaceAllContent,
  triggerSend as quillTriggerSend,
  getSendButtonState,
  buildResultCapsuleText,
  insertMultipleCapsules,
  RESULT_CAPSULE_ATTR_CONTENT,
  RESULT_CAPSULE_CLASS,
} from '@/entrypoints/overlay.content/shared/lib/quill-editor';
import type { CapsuleAttrs } from '@/entrypoints/overlay.content/shared/lib/quill-editor';

export class GeminiAgentAdapter implements AgentPlatformAdapter {
  getEditor(): HTMLElement | null {
    return quillGetEditor();
  }

  insertText(text: string): void {
    const editor = this.getEditor();
    if (!editor) return;
    replaceAllContent(editor, text);
  }

  async triggerSend(options?: { humanDelay?: boolean }): Promise<boolean> {
    return quillTriggerSend(options);
  }

  getText(): string {
    return this.getEditor()?.textContent || '';
  }

  getCursorPosition(): number {
    const editor = this.getEditor();
    if (!editor) return 0;
    return quillGetCursorPosition(editor);
  }

  /**
   * Gemini's send button doubles as stop-generating, and which one it currently is has
   * to be read off the icon / label — see `getSendButtonState` for the four-level
   * cascade. No button at all is `absent`: Gemini only renders it when the composer
   * has content or a turn is in flight, so its absence is an authoritative "idle".
   */
  getComposerState(): ComposerState {
    return getSendButtonState();
  }

  observeAIResponseComplete(idleTimeoutMs: number): Promise<HTMLElement> {
    return waitForResponseToSettle(
      {
        getComposerState: () => this.getComposerState(),
        getLastResponse: () => this.getLastAIResponseElement(),
        extractText: (el) => this.extractResponseText(el),
      },
      idleTimeoutMs,
    );
  }

  /**
   * Gemini renders one `<user-query>` per user turn, and only after the message has
   * actually been accepted — which is what makes it usable as delivery proof.
   *
   * Queried document-wide rather than inside the scroll container: the container gets
   * swapped on SPA navigation, and a lookup miss here would read as "no turns", i.e.
   * as evidence of a failure that didn't happen.
   */
  countUserTurns(): number {
    return document.querySelectorAll('user-query').length;
  }

  /**
   * ⚠️ Not `innerText`. Gemini renders the response as markdown before we read it, so
   * `*` and `` ` `` are gone from the DOM text — a `glob_files` pattern of `*{a,b}*`
   * arrives as `{a,b}` and matches nothing. See `extractLiteralResponseText`.
   */
  extractResponseText(responseElement: HTMLElement): string {
    return extractLiteralResponseText(responseElement);
  }

  getLastAIResponseElement(): HTMLElement | null {
    // Gemini uses model-response elements
    const responses = document.querySelectorAll(
      'model-response .model-response-text, model-response .response-content, .model-response-text'
    );
    if (responses.length > 0) {
      return responses[responses.length - 1] as HTMLElement;
    }

    // Fallback: try message content containers
    const messages = document.querySelectorAll('[data-message-author-role="model"]');
    if (messages.length > 0) {
      return messages[messages.length - 1] as HTMLElement;
    }

    return null;
  }

  /**
   * One collapsed chip per result, payload in a data attribute. The send-button
   * interceptor merges them into a single `<bs_agent_result>` block on the way out.
   *
   * Quill keeps its own document model, so a write that looks fine in the DOM may
   * never register — hence the explicit check for what actually landed rather than
   * trusting the insert.
   */
  async stageResultCapsules(sections: ResultSection[]): Promise<boolean> {
    const editor = this.getEditor();
    if (!editor) return false;

    // Must be awaited: capsules only exist in the DOM after the rAF wrap. Arming the
    // send watcher before that made it see a capsule-free editor and resolve
    // immediately, so the round advanced without anything being sent.
    await insertMultipleCapsules(editor, sections.map(toCapsule));
    return this.hasStagedCapsules();
  }

  hasStagedCapsules(): boolean {
    return !!this.getEditor()?.querySelector(`.${RESULT_CAPSULE_CLASS}`);
  }
}

function toCapsule(section: ResultSection): { displayText: string; attrs: CapsuleAttrs } {
  return {
    displayText: buildResultCapsuleText(section.label),
    attrs: {
      className: RESULT_CAPSULE_CLASS,
      dataAttrs: { [RESULT_CAPSULE_ATTR_CONTENT]: section.content },
      nonEditable: true,
    },
  };
}
