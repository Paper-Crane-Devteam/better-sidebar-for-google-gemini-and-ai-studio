import type { RpcCall } from '../lib/batchexecute';
import {
  getChatContentEntries,
  parseChatContentEntries,
  sortChatMessages,
} from '../lib/chat-content-parser';
import { trace } from '@/shared/lib/trace';

/** `hNvQHb` — a conversation's transcript, fetched when the user opens it. */
export function handleChatContent(call: RpcCall): void {
  if (!call.response) return;

  const messages = sortChatMessages(parseChatContentEntries(getChatContentEntries(call.response)));
  if (messages.length === 0) {
    console.warn('Better Sidebar (Gemini): Chat Content had no parsable entries');
    return;
  }

  console.log(`Better Sidebar (Gemini): Parsed ${messages.length} history items`);
  trace('Better Sidebar (Gemini): History items:', messages);

  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_CHAT_CONTENT_RESPONSE', {
      detail: { conversationId: messages[0].conversation_id, messages },
    }),
  );
}
