/**
 * Serves the content script's backfill requests for AI Studio.
 *
 * Simpler than the Gemini side: `ResolveDriveResource` returns the entire prompt,
 * transcript included, so one request per conversation and no pagination.
 *
 * Uses `fetch`, which ajax-hook does not proxy, so these responses never reach
 * `handleChatResponse` and cannot be mistaken for the user opening a prompt.
 */

import {
  AISTUDIO_BACKFILL_FETCH,
  type BackfillFetchResult,
} from '@/shared/constants/backfill';
import { aiStudioRequestBuilder } from './request-builder';
import { parseConversation } from './response-parser';

async function fetchTranscript(promptId: string): Promise<BackfillFetchResult> {
  if (!aiStudioRequestBuilder.ready) {
    return { ok: false, reason: 'not-ready' };
  }

  const res = await aiStudioRequestBuilder.execute({
    method: 'ResolveDriveResource',
    body: [promptId],
  });

  if (!res.ok) {
    return { ok: false, reason: 'http', detail: String(res.status), pages: 1 };
  }

  const raw = await res.text();
  let json: any;
  try {
    json = JSON.parse(raw.replace(/^\)\]\}'/, '').trim());
  } catch {
    return { ok: false, reason: 'parse', pages: 1 };
  }

  const parsed = parseConversation(json);
  if (!parsed) {
    return { ok: false, reason: 'parse', pages: 1 };
  }

  // The response names the prompt it describes. If that is not the one we asked
  // for, discard it rather than filing another prompt's turns under this id.
  if (parsed.id && parsed.id !== promptId) {
    return { ok: false, reason: 'parse', detail: 'prompt id mismatch', pages: 1 };
  }

  return { ok: true, messages: parsed.messages, pages: 1 };
}

export function initAiStudioBackfillFetcher() {
  globalThis.addEventListener(AISTUDIO_BACKFILL_FETCH, async (e: Event) => {
    const { conversationId, callbackEvent } = (e as CustomEvent).detail || {};
    if (!conversationId || !callbackEvent) return;

    const reply = (detail: BackfillFetchResult) =>
      globalThis.dispatchEvent(new CustomEvent(callbackEvent, { detail }));

    try {
      reply(await fetchTranscript(conversationId));
    } catch (err: any) {
      reply({ ok: false, reason: 'error', detail: err?.message || String(err) });
    }
  });
}
