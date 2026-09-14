/**
 * Watching Gemini's `StreamGenerate` as it streams.
 *
 * Sibling of AI Studio's `generate-content.ts`, deliberately built the same way: the
 * existing `handleGenerateResponse` still runs off `onResponse` and still writes the
 * transcript to the DB, and nothing here changes that. This is the *lossless, timely*
 * copy that the agent loop reads instead of scraping the rendered DOM.
 *
 * The incremental hook comes from ajax-hook's own request config rather than a second
 * patch of `window.XMLHttpRequest`: `proxy()` sets `config.xhr` to the real XHR in its
 * `open` handler, before `onRequest` runs. Adding a `readystatechange` listener there
 * is ordinary DOM and touches nothing global.
 *
 * ## No finish signal on the wire
 *
 * AI Studio's chunks carry a `finishReason`, so it can say "done" from the payload.
 * Gemini's frames carry nothing equivalent that we have found, so `readyState 4` is
 * the signal. That is a real difference in *provenance* but not in behaviour: the loop
 * only ever reads a settled answer, and the request closing is exactly when the
 * generation ended.
 */

import throttle from 'lodash/throttle';
import { StreamGenerateReader, readPromptFromPayload } from '../lib/stream-generate';
import { parseBatchExecuteRequest } from '../lib/request-parser';
import { MODEL_STREAM_EVENT, type ModelStreamDetail } from '@/shared/types/model-stream';

/**
 * How often to tell the overlay. Each event lands in a zustand store and repaints the
 * conversation, and the stream pushes faster than that is worth doing.
 */
const DISPATCH_INTERVAL_MS = 100;

let streamCounter = 0;

export function observeStreamGenerate(xhr: XMLHttpRequest, requestBody: unknown): void {
  const streamId = `sg-${Date.now()}-${++streamCounter}`;
  const reader = new StreamGenerateReader();

  // The request cannot change while its response streams, so this is read once.
  const user = readUserText(requestBody);

  let lastAnswer = '';
  // Announced in the stream's first frame, i.e. before any text, so every event that
  // carries an answer also carries the turn it belongs to.
  let lastTurnId = '';
  let closed = false;

  const dispatch = (
    answer: string,
    // `null` tells the consumer to keep the question it already has — see the type.
    userText: string | null,
    finished: boolean,
  ) => {
    const detail: ModelStreamDetail = {
      streamId,
      // Gemini exposes no separate reasoning channel here. '' rather than omitted, so
      // the contract stays one shape for both platforms.
      thought: '',
      answer,
      user: userText,
      finished,
      turnId: lastTurnId || null,
    };
    globalThis.dispatchEvent(new CustomEvent(MODEL_STREAM_EVENT, { detail }));
  };

  const dispatchProgress = throttle(
    (answer: string) => dispatch(answer, null, false),
    DISPATCH_INTERVAL_MS,
    { leading: true, trailing: true },
  );

  const read = (): void => {
    // `responseText` throws for binary response types, and would be empty anyway.
    let text: string;
    try {
      const type = xhr.responseType;
      if (type && type !== 'text') return;
      text = xhr.responseText;
    } catch {
      return;
    }
    if (!text) return;

    const state = reader.push(text);
    if (state.turnId) lastTurnId = state.turnId;
    if (state.answer === lastAnswer) return;
    lastAnswer = state.answer;
    dispatchProgress(state.answer);
  };

  /**
   * Close out the stream. Bypasses the throttle so the last of the text is never left
   * sitting in a pending trailing call, and so `finished` is not delivered before the
   * text it belongs to — the loop keys off `finished`, so an early one would hand it a
   * half-written response.
   */
  const close = (): void => {
    if (closed) return;
    closed = true;
    read();
    dispatchProgress.cancel();

    // Nothing ever arrived: a rejected or cancelled request. Withdraw the question as
    // well — it was never accepted, and leaving it up would invent a turn.
    const finalUser = !lastAnswer ? '' : user;

    dispatch(lastAnswer, finalUser, true);
  };

  // Say the question straight away rather than waiting for the model to start: there
  // is a real gap before the first frame, and until then a response-only view has
  // nothing to show for a message the user has already sent.
  if (user) dispatch('', user, false);

  xhr.addEventListener('readystatechange', () => {
    if (xhr.readyState === 3) read();
    else if (xhr.readyState === 4) close();
  });

  // A dropped or cancelled generation still has to release the view: whatever text did
  // arrive is real and stays, it just stops being marked as in flight.
  xhr.addEventListener('error', close);
  xhr.addEventListener('abort', close);
  xhr.addEventListener('timeout', close);
}

/**
 * The prompt out of the `f.req` body, or '' when it cannot be read.
 *
 * `parseBatchExecuteRequest` returns the outer rpc row; the prompt lives inside its
 * second element, which is itself a JSON string — the same double encoding
 * `handleGenerateResponse` already walks.
 */
function readUserText(requestBody: unknown): string {
  try {
    if (typeof requestBody !== 'string') return '';
    const parsed = parseBatchExecuteRequest(requestBody);
    const innerJsonString = parsed?.[1];
    if (typeof innerJsonString !== 'string') return '';
    return readPromptFromPayload(JSON.parse(innerJsonString));
  } catch {
    return '';
  }
}
