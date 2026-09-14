/**
 * AI Studio Platform DOM Adapter
 *
 * Provides AI Studio-specific DOM operations for the shared outline
 * and conversation messages features.
 *
 * AI Studio DOM structure:
 *  - Chat turns: `<ms-chat-turn id="...">` with `.chat-turn-container`
 *  - User messages: `ms-chat-turn` containing `.user-prompt-container`
 *  - Model messages: `ms-chat-turn` containing `.model-prompt-container`
 *  - Scroll container: `ms-autoscroll-container`
 */

import type { PlatformDomAdapter } from '@/shared/lib/platform-dom-adapter';
import type { ConversationMessage } from '@/shared/lib/conversation-messages-store';
import { RESERVED_CONVERSATION_SEGMENTS } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';
import { Platform } from '@/shared/types/platform';

// AI Studio URL pattern: /prompts/{id}
const AISTUDIO_PROMPT_ID_RE = /\/prompts\/([a-zA-Z0-9_-]+)/;

/**
 * Find a chat turn element by message ID.
 *
 * AI Studio assigns IDs to `ms-chat-turn` elements. The interceptor provides
 * messages without native DOM IDs, so we fall back to index-based lookup
 * using the order of chat turns in the DOM.
 */
function findMessageElement(messageId: string): HTMLElement | null {
  // Try direct ID match first (if AI Studio sets id attributes on turns)
  const byId = document.querySelector(`ms-chat-turn[id="${messageId}"]`) as HTMLElement;
  if (byId) return byId;

  // Try matching by data attribute we may have set
  const byData = document.querySelector(
    `ms-chat-turn[data-bs-message-id="${messageId}"]`,
  ) as HTMLElement;
  if (byData) return byData;

  // Fallback: search all visible chat turns
  const allTurns = document.querySelectorAll('ms-chat-turn');
  for (const turn of allTurns) {
    if (turn.id && turn.id.includes(messageId)) {
      return turn as HTMLElement;
    }
  }

  return null;
}

function getChatScrollContainer(): HTMLElement | null {
  return document.querySelector('ms-autoscroll-container') as HTMLElement | null;
}

export const aistudioDomAdapter: PlatformDomAdapter = {
  extractExternalId(path: string): string | null {
    const match = AISTUDIO_PROMPT_ID_RE.exec(path);
    if (!match) return null;
    const id = match[1];
    // Route segments that sit where an id goes. Shared with `readConversationIdFromPath`
    // rather than re-listed here: the two answering this differently is what the agent
    // loop's session binding breaks on.
    if ((RESERVED_CONVERSATION_SEGMENTS[Platform.AI_STUDIO] ?? []).includes(id)) return null;
    return id;
  },

  findMessageElement,

  getChatScrollContainer,

  interceptorEvents: ['AI_STUDIO_RESPONSE'],

  parseInterceptorEvent(detail: any) {
    if (!detail) return null;

    const conversationId = detail.id;
    if (!conversationId) return null;

    const messages = detail.messages;
    if (!messages || !Array.isArray(messages)) return null;

    const parsed: ConversationMessage[] = messages
      .filter(
        (msg: any) =>
          (msg.role === 'user' || msg.role === 'model') &&
          msg.content &&
          msg.message_type !== 'thought',
      )
      .map((msg: any, index: number) => ({
        id: msg.id || `aistudio-${conversationId}-${index}`,
        content: msg.content,
        role: msg.role as 'user' | 'model',
        timestamp: detail.updated_at,
        orderIndex: index,
        inDom: false, // Will be refreshed later
      }));

    return { conversationId, messages: parsed };
  },
};
