import { interceptFetch, readResponseBody } from '../lib/fetch-interceptor';
import { handleListChatResponse } from './interceptors/list-chat';
import { handleConversationResponse } from './interceptors/conversation';
import { trace } from '@/shared/lib/trace';

export function initChatGPTInterceptors() {
  console.log('Better Sidebar: Main World Script (ChatGPT) Initialized');

  // Use robust fetch interceptor
  interceptFetch({
    // Only intercept ChatGPT backend APIs
    urlPattern: (url) => url.includes('/backend-api/conversations') || url.includes('/backend-api/f/conversation'),
    
    onRequest: (url) => {
      trace('Better Sidebar (ChatGPT): Fetch intercepted', url);
    },
    
    onResponse: async (url, response, clonedResponse, init) => {
      if (response.status !== 200) {
        console.warn(
          'Better Sidebar (ChatGPT): API responded',
          response.status,
          url,
        );
      } else {
        trace('Better Sidebar (ChatGPT): Intercepting ChatGPT API', url);
      }

      let responseBody: unknown;
      try {
        responseBody = await readResponseBody(clonedResponse);
      } catch (error) {
        // Stream was aborted/closed by the page (e.g. user navigated or request cancelled); skip handling.
        if (error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError') return;
        throw error;
      }

      // Build a response object similar to ajax-hook format for consistency with other platforms
      const interceptedResponse = {
        status: response.status,
        response: responseBody,
        config: {
          url,
          body: init?.body,
          data: init?.body,
        },
      };

      // Handle based on URL pattern
      // List chats: /backend-api/conversations?offset=...
      if (url.includes('/backend-api/conversations?')) {
        handleListChatResponse(interceptedResponse, url);
      }
      // Conversation stream: /backend-api/f/conversation
      else if (url.includes('/backend-api/f/conversation')) {
        handleConversationResponse(interceptedResponse, url);
      }
    },
    
    onError: (url, error) => {
      console.error('Better Sidebar (ChatGPT): Fetch error', url, error);
    },
  });
}
