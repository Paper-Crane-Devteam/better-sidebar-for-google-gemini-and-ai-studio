/**
 * AI Studio Platform Adapter.
 *
 * Differences from Gemini that the rest of the loop should not have to know about:
 *
 * - The composer is a plain `<textarea>`, so there are no result capsules. Staging
 *   falls back to plain text, which means the payload is *visible* in the input box
 *   while it waits — see `stageResults`.
 * - The Run button stays in the DOM and is disabled instead of removed, so `absent` is
 *   derived from `aria-disabled`. See `getRunState`.
 * - Turns are virtualised: `ms-chat-turn` elements persist but their `.turn-content` is
 *   only populated while the turn is near the viewport. Everything here reads the
 *   *newest* turn, which auto-scroll keeps on screen, so it is unaffected — but nothing
 *   in this file can be reused to read conversation history.
 */

import type { AgentPlatformAdapter, ComposerState } from './types';
import { waitForResponseToSettle } from './response-settle';
import { extractLiteralResponseText } from './response-text';
import {
  getTextarea,
  getText as composerText,
  getCursorPosition as composerCursor,
  replaceAllContent,
  getRunState,
  triggerRun,
} from '@/entrypoints/overlay.content/shared/lib/aistudio-editor';

/**
 * Content of a turn, with everything that is not the model's answer removed.
 *
 * Thought chunks are the reason this exists: AI Studio renders the model's reasoning
 * inline as `ms-thought-chunk`, and a model that talks about the tool call it is *about*
 * to make would otherwise have that draft parsed as a real call.
 */
const NON_CONTENT_SELECTORS = [
  'ms-thought-chunk',
  '.actions-container',
  '.turn-footer',
  '.cdk-visually-hidden',
] as const;

export class AIStudioAgentAdapter implements AgentPlatformAdapter {
  getEditor(): HTMLElement | null {
    return getTextarea();
  }

  insertText(text: string): void {
    replaceAllContent(text);
  }

  async triggerSend(options?: { humanDelay?: boolean }): Promise<boolean> {
    return triggerRun(options);
  }

  getText(): string {
    return composerText();
  }

  getCursorPosition(): number {
    return composerCursor();
  }

  getComposerState(): ComposerState {
    return getRunState();
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
   * AI Studio marks each turn's container with `data-turn-role`, and a User one only
   * appears once the message has been accepted — which is what makes it usable as
   * delivery proof.
   *
   * ⚠️ Read document-wide, not inside the scroll container: that container is replaced
   * on SPA navigation, and a lookup miss here would read as "no turns", i.e. as evidence
   * of a failure that didn't happen.
   *
   * ⚠️ Virtualisation does not undermine this the way it undermines reading history. The
   * turn *elements* survive being scrolled away (only their content is dropped), and the
   * comparison is always between two counts taken seconds apart around a send.
   */
  countUserTurns(): number {
    return document.querySelectorAll('ms-chat-turn [data-turn-role="User"]').length;
  }

  extractResponseText(responseElement: HTMLElement): string {
    const clone = responseElement.cloneNode(true) as HTMLElement;
    for (const selector of NON_CONTENT_SELECTORS) {
      clone.querySelectorAll(selector).forEach((el) => el.remove());
    }
    // Not `textContent`: AI Studio renders the turn as markdown first, so the `*` in a
    // glob pattern and the backticks around inline code are no longer in the DOM text.
    // `extractLiteralResponseText` puts them back, and needs no layout — which matters
    // here, because this clone is detached.
    return extractLiteralResponseText(clone);
  }

  /**
   * The newest model turn's content node.
   *
   * `.turn-content` rather than the whole `ms-chat-turn`: the turn also holds the action
   * buttons and the run-time pill, and the pill's seconds counter ticks while generating
   * — text sampled from it would never hold still, so the settle check could never
   * conclude the answer was finished.
   */
  getLastAIResponseElement(): HTMLElement | null {
    const turns = document.querySelectorAll<HTMLElement>(
      'ms-chat-turn [data-turn-role="Model"]',
    );
    const last = turns[turns.length - 1];
    if (!last) return null;
    return last.querySelector<HTMLElement>('.turn-content') ?? last;
  }

  // No stageResultCapsules / hasStagedCapsules: a textarea cannot hold them, so the
  // absence is the answer and `stageResults` writes plain text instead.
}
