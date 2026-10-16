import { proxy } from 'ajax-hook';
import { handleGenerateResponse } from './interceptors/generate';
import { observeStreamGenerate } from './interceptors/stream-generate';
import { isProcessSessionUrl, observeProcessSession } from './interceptors/process-session';
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
import { nativeFetch } from './lib/native-fetch';
import { initGeminiBackfillFetcher } from './lib/backfill-fetcher';

export function initGeminiInterceptors() {
  console.log('Better Sidebar: Main World Script (Gemini) Initialized');

  // Serves the content script's silent-backfill requests. Registered here, but
  // it only ever answers; nothing happens unless the scheduler asks.
  initGeminiBackfillFetcher();

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

  const originalFetch = nativeFetch;
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

    // Since the 2026-10 web build, batchexecute goes through fetch rather than XHR,
    // so ajax-hook never sees it. Same handlers, fed from here.
    if (url.includes('/data/batchexecute')) {
      return interceptBatchExecuteFetch(input, init, url, originalFetch);
    }

    return originalFetch(input, init);
  };

  proxy({
    onRequest: (config, handler) => {
      // Learn params from batchexecute over XHR (older builds; current builds use
      // fetch, handled in interceptBatchExecuteFetch).
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

      // Current generation transport (since the 2026-10 web build): WebChannel +
      // protobuf. Emits GENERATE_START, MODEL_STREAM and the DB events itself.
      if (isProcessSessionUrl(config.url)) {
        try {
          observeProcessSession(config.url, config.body, config.xhr);
        } catch (e) {
          console.warn('Better Sidebar (Gemini): could not observe processSession', e);
        }
      }

      // Legacy transport, kept while Gemini may still serve it to some users.
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
          routeBatchExecute(response, url);
        }
      } catch (e) {
        console.error('Better Sidebar: Error in Gemini interception handler', e);
      }

      handler.next(response);
    },
  });
}

/**
 * The shape the batchexecute handlers read. Matches ajax-hook's response object so the
 * fetch path and the XHR path feed the same code.
 */
interface InterceptedResponse {
  status: number;
  response: string;
  config: { url: string; body?: string; headers?: Record<string, string> };
}

function routeBatchExecute(response: InterceptedResponse | any, url: string): void {
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

async function readRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
  const body = init?.body;
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body == null && input instanceof Request) return input.clone().text();
  return undefined;
}

function headersToRecord(input: RequestInfo | URL, init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (h: HeadersInit | undefined) => {
    if (!h) return;
    new Headers(h).forEach((v, k) => {
      out[k] = v;
    });
  };
  if (input instanceof Request) add(input.headers);
  add(init?.headers);
  return out;
}

function interceptBatchExecuteFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  url: string,
  originalFetch: typeof fetch,
): Promise<Response> {
  // Read the body before the request is sent: a Request's body can only be read once,
  // so this works on a clone, and the clone must be taken before fetch consumes it.
  let bodyPromise: Promise<string | undefined>;
  try {
    bodyPromise = readRequestBody(input, init).catch(() => undefined);
  } catch {
    bodyPromise = Promise.resolve(undefined);
  }
  const headers = headersToRecord(input, init);

  const resPromise = originalFetch(input, init);
  // Registered before the page gets the promise back, so this reaction runs first and
  // clones while the body is still unread. Cloning any later races the page's own read.
  const clonePromise = resPromise.then((res) => res.clone());

  // Observe on the side; the page gets its Response untouched and unawaited.
  void (async () => {
    const body = await bodyPromise;
    try {
      geminiRequestBuilder.learn(url, headers, body);
    } catch {
      // non-critical
    }
    let res: Response;
    try {
      res = await clonePromise;
    } catch {
      return;
    }
    try {
      const text = await res.text();
      routeBatchExecute({ status: res.status, response: text, config: { url, body, headers } }, url);
    } catch (e) {
      console.error('Better Sidebar: Error in Gemini fetch interception handler', e);
    }
  })();

  return resPromise;
}
