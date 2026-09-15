/**
 * Fetch one conversation's transcript and store it.
 *
 * The single unit of work behind both entry points: the idle scheduler that walks
 * the whole library on its own, and the status dialog where the user asks for a
 * specific chat. They differ in *when* and *how often* they call this, and in
 * nothing else — which is the point. A manual sync that took a different code path
 * would be a second implementation to keep correct.
 */

import {
  AISTUDIO_BACKFILL_FETCH,
  GEMINI_BACKFILL_FETCH,
  type BackfillFailureReason,
} from '@/shared/constants/backfill';
import { Platform } from '@/shared/types/platform';
import { requestTranscript } from './bridge';

/**
 * `unsupported` — the platform has no transcript endpoint we know how to call.
 * `save`        — the transcript arrived intact and the database refused it.
 */
export type SyncFailureReason = BackfillFailureReason | 'unsupported' | 'save';

export interface SyncResult {
  ok: boolean;
  /** Messages handed to the database. Zero with `ok: true` means the chat is genuinely empty. */
  stored: number;
  /** API round trips it took, for the platforms that paginate. */
  pages?: number;
  reason?: SyncFailureReason;
  detail?: string;
}

const FETCH_EVENT: Partial<Record<Platform, string>> = {
  [Platform.GEMINI]: GEMINI_BACKFILL_FETCH,
  [Platform.AI_STUDIO]: AISTUDIO_BACKFILL_FETCH,
};

export function isBackfillSupported(platform: Platform): boolean {
  return FETCH_EVENT[platform] !== undefined;
}

/**
 * Which database message writes the transcript, and why it differs per platform.
 *
 * Gemini's transcript carries stable per-message ids and real timestamps, so an
 * upsert is exact: re-reading a conversation updates what changed and adds what is
 * new without disturbing the order of what was already there.
 *
 * AI Studio's has neither, so there is no key to match rows on and the only honest
 * write is to replace the lot. Not lossy — the response is the entire prompt, the
 * same thing the interceptor path stores when the page saves one.
 *
 * Neither touches the `conversations` row. In particular this is deliberately not
 * `SAVE_CONVERSATION`, which also clears `deleted_at` and rewrites the title: fine
 * while the user is looking at the chat, wrong for a background pass, where it
 * would resurrect a conversation deleted while the fetch was in flight.
 */
function writeMessage(platform: Platform, conversationId: string, messages: unknown[]) {
  if (platform === Platform.GEMINI) {
    return {
      type: 'UPSERT_MESSAGES',
      platform,
      payload: { conversationId, messages },
    };
  }
  return {
    type: 'REPLACE_MESSAGES',
    platform,
    payload: { conversationId, messages },
  };
}

export async function syncConversationMessages(
  platform: Platform,
  conversationId: string,
): Promise<SyncResult> {
  const fetchEvent = FETCH_EVENT[platform];
  if (!fetchEvent) {
    return { ok: false, stored: 0, reason: 'unsupported' };
  }

  const fetched = await requestTranscript(fetchEvent, conversationId);
  if (!fetched.ok) {
    return {
      ok: false,
      stored: 0,
      pages: fetched.pages,
      reason: fetched.reason,
      detail: fetched.detail,
    };
  }

  const messages = fetched.messages ?? [];
  if (messages.length === 0) {
    return { ok: true, stored: 0, pages: fetched.pages };
  }

  const response = await browser.runtime.sendMessage(
    writeMessage(platform, conversationId, messages),
  );
  if (!response?.success) {
    return {
      ok: false,
      stored: 0,
      pages: fetched.pages,
      reason: 'save',
      detail: response?.error,
    };
  }

  return { ok: true, stored: messages.length, pages: fetched.pages };
}
