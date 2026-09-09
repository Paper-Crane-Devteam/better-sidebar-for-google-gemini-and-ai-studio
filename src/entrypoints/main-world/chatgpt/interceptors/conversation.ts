import { parseEventStream, extractMessagesFromEventStream } from '../lib/response-parser';
import { parseConversationRequest } from '../lib/request-parser';
import { trace } from '@/shared/lib/trace';

export function handleConversationResponse(response: any, url: string) {
  if (response.status === 200) {
    let prompt: string | undefined;

    // Parse Request to extract user prompt
    try {
      const requestBody = response.config?.body || response.config?.data;
      if (requestBody && typeof requestBody === 'string') {
        const parsedRequest = parseConversationRequest(requestBody);
        if (parsedRequest?.prompt) {
          prompt = parsedRequest.prompt;
        }
      }
    } catch (e) {
      console.error('Better Sidebar (ChatGPT): Error handling conversation request', e);
    }

    // Parse Response
    let responseBody = response.response;
    
    // Ensure responseBody is a string
    if (typeof responseBody !== 'string') {
      try {
        responseBody = JSON.stringify(responseBody);
      } catch (e) {
        console.warn('Better Sidebar (ChatGPT): Could not stringify response body', e);
        return;
      }
    }

    try {
      // Parse the event stream
      const events = parseEventStream(responseBody);
      trace('Better Sidebar (ChatGPT): Parsed Event Stream:', events);

      const { messages, conversationId, title } = extractMessagesFromEventStream(events, prompt);

      if (messages.length > 0 && conversationId) {
        console.log('Better Sidebar (ChatGPT): Captured turn', {
          conversationId,
          messageCount: messages.length,
          ...(title ? { title } : {}),
        });

        // If this is a new conversation (has title), dispatch create event
        if (title) {
          globalThis.dispatchEvent(
            new CustomEvent('BETTER_SIDEBAR_PROMPT_CREATE', {
              detail: {
                id: conversationId,
                title,
                messages,
                created_at: Math.floor(Date.now() / 1000),
                type: 'conversation',
              },
            })
          );
        } else {
          // Otherwise, dispatch update event for follow-up messages
          globalThis.dispatchEvent(
            new CustomEvent('CHATGPT_CHAT_CONTENT_RESPONSE', {
              detail: {
                conversationId,
                messages,
              },
            })
          );
        }
      }
    } catch (e) {
      console.error('Better Sidebar (ChatGPT): Error handling conversation response', e);
    }
  }
}
