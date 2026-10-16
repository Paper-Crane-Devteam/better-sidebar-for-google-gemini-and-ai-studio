/**
 * Platform DOM Adapter
 *
 * Abstracts platform-specific DOM operations (message element lookup,
 * scroll container detection, URL parsing) so that shared features like
 * Outline and SmartScrollbar can work across Gemini and AI Studio.
 *
 * Architecture:
 *  - Each platform registers its adapter at init time via `registerPlatformDomAdapter()`
 *  - Consumers call `getPlatformDomAdapter()` to get the active adapter
 */

import type { ConversationMessage } from './conversation-messages-store';

// ── Interface ────────────────────────────────────────────────────────

export interface PlatformDomAdapter {
  /** Extract conversation external ID from the current URL path */
  extractExternalId(path: string): string | null;

  /** Find a message element in the DOM by its ID */
  findMessageElement(messageId: string): HTMLElement | null;

  /** Get the scrollable chat container element */
  getChatScrollContainer(): HTMLElement | null;

  /**
   * Scroll a message element (from `findMessageElement`) into view. Optional:
   * without it callers fall back to a plain smooth `scrollIntoView`, which is
   * fine unless the platform virtualises turns.
   */
  scrollToMessageElement?(el: HTMLElement): void;

  /** Event names to listen for live message updates from interceptors */
  interceptorEvents: string[];

  /** Parse an interceptor event detail into conversation messages */
  parseInterceptorEvent(detail: any): {
    conversationId: string;
    messages: ConversationMessage[];
    /** When set, indicates a regeneration — delete all messages after this ID before merging */
    replaceAfterMessageId?: string;
  } | null;
}

// ── Registry ─────────────────────────────────────────────────────────

let _adapter: PlatformDomAdapter | null = null;

export function registerPlatformDomAdapter(adapter: PlatformDomAdapter): void {
  _adapter = adapter;
}

export function getPlatformDomAdapter(): PlatformDomAdapter | null {
  return _adapter;
}
