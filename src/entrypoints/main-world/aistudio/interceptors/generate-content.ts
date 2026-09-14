/**
 * Watching `GenerateContent` as it streams.
 *
 * Every other interceptor here works off `onResponse`, which ajax-hook fires at
 * `readyState 4`. That is the wrong moment for this one request: it is the only
 * AI Studio endpoint that streams, and waiting for it to close is what left the
 * agent view a turn behind.
 *
 * The incremental hook comes from ajax-hook's own request config rather than a
 * second patch of `window.XMLHttpRequest`: `proxy()` sets `config.xhr` to the real
 * XHR in its `open` handler, before `onRequest` runs (see `xhr-proxy.js`). Adding a
 * `readystatechange` listener there is ordinary DOM, touches nothing global, and
 * leaves the existing `onResponse` path exactly as it was — `UpdatePrompt` still
 * delivers the authoritative transcript, this just gets there first.
 */

import throttle from 'lodash/throttle';
import {
  GenerateContentStreamReader,
  readPendingUserText,
} from '../lib/generate-content-stream';
import { MODEL_STREAM_EVENT, type ModelStreamDetail } from '@/shared/types/model-stream';

/**
 * How often to tell the overlay. Each event lands in a zustand store and repaints
 * the conversation, and AI Studio pushes far faster than that is worth doing —
 * measured bursts of ~100ms between chunks, occasionally under 60ms.
 */
const DISPATCH_INTERVAL_MS = 100;

let streamCounter = 0;

export function observeGenerateContentStream(
  xhr: XMLHttpRequest,
  requestBody: unknown,
): void {
  const streamId = `gc-${Date.now()}-${++streamCounter}`;
  const reader = new GenerateContentStreamReader();

  // The request cannot change while its response streams, so this is read once.
  const user = readPendingUserText(requestBody);

  let lastThought = '';
  let lastAnswer = '';
  let closed = false;

  const dispatch = (
    thought: string,
    answer: string,
    // `null` tells the consumer to keep the question it already has — see the type.
    userText: string | null,
    finished: boolean,
  ) => {
    const detail: ModelStreamDetail = {
      streamId,
      thought,
      answer,
      user: userText,
      finished,
      // AI Studio's renderer reads the transcript store, so it never has to line a stream
      // up against a DOM node — see the field's doc.
      turnId: null,
    };
    globalThis.dispatchEvent(new CustomEvent(MODEL_STREAM_EVENT, { detail }));
  };

  const dispatchProgress = throttle(
    (thought: string, answer: string) => dispatch(thought, answer, null, false),
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
    if (state.thought === lastThought && state.answer === lastAnswer) return;
    lastThought = state.thought;
    lastAnswer = state.answer;
    dispatchProgress(state.thought, state.answer);
  };

  /**
   * Close out the stream. Bypasses the throttle so the last of the text is never
   * left sitting in a pending trailing call, and so `finished` is not delivered
   * before the text it belongs to.
   */
  const close = (): void => {
    if (closed) return;
    closed = true;
    read();
    dispatchProgress.cancel();

    // Nothing ever arrived: a rejected request (a 403 turned up during testing) or
    // one cancelled before the first chunk. Withdraw the question as well — it was
    // never accepted, and leaving it up would invent a turn that does not exist.
    const finalUser = !lastAnswer && !lastThought ? '' : user;

    dispatch(lastThought, lastAnswer, finalUser, true);
  };

  // Say the question straight away rather than waiting for the model to start. The
  // gap is not small: measured 2.7s from request to first chunk, and until then a
  // response-only view has nothing to show for a message the user has already sent.
  if (user) dispatch('', '', user, false);

  xhr.addEventListener('readystatechange', () => {
    if (xhr.readyState === 3) read();
    else if (xhr.readyState === 4) close();
  });

  // A dropped or cancelled generation still has to release the view: whatever text
  // did arrive is real and stays, it just stops being marked as in flight.
  xhr.addEventListener('error', close);
  xhr.addEventListener('abort', close);
  xhr.addEventListener('timeout', close);
}
