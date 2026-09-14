/**
 * useConversationMessages — the conversation, as turns the agent view can render.
 *
 * Two readers, one per platform, because the two platforms keep the conversation in
 * genuinely different places:
 *
 * | | structure comes from | why |
 * |---|---|---|
 * | Gemini | the DOM | every turn is in the document, including ones from before the extension was installed |
 * | AI Studio | `conversation-messages-store` | its transcript is **virtualised** — measured: 16 turns in the document, 5 with any content in them; scroll to the top and it is 1. Reading the DOM there does not return a partial conversation, it returns a confidently wrong one |
 *
 * The store is not a consolation prize on AI Studio, it is the better source: it is fed by
 * the API interceptor, so the text is the model's own output rather than a
 * render-then-scrape round trip, and the `<bs_agent_tool>` blocks arrive verbatim.
 *
 * ⚠️ **Text and structure are not the same question, and only structure differs.** Both
 * readers now prefer the model's own bytes for a model turn — Gemini's via
 * `verbatimModelText`, which keeps the DOM for the turn *list* and for anything the
 * extension never captured. That is not a nicety: `ToolCallWidget` digests the text it is
 * given into a fingerprint and matches it against the one the engine published when it
 * parked for approval, and the engine reads the API stream (see `parse-response`). Two
 * different copies of the same turn produce two different digests, and the approval
 * buttons then appear on no card at all.
 *
 * Parsing is shared — see `turn-assembly.ts`. Only the reading differs.
 */

import { useState, useEffect, useCallback } from 'react';
import throttle from 'lodash/throttle';
import { findConversationScroller } from './constants';
import { useCurrentConversationId } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';
import type { ExtractedToolCall } from './helpers/tool-parser';
import type { DerivedToolOutcome, ToolResultEntry } from './helpers/tool-outcomes';
import { assembleTurns, type RawTurn } from './turn-assembly';
import { htmlToMarkdown } from '@/shared/lib/utils/utils';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { useConversationMessagesStore } from '@/shared/lib/conversation-messages-store';
import { useModelStreamStore, selectLiveTail } from '@/shared/lib/model-stream-store';
import { getPlatformDomAdapter } from '@/shared/lib/platform-dom-adapter';
import { getRunState } from '@/entrypoints/overlay.content/shared/lib/aistudio-editor';

// ─── Types ───────────────────────────────────────────────────────────────────

export type { ToolResultEntry, DerivedToolOutcome };

export interface DisplayMessageTurn {
  id: string;
  role: 'user' | 'model';
  rawText: string;
  /** Clean text for display (prompt content stripped, tool results stripped) */
  displayText: string;
  promptId?: string;
  promptTitle?: string;
  promptContent?: string;
  /** Parsed tool result entries (user message contains tool results sent back to AI) */
  toolResults: ToolResultEntry[];
  toolCalls: ExtractedToolCall[];
  /**
   * What became of each `toolCalls[i]`, recovered from the results message that followed
   * this turn. `null` where nothing could be matched — and always null on the turn
   * currently running, whose results haven't been sent yet. The live session's own ledger
   * covers that case.
   */
  toolOutcomes: Array<DerivedToolOutcome | null>;
  isStreaming: boolean;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function useConversationMessages(): DisplayMessageTurn[] {
  // Fixed for the lifetime of the page, so both readers are called on every render and
  // the inactive one is told to stay idle. Calling only one would be a conditional hook.
  const isAiStudio = detectPlatform() === Platform.AI_STUDIO;

  const domTurns = useDomConversationTurns(!isAiStudio);
  const storeTurns = useStoreConversationTurns(isAiStudio);

  return isAiStudio ? storeTurns : domTurns;
}

// ─── Reader: the store (AI Studio) ───────────────────────────────────────────

/**
 * Read the conversation out of `conversation-messages-store`, plus the generation
 * currently in flight.
 *
 * Two sources, because the store is authoritative but late. `AI_STUDIO_RESPONSE` carries
 * the **whole** conversation rather than a delta, so the store needs no stitching — but it
 * is fed by `UpdatePrompt`, which is AI Studio *saving* the chat, not generating it.
 * Measured: the stream closed at t=32451 and the save landed at t=39938. The reply existed
 * for seven and a half seconds before the store heard about it, and three of those were
 * AI Studio sitting on a debounce.
 *
 * So the tail comes from `model-stream-store`, fed by an interceptor that reads
 * `GenerateContent` as it streams (see `generate-content-stream.ts` for the wire format).
 * The handover is positional, not event-ordered — see `selectLiveTail` — so there is no
 * frame in which the reply is missing from both halves, and no flicker when it moves from
 * one to the other.
 *
 * Reading the DOM for that tail was the earlier alternative and it stays rejected: aligning
 * DOM turns with store messages is not sound under virtualisation. AI Studio gives a
 * thought its own `ms-chat-turn` while the store filters thoughts out, so the two lists
 * differ by however many thoughts the conversation contains — and a *virtualised* thought
 * turn has no `ms-thought-chunk` to recognise it by, because its content isn't rendered.
 * Any index alignment would silently go off by one on exactly the conversations that
 * matter. Intercepting the request sidesteps all of it: the text is the model's own output,
 * thoughts are flagged in the payload, and `<bs_agent_tool>` blocks arrive verbatim.
 *
 * The live tail is a *pair*, because the user's message is missing from the store for
 * exactly as long as the reply is — both arrive in that one late save. So the question comes
 * off the request body (`readPendingUserText`) and appears as soon as the request goes out,
 * ~2.7s before the model's first chunk. Feeding it through `assembleTurns` unchanged is
 * deliberate: an agent turn's "user" message is a tool-results payload, and this way its
 * result cards and prompt-marker stripping work live too, with no second code path.
 */
function useStoreConversationTurns(enabled: boolean): DisplayMessageTurn[] {
  const messages = useConversationMessagesStore((s) => s.messages);
  const streamState = useModelStreamStore();
  const conversationId = useCurrentConversationId();
  const [turns, setTurns] = useState<DisplayMessageTurn[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const build = () => {
      const live = selectLiveTail(streamState, conversationId, messages);

      // Already ordered by `orderIndex` in the store.
      const raw: RawTurn[] = messages.map((m, index) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        // Only the newest model turn can be in flight, and the composer is what says so.
        // With a live tail present the newest turn is that tail, not this one — marking
        // both would put a caret on a finished turn as well as the one being written.
        isStreaming:
          !live &&
          m.role === 'model' &&
          index === messages.length - 1 &&
          getRunState() === 'stop',
      }));

      // Keyed by the stream, so React reuses these nodes for the whole generation
      // instead of remounting them, and so they cannot collide with a store id.
      if (live?.user) {
        raw.push({
          id: `live-${streamState.streamId}-user`,
          role: 'user',
          text: live.user,
          isStreaming: false,
        });
      }
      if (live?.answer) {
        raw.push({
          id: `live-${streamState.streamId}-model`,
          role: 'model',
          text: live.answer,
          isStreaming: !live.finished,
        });
      }

      const next = assembleTurns(raw);
      setTurns((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };

    build();

    // `isStreaming` comes off the Run button, which changes without the store changing —
    // so this needs a clock as well as the store subscription above.
    const interval = setInterval(build, 500);
    return () => clearInterval(interval);
  }, [enabled, messages, streamState, conversationId]);

  return turns;
}

// ─── Reader: the DOM (Gemini) ────────────────────────────────────────────────

/**
 * Extract markdown text from a conversation element (user-query or model-response).
 * Strips accessibility-only elements before conversion.
 */
function extractMarkdown(el: Element): string {
  // Find the most specific content container
  const contentEl =
    el.querySelector('.markdown, .model-response-text, .response-content') ||
    el.querySelector('.user-query-content, .query-text, .user-query-text') ||
    el;

  const clone = contentEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cdk-visually-hidden').forEach((h) => h.remove());

  return htmlToMarkdown(clone);
}

// ─── The model's own bytes, for a turn located in the DOM ────────────────────
//
// Gemini's markdown renderer eats what it renders: `\"` arrives as `"`, `*a*` as `a`, raw
// HTML tags vanish, URLs become link components. The agent engine no longer reads that
// copy (see `parse-response`) — it reads the API stream. These three functions are what
// stop the renderer from disagreeing with it.
//
// Why the disagreement is expensive, not cosmetic: `ToolCallWidget` digests the text it is
// handed into a fingerprint and compares it with the one the engine published when it
// parked for approval. Two copies of one turn give two digests, so **the approval buttons
// appear on no card at all** and the engine waits for a decision nobody was offered. The
// same digest backs `records[joinKey]`, which is how a card finds its own result.
//
// Order of preference, and it is deliberate: the live stream first, the saved message
// second, the cache in front of both. Saved-first was the original shape and it had a
// nasty timing to it — the save lands exactly when the stream closes, i.e. exactly when
// the last tool block completes, so a turn that had been reading correctly from the stream
// would switch sources at that instant. Resolving once and remembering removes the whole
// question.
//
// Returning null hands the caller back to `extractMarkdown`, which is what keeps
// conversations the extension never captured — from before it was installed, or from
// another machine — rendering as they always did.

/**
 * Verbatim text we have already resolved, keyed by exchange id, for this page life.
 *
 * The reason it is remembered rather than re-derived: the live stream only describes the
 * generation *currently* in flight, so a turn can be served from it for a few seconds and
 * then have nothing to fall back on but the damaged DOM copy. A card that was correct
 * while it mattered must not decay afterwards — its fingerprint is what the approval gate
 * and the result lookup both key on.
 *
 * Cleared on conversation change (see `useDomConversationTurns`). Not persisted: after a
 * reload nothing is mid-approval, so the DOM copy is good enough for reading.
 */
const verbatimByExchange = new Map<string, string>();

function clearVerbatimCache(): void {
  verbatimByExchange.clear();
}

function verbatimModelText(el: Element, isNewestModel: boolean): string | null {
  const exchangeId = readExchangeId(el);
  const stream = useModelStreamStore.getState();
  const live = liveStreamText(stream, exchangeId, isNewestModel);

  /**
   * A generation in flight wins over anything remembered, and is only remembered once it
   * can no longer change.
   *
   * ⚠️ Both halves of that matter. Caching a mid-stream snapshot freezes the turn at
   * whatever had arrived — observed as a whole conversation rendering as
   * `{"name": "write_file` and nothing else, because the first successful resolve happened
   * a few hundred milliseconds into the answer and was then returned for good.
   */
  if (live) {
    if (exchangeId && stream.finished) verbatimByExchange.set(exchangeId, live);
    return live;
  }

  if (exchangeId) {
    const remembered = verbatimByExchange.get(exchangeId);
    if (remembered) return remembered;
  }

  const saved = savedModelText(exchangeId);
  if (saved && exchangeId) verbatimByExchange.set(exchangeId, saved);
  return saved;
}

/**
 * The generation in flight, if it is this turn's.
 *
 * Preferred over the saved copy because it arrives first — the save lands when the stream
 * closes, and approval happens in the seconds after that.
 *
 * Identity is established by `turnId` where the platform reports one: Gemini names the
 * exchange in the stream's first frame using the same `r_…` value it stamps on the DOM, so
 * this is an equality check.
 *
 * The positional fallback is for the window before Gemini has stamped the element, and it
 * is deliberately restricted to an **unfinished** stream. An unfinished stream can only be
 * the newest turn. A finished one cannot be trusted that way: as round N+1's element
 * appears, the store still holds round N's completed answer, and "newest model turn" would
 * hand N's text to N+1 — then cache it, because it is finished.
 */
function liveStreamText(
  stream: { answer: string; turnId: string | null; finished: boolean; conversationId: string | null },
  exchangeId: string | null,
  isNewestModel: boolean,
): string | null {
  if (!stream.answer) return null;

  // Bound to the conversation on screen, so a generation left over from the previous one
  // cannot bleed in. `null` is an unbound new chat, which can only be this one.
  const onThisConversation =
    stream.conversationId === null ||
    stream.conversationId === getPlatformDomAdapter()?.extractExternalId(location.pathname);
  if (!onThisConversation) return null;

  if (stream.turnId && exchangeId) {
    return stream.turnId === exchangeId ? stream.answer : null;
  }

  return !stream.finished && isNewestModel ? stream.answer : null;
}

/** The exchange id Gemini tags a model turn with, or null. */
function readExchangeId(el: Element): string | null {
  const holder = el.querySelector('[id^="message-content-id-"]');
  return holder?.id.replace('message-content-id-', '') || null;
}

/**
 * The DB's copy of a model turn's text, found via the exchange id on its DOM node.
 *
 * A best-effort bonus rather than the load-bearing path — the live stream plus the cache
 * above already cover every turn this page generated, which is every turn that can be
 * mid-approval. This adds turns from *earlier* page lives, so their cards keep matching
 * their stored results after a reload.
 *
 * ⚠️ Not a straight lookup, because of an off-by-one in Gemini's own naming. Gemini tags
 * the `<message-content>` inside `model-response` with `message-content-id-r_X`, where
 * `r_X` is the *exchange* id — and that is the value the interceptor stores as the **user**
 * message's id (`payload[1][1]`), while the model message gets `rc_Y` (`payload[4][0][0]`).
 * So the model text for a DOM turn is the model message *following* user message `r_X`,
 * not the message with id `r_X`. `findMessageElement` leans on the same quirk from the
 * other side, which is why scrolling to a "user" node lands on the answer.
 *
 * Unverified against a conversation loaded purely from the DB, which is the other reason
 * it is not load-bearing: if the mapping is wrong here, the result is a fall back to the
 * DOM copy on old turns, not a broken approval.
 */
function savedModelText(exchangeId: string | null): string | null {
  if (!exchangeId) return null;

  const { messages } = useConversationMessagesStore.getState();
  const at = messages.findIndex((m) => m.id === exchangeId);
  if (at < 0) return null;

  // The model reply is the next model message after the exchange's user message.
  const model = messages.slice(at + 1).find((m) => m.role === 'model');
  return model?.content || null;
}

function useDomConversationTurns(enabled: boolean): DisplayMessageTurn[] {
  const [turns, setTurns] = useState<DisplayMessageTurn[]>([]);
  // Navigating between conversations must force a re-parse and re-bind
  const conversationId = useCurrentConversationId();

  const parseConversationDOM = useCallback(() => {
    const container = findConversationScroller();
    if (!container) {
      setTurns([]);
      return;
    }

    const elements = Array.from(container.querySelectorAll('user-query, model-response'));

    /**
     * Index of the newest **model** turn, which is not the same as the last element.
     *
     * ⚠️ Getting this wrong is subtle and breaks exactly one thing, badly. Stage ④ sends
     * the round's tool results as an ordinary message, so a fresh `user-query` lands in
     * the DOM moments after the model finished speaking. Keyed off "last element", the
     * model turn whose cards are on screen — and awaiting approval — stops qualifying the
     * instant that happens, its text falls back to the renderer-damaged copy, and the
     * cards it had already produced dissolve into raw JSON.
     */
    const lastModelIndex = elements.reduce(
      (found, el, i) => (el.tagName === 'MODEL-RESPONSE' ? i : found),
      -1,
    );

    const raw: RawTurn[] = elements.map((el, index) => {
      const isUser = el.tagName === 'USER-QUERY';
      // aria-busy is not used by Gemini (always null). Use the send button's "stop"
      // class instead — but only for the newest model turn (earlier ones are done).
      const isStreaming =
        !isUser &&
        index === lastModelIndex &&
        document.querySelector('gem-icon-button.send-button.stop') !== null;

      return {
        id: `${isUser ? 'user' : 'model'}-${index}`,
        role: isUser ? ('user' as const) : ('model' as const),
        text: isUser
          ? extractMarkdown(el)
          : (verbatimModelText(el, index === lastModelIndex) ?? extractMarkdown(el)),
        isStreaming,
      };
    });

    const next = assembleTurns(raw);
    setTurns((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Starting from a clean slate matters: message ids are index-based, so leftovers from
    // the previous conversation would be reused by React.
    setTurns([]);
    // Exchange ids are per-conversation, so a stale entry could only ever mislead.
    clearVerbatimCache();

    let observed: HTMLElement | null = null;
    const observer = new MutationObserver(() => parseConversationDOM());

    /**
     * (Re)bind to the current scroll container.
     *
     * Gemini swaps this element out on SPA navigation. The observer used to be bound once
     * on mount, so after switching conversations it was watching a detached node — no more
     * mutations arrived and the overlay kept showing the previous conversation forever.
     */
    const bind = () => {
      const next = findConversationScroller();
      if (next === observed) return;

      observed = next;
      observer.disconnect();
      if (next) {
        observer.observe(next, { childList: true, subtree: true, characterData: true });
      }
      parseConversationDOM();
    };

    bind();
    const interval = setInterval(bind, 1000);

    /**
     * Re-parse when the verbatim sources move, not only when the DOM does.
     *
     * `verbatimModelText` reads both stores, and neither one mutates the document — the
     * save landing is a store merge, and stream progress is a store write. Without these
     * the turn would keep whatever text it had at the last DOM mutation, so a card would
     * sit on the renderer-damaged copy until Gemini happened to touch the subtree again.
     *
     * Throttled because a full re-parse is not cheap and the stream is not slow: it ticks
     * up to ten times a second, and each pass walks every turn in the conversation and
     * converts it to markdown. The DOM observer is left unthrottled — it fires on real
     * structural change, which is the signal we least want to delay.
     */
    const reparse = throttle(parseConversationDOM, 250, { leading: true, trailing: true });
    const unsubscribeSaved = useConversationMessagesStore.subscribe(reparse);
    const unsubscribeStream = useModelStreamStore.subscribe(reparse);

    return () => {
      clearInterval(interval);
      observer.disconnect();
      unsubscribeSaved();
      unsubscribeStream();
      reparse.cancel();
    };
  }, [enabled, conversationId, parseConversationDOM]);

  return turns;
}
