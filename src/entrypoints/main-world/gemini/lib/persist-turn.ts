/**
 * Writes one captured Gemini turn to the DB, whichever generation endpoint carried it
 * (`StreamGenerate` or `processSession`). A turn with a title creates the chat row;
 * one without attaches to a row that already exists.
 */

import { detectGeminiContext } from '@/shared/lib/gemini-context';
import { isGeminiTemporaryChat } from '@/shared/lib/dom-selectors';

export interface CapturedTurn {
  /** Without `c_`. */
  conversationId: string;
  prompt: string;
  /** `r_…`. */
  userMessageId: string;
  /** `rc_…`. */
  modelMessageId: string;
  answer: string;
  title: string;
  /** The request named no conversation, so this turn created it. */
  isNewChat: boolean;
  notebookId?: string | null;
  /** Everything after this `rc_` is replaced (regenerate/edit). */
  replaceAfterMessageId?: string | null;
  via: 'StreamGenerate' | 'processSession';
}

export function persistGeminiTurn(turn: CapturedTurn): void {
  const timestamp = Math.floor(Date.now() / 1000);
  const { conversationId } = turn;

  const messages: Record<string, unknown>[] = [];
  if (turn.prompt) {
    messages.push({
      role: 'user',
      id: turn.userMessageId || crypto.randomUUID(),
      conversation_id: conversationId,
      content: turn.prompt,
      message_type: 'text',
      created_at: timestamp,
    });
  }
  messages.push({
    role: 'model',
    id: turn.modelMessageId || crypto.randomUUID(),
    conversation_id: conversationId,
    content: turn.answer,
    message_type: 'text',
    created_at: timestamp,
  });

  // A new chat's title normally arrives in the stream; if it does not, the prompt
  // stands in until the next chat-list sync replaces it.
  const title = turn.title || (turn.isNewChat ? turn.prompt.slice(0, 80) : '');
  const replaceAfterMessageId = turn.replaceAfterMessageId ?? undefined;

  console.log('Better Sidebar (Gemini): Captured turn', {
    conversationId,
    userMessageId: turn.userMessageId,
    modelMessageId: turn.modelMessageId,
    promptChars: turn.prompt.length,
    replyChars: turn.answer.length,
    via: turn.via,
    ...(turn.isNewChat ? { newChat: true, title } : {}),
    ...(turn.notebookId ? { notebookId: turn.notebookId } : {}),
    ...(replaceAfterMessageId ? { replacesAfter: replaceAfterMessageId } : {}),
  });

  if (title) {
    const ctx = detectGeminiContext(globalThis.location?.pathname || '', turn.notebookId ?? null);
    globalThis.dispatchEvent(
      new CustomEvent('BETTER_SIDEBAR_PROMPT_CREATE', {
        detail: {
          id: conversationId,
          title,
          messages,
          created_at: timestamp,
          type: ctx.type,
          gem_id: ctx.gemId ?? undefined,
          notebook_id: ctx.notebookId ?? undefined,
          replaceAfterMessageId,
          is_temporary: isGeminiTemporaryChat(),
        },
      }),
    );
  } else {
    globalThis.dispatchEvent(
      new CustomEvent('GEMINI_CHAT_CONTENT_RESPONSE', {
        detail: { conversationId, messages, replaceAfterMessageId },
      }),
    );
  }
}
