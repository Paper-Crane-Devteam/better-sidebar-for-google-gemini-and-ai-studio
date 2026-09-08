import { proxy } from 'ajax-hook';
import { handleGenerateResponse } from './interceptors/generate';
import { observeStreamGenerate } from './interceptors/stream-generate';
import { handleChatContentResponse } from './interceptors/chat-content';
import { handleListChatResponse } from './interceptors/list-chat';
import { handleDeleteResponse } from './interceptors/delete';
import { handleCNgdBeResponse } from './interceptors/create-gem';
import { handleRenameResponse } from './interceptors/rename';
import { handleBranchResponse } from './interceptors/branch';
import { handleDeleteGemResponse } from './interceptors/delete-gem';
import { handleDeleteNotebookResponse } from './interceptors/delete-notebook';
import { handleRenameNotebookResponse } from './interceptors/rename-notebook';
import { handleCreateNotebookResponse } from './interceptors/create-notebook';
import { handleDownloadResponse } from './interceptors/download';
import { geminiRequestBuilder } from './lib/request-builder';

export function initGeminiInterceptors() {
  console.log('Better Sidebar: Main World Script (Gemini) Initialized');

  // Expose request builder for content script via custom events
  globalThis.addEventListener('GEMINI_API_EXECUTE', async (e: Event) => {
    const { rpcid, payload, sourcePath, callbackEvent } = (e as CustomEvent).detail || {};
    if (!rpcid || !callbackEvent) return;

    try {
      const res = await geminiRequestBuilder.execute({ rpcid, payload, sourcePath });
      const text = await res.text();
      globalThis.dispatchEvent(
        new CustomEvent(callbackEvent, {
          detail: { ok: res.ok, status: res.status, body: text },
        }),
      );
    } catch (err: any) {
      globalThis.dispatchEvent(
        new CustomEvent(callbackEvent, {
          detail: { ok: false, status: 0, error: err.message },
        }),
      );
    }
  });

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
      // Learn params from every batchexecute request for the request builder
      if (config.url?.includes('batchexecute')) {
        try {
          geminiRequestBuilder.learn(
            config.url,
            (config.headers as Record<string, string>) || {},
            typeof config.body === 'string' ? config.body : undefined,
          );
        } catch {
          // non-critical
        }
      }

      // Notify overlay that a new chat generation has started
      if (config.url?.includes('StreamGenerate')) {
        globalThis.dispatchEvent(
          new CustomEvent('BETTER_SIDEBAR_GENERATE_START'),
        );

        // Read the reply as it streams, not in `onResponse`. `handleGenerateResponse`
        // still runs there and still writes the transcript; this is the lossless copy
        // the agent loop parses instead of the rendered DOM — see
        // `interceptors/stream-generate.ts`.
        if (config.xhr) {
          try {
            observeStreamGenerate(config.xhr, config.body);
          } catch (e) {
            // The live view is an improvement on the response path, not a
            // prerequisite for it. Losing it must not cost us the transcript.
            console.warn('Better Sidebar (Gemini): could not observe stream', e);
          }
        }
      }

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
            handleCNgdBeResponse(response, url);
          } else if (url.includes('rpcids=MUAZcd')) {
            handleRenameResponse(response, url);
          } else if (url.includes('rpcids=KDNZr')) {
            handleBranchResponse(response, url);
          } else if (url.includes('rpcids=UXcSJb')) {
            handleDeleteGemResponse(response, url);
          } else if (url.includes('rpcids=Nwkn9')) {
            handleDeleteNotebookResponse(response, url);
          } else if (url.includes('rpcids=kHv0Vd')) {
            handleRenameNotebookResponse(response, url);
          } else if (url.includes('rpcids=oMH3Zd')) {
            handleCreateNotebookResponse(response, url);
          }
        }
      } catch (e) {
        console.error('Better Sidebar: Error in Gemini interception handler', e);
      }

      handler.next(response);
    },
  });
}
