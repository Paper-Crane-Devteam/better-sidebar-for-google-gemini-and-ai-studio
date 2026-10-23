/**
 * Captures Gemini turns sent over `StreamGenerate`.
 *
 * Transport-agnostic: the caller feeds the growing response text and says when it
 * ended; `index.ts` adapts both XHR (older builds) and fetch (2026-10-20 build onward)
 * to that. One observer per request. Wire format: `lib/stream-generate.ts`.
 *
 * Emits the same events as the `processSession` interceptor: GENERATE_START at
 * send, MODEL_STREAM while it streams (what the agent loop reads), and the DB write
 * once the stream closes — the close is the finish signal, the frames carry none.
 */

import throttle from 'lodash/throttle';
import { parseStreamGenerateRequest, StreamGenerateReader } from '../lib/stream-generate';
import { persistGeminiTurn } from '../lib/persist-turn';
import { MODEL_STREAM_EVENT, type ModelStreamDetail } from '@/shared/types/model-stream';
import { trace } from '@/shared/lib/trace';

const DISPATCH_INTERVAL_MS = 100;

let streamCounter = 0;

/**
 * The real path is `/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate`
 * — the service name is dot-qualified, so don't anchor on a `/` before it.
 */
export function isStreamGenerateUrl(url: string | undefined): boolean {
  return !!url && url.includes('BardFrontendService/StreamGenerate');
}

export interface StreamGenerateObserver {
  /** The full response text received so far. */
  push(text: string): void;
  /** The stream ended — normally, by error or by abort. Idempotent. */
  close(): void;
}

export function observeStreamGenerate(requestBody: unknown): StreamGenerateObserver {
  const streamId = `sg-${Date.now()}-${++streamCounter}`;
  const request = parseStreamGenerateRequest(requestBody);
  const reader = new StreamGenerateReader();
  let lastAnswer = '';
  let closed = false;

  const dispatch = (answer: string, user: string | null, finished: boolean) => {
    const detail: ModelStreamDetail = {
      streamId,
      thought: '',
      answer,
      user,
      finished,
      turnId: reader.state.turnId || null,
    };
    globalThis.dispatchEvent(new CustomEvent(MODEL_STREAM_EVENT, { detail }));
  };

  const progress = throttle((answer: string) => dispatch(answer, null, false), DISPATCH_INTERVAL_MS, {
    leading: true,
    trailing: true,
  });

  globalThis.dispatchEvent(new CustomEvent('BETTER_SIDEBAR_GENERATE_START'));
  // Show the question straight away; the model takes a moment to start.
  if (request.prompt) dispatch('', request.prompt, false);

  return {
    push(text) {
      if (closed || !text) return;
      const { answer } = reader.push(text);
      if (answer === lastAnswer) return;
      lastAnswer = answer;
      progress(answer);
    },
    close() {
      if (closed) return;
      closed = true;
      progress.cancel();

      const state = reader.state;
      // Nothing arrived: a rejected or cancelled request. Withdraw the question too,
      // it was never accepted.
      dispatch(state.answer, state.answer ? request.prompt : '', true);

      if (!state.answer || !state.conversationId) return;
      persistGeminiTurn({
        conversationId: state.conversationId,
        prompt: request.prompt,
        userMessageId: state.turnId,
        modelMessageId: state.modelMessageId,
        answer: state.answer,
        title: state.title,
        isNewChat: !request.conversationId,
        notebookId: request.notebookId,
        replaceAfterMessageId: request.previousModelResponseId,
        via: 'StreamGenerate',
      });
      trace('Better Sidebar (Gemini): StreamGenerate turn', { request, state });
    },
  };
}

/** XHR transport: reads as `responseText` grows, closes on readyState 4 / error / abort. */
export function observeStreamGenerateXhr(xhr: XMLHttpRequest, requestBody: unknown): void {
  const observer = observeStreamGenerate(requestBody);
  const read = () => {
    try {
      if (xhr.responseType && xhr.responseType !== 'text') return;
      observer.push(xhr.responseText);
    } catch {
      // responseText unreadable: skip this tick.
    }
  };
  const close = () => {
    read();
    observer.close();
  };
  xhr.addEventListener('readystatechange', () => {
    if (xhr.readyState === 3) read();
    else if (xhr.readyState === 4) close();
  });
  xhr.addEventListener('progress', read);
  xhr.addEventListener('error', close);
  xhr.addEventListener('abort', close);
  xhr.addEventListener('timeout', close);
}

/**
 * fetch transport. The page gets its own Response untouched; we read a clone's body
 * stream on the side. Both clones are taken before the page can touch either body —
 * see `lib/fetch-tap.ts` for why that ordering matters.
 */
export function observeStreamGenerateFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  realFetch: typeof fetch,
): Promise<Response> {
  let bodyPromise: Promise<string | undefined>;
  try {
    const body = init?.body;
    if (typeof body === 'string') bodyPromise = Promise.resolve(body);
    else if (body instanceof URLSearchParams) bodyPromise = Promise.resolve(body.toString());
    else if (body == null && input instanceof Request)
      bodyPromise = input.clone().text().catch(() => undefined);
    else bodyPromise = Promise.resolve(undefined);
  } catch {
    bodyPromise = Promise.resolve(undefined);
  }

  const resPromise = realFetch(input, init);
  const clonePromise = resPromise.then((res) => res.clone());

  void (async () => {
    const observer = observeStreamGenerate(await bodyPromise);
    try {
      const res = await clonePromise;
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        observer.push(text);
      }
      text += decoder.decode();
      observer.push(text);
    } catch {
      // Network error or abort: whatever arrived is still real and gets finalized.
    } finally {
      observer.close();
    }
  })();

  return resPromise;
}
