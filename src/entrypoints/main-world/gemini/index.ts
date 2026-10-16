/**
 * Gemini main-world entry: taps the page's own traffic and hands each exchange to the
 * code that understands it.
 *
 * Two endpoints matter, and transport is decided here and nowhere else:
 *
 *   batchexecute     every RPC except generation. Normalised to {url, status,
 *                    request, response} and dispatched by rpcid in
 *                    `interceptors/rpc-handlers.ts`. Sent via fetch since the
 *                    2026-10 web build, via XHR before — both are tapped.
 *   processSession   generation (WebChannel + protobuf, XHR). Streams, so it is
 *                    observed from the request onward, not on completion —
 *                    `interceptors/process-session.ts`.
 */

import { proxy } from 'ajax-hook';
import { isProcessSessionUrl, observeProcessSession } from './interceptors/process-session';
import { observeBatchExecute } from './interceptors/rpc-handlers';
import { handleDownloadResponse } from './interceptors/download';
import { geminiRequestBuilder } from './lib/request-builder';
import { nativeFetch } from './lib/native-fetch';
import { tapFetch } from './lib/fetch-tap';
import { initGeminiBackfillFetcher } from './lib/backfill-fetcher';

const isBatchExecute = (url: string | undefined) => !!url && url.includes('/data/batchexecute');

/** Both transports end here. */
function onBatchExecute(exchange: {
  url: string;
  status: number;
  requestBody: unknown;
  requestHeaders: Record<string, string>;
  responseText: unknown;
}): void {
  try {
    geminiRequestBuilder.learn(
      exchange.url,
      exchange.requestHeaders,
      typeof exchange.requestBody === 'string' ? exchange.requestBody : undefined,
    );
  } catch {
    // Learning is best-effort; the request builder only needs one good sample.
  }
  if (typeof exchange.responseText !== 'string') return;
  observeBatchExecute({
    url: exchange.url,
    status: exchange.status,
    requestBody: exchange.requestBody,
    responseText: exchange.responseText,
  });
}

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

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

    if (/lh3\.googleusercontent\.com\/rd-gg(?:-dl)?\//.test(url)) {
      return handleDownloadResponse(url, nativeFetch);
    }
    if (isBatchExecute(url)) {
      return tapFetch(input, init, url, nativeFetch, onBatchExecute);
    }
    return nativeFetch(input, init);
  };

  proxy({
    onRequest: (config, handler) => {
      if (isProcessSessionUrl(config.url)) {
        try {
          observeProcessSession(config.url, config.body, config.xhr);
        } catch (e) {
          console.warn('Better Sidebar (Gemini): could not observe processSession', e);
        }
      }
      handler.next(config);
    },
    onError: (err, handler) => {
      handler.next(err);
    },
    onResponse: (response, handler) => {
      const { config } = response;
      if (isBatchExecute(config.url)) {
        onBatchExecute({
          url: config.url,
          status: response.status,
          requestBody: config.body,
          requestHeaders: (config.headers as Record<string, string>) || {},
          responseText: response.response,
        });
      }
      handler.next(response);
    },
  });
}
