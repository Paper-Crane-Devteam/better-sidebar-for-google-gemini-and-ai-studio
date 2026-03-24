import { proxy } from 'ajax-hook';
import { handleGenerateResponse } from './interceptors/generate';
import { handleChatContentResponse } from './interceptors/chat-content';
import { handleListChatResponse } from './interceptors/list-chat';
import { handleDeleteResponse } from './interceptors/delete';
import { handleCreateGemResponse } from './interceptors/create-gem';
import { handleDownloadResponse } from './interceptors/download';

export function initGeminiInterceptors() {
  console.log('Better Sidebar: Main World Script (Gemini) Initialized');

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;

    if (/lh3\.googleusercontent\.com\/rd-gg(?:-dl)?\//.test(url)) {
      return handleDownloadResponse(url, originalFetch);
    }

    return originalFetch(input, init);
  };

  proxy({
    onRequest: (config, handler) => {
      handler.next(config);
    },
    onError: (err, handler) => {
      console.error('Better Sidebar: Request Error', err);
      handler.next(err);
    },
    onResponse: (response, handler) => {
      const url = response.config.url;

      try {
        if (url.includes('StreamGenerate')) {
          handleGenerateResponse(response, url);
        } else if (url.includes('batchexecute')) {
          if (url.includes('rpcids=hNvQHb')) {
            handleChatContentResponse(response, url);
          } else if (url.includes('rpcids=MaZiqc')) {
            handleListChatResponse(response, url);
          } else if (url.includes('rpcids=GzXR5e')) {
            handleDeleteResponse(response, url);
          } else if (url.includes('rpcids=CNgdBe')) {
            handleCreateGemResponse(response, url);
          }
        }
      } catch (e) {
        console.error('Better Sidebar: Error in Gemini interception handler', e);
      }

      handler.next(response);
    },
  });
}
