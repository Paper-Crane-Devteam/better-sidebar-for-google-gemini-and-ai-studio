/**
 * Serves the content script's backfill requests: reads one conversation's whole
 * transcript out of Gemini's chat-content RPC and hands it back.
 *
 * Pagination is resolved here rather than in the content script so the cross-world
 * protocol stays one message per conversation. The page-to-page pause is small
 * because a single conversation is a handful of requests at most; the expensive
 * pacing (between conversations) is the scheduler's job.
 *
 * Uses `fetch`, which ajax-hook does not proxy — so unlike the page's own
 * requests these responses never reach the interceptors, and cannot make the
 * sidebar think the user opened a conversation they did not.
 */

import {
  GEMINI_BACKFILL_FETCH,
  BACKFILL_MAX_PAGES,
  BACKFILL_PAGE_GAP_MS,
  BACKFILL_PAGE_SIZE,
  type BackfillFetchResult,
} from '@/shared/constants/backfill';
import { geminiRequestBuilder } from './request-builder';
import { getWrbFrErrorCode, parseResponsePayloads } from './response-parser';
import {
  getChatContentEntries,
  getNextPageToken,
  parseChatContentEntries,
  sortChatMessages,
  type SortableChatContentMessage,
} from './chat-content-parser';

const CHAT_CONTENT_RPC = 'hNvQHb';

/** google.rpc.Code NOT_FOUND, as batchexecute reports it in a failed `wrb.fr` chunk. */
const RPC_NOT_FOUND = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The request the Gemini UI makes when it opens a conversation, with the page
 * size and cursor as the only variables.
 *
 * Captured verbatim from real traffic; the trailing constants are not understood
 * and are passed through unchanged on purpose.
 */
function buildPayload(conversationId: string, pageToken: string | null) {
  return [
    `c_${conversationId}`,
    BACKFILL_PAGE_SIZE,
    pageToken,
    1,
    [0],
    [4],
    null,
    1,
  ];
}

async function fetchTranscript(conversationId: string): Promise<BackfillFetchResult> {
  if (!geminiRequestBuilder.ready) {
    return { ok: false, reason: 'not-ready' };
  }

  const collected: SortableChatContentMessage[] = [];
  let pageToken: string | null = null;
  let pages = 0;

  while (pages < BACKFILL_MAX_PAGES) {
    if (pages > 0) await sleep(BACKFILL_PAGE_GAP_MS);

    const res = await geminiRequestBuilder.execute({
      rpcid: CHAT_CONTENT_RPC,
      payload: buildPayload(conversationId, pageToken),
      sourcePath: `/app/${conversationId}`,
    });
    pages += 1;

    if (!res.ok) {
      return { ok: false, reason: 'http', detail: String(res.status), pages };
    }

    const body = await res.text();
    const payloads = parseResponsePayloads(body);
    if (payloads.length === 0) {
      // An RPC-level error rides inside an HTTP 200. NOT_FOUND (5) is Gemini
      // saying the conversation is gone for this account; anything else stays a
      // parse failure, because we cannot tell it apart from a format change.
      const code = getWrbFrErrorCode(body);
      if (code === RPC_NOT_FOUND) {
        return { ok: false, reason: 'not-found', pages };
      }
      return {
        ok: false,
        reason: 'parse',
        detail: code != null ? `rpc status ${code}` : undefined,
        pages,
      };
    }

    collected.push(
      ...parseChatContentEntries(getChatContentEntries(payloads[0])),
    );

    pageToken = getNextPageToken(payloads[0]);
    if (!pageToken) break;
  }

  // Every message carries the conversation it came from, so a mismatch means the
  // response is not the one we asked for. Dropping the batch is the only safe
  // move: writing it would file somebody else's turns under this conversation.
  const foreign = collected.find(
    (m) => m.conversation_id && m.conversation_id !== conversationId,
  );
  if (foreign) {
    return { ok: false, reason: 'parse', detail: 'conversation id mismatch', pages };
  }

  return { ok: true, messages: sortChatMessages(collected), pages };
}

export function initGeminiBackfillFetcher() {
  globalThis.addEventListener(GEMINI_BACKFILL_FETCH, async (e: Event) => {
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
