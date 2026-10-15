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
import {
  useConversationMessagesStore,
  type ConversationMessage,
} from '@/shared/lib/conversation-messages-store';
import {
  AISTUDIO_TURN_SELECTOR,
  isUserTurn,
  labelPrefix,
  readRenderedText,
  readTurnLabel,
  scrollTurnIntoView,
  textsAgree,
} from './aistudio-turns';
import { RESERVED_CONVERSATION_SEGMENTS } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';
import { Platform } from '@/shared/types/platform';

// AI Studio URL pattern: /prompts/{id}
const AISTUDIO_PROMPT_ID_RE = /\/prompts\/([a-zA-Z0-9_-]+)/;

// ── Position-based matching ──────────────────────────────────────────

/**
 * Stored message id → its `ms-chat-turn`, rebuilt at most once per task:
 * `refreshDomPresence` and the outline's scroll tracking look up every message
 * in a row, and each build walks all turns.
 */
let positionCache: { messages: ConversationMessage[]; map: Map<string, HTMLElement> } | null =
  null;

function userTurnMatches(
  turn: HTMLElement,
  content: string,
  storeUserCount: number,
  domUserCount: number,
): boolean {
  const prefix = labelPrefix(readTurnLabel(turn));
  if (prefix) return textsAgree(content, prefix);
  const rendered = readRenderedText(turn);
  if (rendered) return textsAgree(content, rendered);
  // Neither label nor text to check against: trust position only when counts line up
  return storeUserCount === domUserCount;
}

/**
 * Stored messages carry no DOM ids (see `aistudio-turns.ts`), so the n-th stored
 * user message is matched to the n-th user turn, and only kept when its text
 * agrees with that turn. A model message maps to the first non-user turn after
 * its user turn. A mismatch leaves the message without an element (no jump)
 * rather than pointing it at the wrong turn.
 */
function buildPositionMap(messages: ConversationMessage[]): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  const allTurns = Array.from(document.querySelectorAll<HTMLElement>(AISTUDIO_TURN_SELECTOR));
  const userTurns = allTurns.filter((t) => !!t.id && isUserTurn(t));
  if (!userTurns.length) return map;

  const storeUserCount = messages.filter((m) => m.role === 'user').length;
  let userIndex = -1;
  let currentUserTurn: HTMLElement | null = null;
  let modelTaken = false;

  for (const msg of messages) {
    if (msg.role === 'user') {
      userIndex++;
      modelTaken = false;
      const turn = userTurns[userIndex];
      currentUserTurn =
        turn && userTurnMatches(turn, msg.content, storeUserCount, userTurns.length)
          ? turn
          : null;
      if (currentUserTurn) map.set(msg.id, currentUserTurn);
      continue;
    }
    // First model message after a matched user turn
    if (!currentUserTurn || modelTaken) continue;
    modelTaken = true;
    const start = allTurns.indexOf(currentUserTurn);
    for (let i = start + 1; i < allTurns.length; i++) {
      const t = allTurns[i];
      if (isUserTurn(t)) break;
      if (t.id) {
        map.set(msg.id, t);
        break;
      }
    }
  }
  return map;
}

function findByPosition(messageId: string): HTMLElement | null {
  const messages = useConversationMessagesStore.getState().messages;
  if (!positionCache || positionCache.messages !== messages) {
    positionCache = { messages, map: buildPositionMap(messages) };
    queueMicrotask(() => {
      positionCache = null;
    });
  }
  const el = positionCache.map.get(messageId) ?? null;
  return el?.isConnected ? el : null;
}

/**
 * Find a chat turn element by message ID.
 *
 * Direct id matches first (in case a caller already holds a turn id), then the
 * position-based match against the stored messages.
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

  return findByPosition(messageId);
}

function getChatScrollContainer(): HTMLElement | null {
  return document.querySelector('ms-autoscroll-container') as HTMLElement | null;
}

let cancelPreviousJump: (() => void) | null = null;

/** Same jump as the SmartScrollbar: instant + re-align, since turns are virtualised. */
function scrollToMessageElement(el: HTMLElement): void {
  const turn = (el.closest(AISTUDIO_TURN_SELECTOR) as HTMLElement | null) ?? el;
  const scroller = getChatScrollContainer();
  cancelPreviousJump?.();
  cancelPreviousJump = null;
  if (!scroller) {
    turn.scrollIntoView({ block: 'start', behavior: 'auto' });
    return;
  }
  cancelPreviousJump = scrollTurnIntoView(turn, scroller);
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

  scrollToMessageElement,

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
