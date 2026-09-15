import { parseResponsePayloads } from '../lib/response-parser';
import { parseBatchExecuteRequest } from '../lib/request-parser';
import {
  getChatContentEntries,
  parseChatContentEntries,
  sortChatMessages,
} from '../lib/chat-content-parser';
import { trace } from '@/shared/lib/trace';

export function handleChatContentResponse(response: any, url: string) {
  if (response.status !== 200) return;

  // Parse Request
  try {
    const requestBody = response.config?.body;
    const requestData = requestBody || response.config?.data;
    if (requestData && typeof requestData === 'string') {
      const parsedBody = parseBatchExecuteRequest(requestData);
      trace('Better Sidebar (Gemini): Parsed Chat Content Request:', parsedBody);
    }
  } catch (e) {
    console.error('Better Sidebar (Gemini): Error handling chat content request', e);
  }

  let responseBody = response.response;

  if (typeof responseBody !== 'string') {
    try {
      responseBody = JSON.stringify(responseBody);
    } catch (e) {
      console.warn('Better Sidebar (Gemini): Could not stringify response body', e);
      return;
    }
  }

  try {
    const payloads = parseResponsePayloads(responseBody);
    trace('Better Sidebar (Gemini): Chat Content Payloads:', payloads);
    if (payloads.length === 0) return;

    const messages = sortChatMessages(
      parseChatContentEntries(getChatContentEntries(payloads[0])),
    );

    // Nothing parsed: bail before touching messages[0].
    if (messages.length === 0) {
      console.warn('Better Sidebar (Gemini): Chat Content had no parsable entries');
      return;
    }

    console.log(`Better Sidebar (Gemini): Parsed ${messages.length} history items`);
    trace('Better Sidebar (Gemini): History items:', messages);

    globalThis.dispatchEvent(
      new CustomEvent('GEMINI_CHAT_CONTENT_RESPONSE', {
        detail: {
          conversationId: messages[0].conversation_id,
          messages,
        },
      }),
    );
  } catch (e) {
    console.error('Better Sidebar (Gemini): Error handling chat content response', e);
  }
}
