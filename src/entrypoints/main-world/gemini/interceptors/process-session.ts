/**
 * Captures Gemini turns sent over the WebChannel `processSession` protocol.
 *
 * Does the job `generate.ts` (DB write) and `stream-generate.ts` (live stream for the
 * agent loop) did for `StreamGenerate`, which the 2026-10 web build stopped using.
 * Wire format and field paths: `lib/process-session.ts`.
 *
 * A WebChannel session is several XHRs sharing one `gsessionid`: forward-channel POSTs
 * carrying the prompt, and one long-lived `RID=rpc` back channel carrying the reply.
 * State is kept per `gsessionid` so the two halves meet up.
 *
 * ## Known gaps against the old interceptor
 *
 * - `replaceAfterMessageId`: StreamGenerate's request named the previous `rc_` id, so
 *   regenerate/edit could prune the replaced reply. The new uplink carries only an
 *   opaque token there, so regeneration appends instead of replacing until the next
 *   full chat-content sync corrects it.
 * - Notebook id: not found in the uplink yet; notebook chats are classified by URL only.
 */

import throttle from 'lodash/throttle';
import { parseUplink, ProcessSessionReader, type ProcessSessionTurn } from '../lib/process-session';
import { MODEL_STREAM_EVENT, type ModelStreamDetail } from '@/shared/types/model-stream';
import { detectGeminiContext } from '@/shared/lib/gemini-context';
import { isGeminiTemporaryChat } from '@/shared/lib/dom-selectors';
import { trace } from '@/shared/lib/trace';

const DISPATCH_INTERVAL_MS = 100;
/**
 * How long to wait after the finish frame for the channel to close. New chats get their
 * title in a frame *after* the finish frame, and the close is what tells us nothing more
 * is coming; this only matters if a channel were ever kept open across turns.
 */
const FINALIZE_FALLBACK_MS = 8000;

interface SessionState {
  prompt: string;
  /** Conversation id the uplink named; '' means this turn creates the chat. */
  uplinkConversationId: string;
  sawOpen: boolean;
  announced: boolean;
  streamId: string;
}

const sessions = new Map<string, SessionState>();
let streamCounter = 0;

export function isProcessSessionUrl(url: string | undefined): boolean {
  return !!url && url.includes('/v1/processSession');
}

function sessionKey(url: string): string {
  try {
    return new URL(url, location.href).searchParams.get('gsessionid') || '';
  } catch {
    return '';
  }
}

function getSession(key: string): SessionState {
  let s = sessions.get(key);
  if (!s) {
    s = {
      prompt: '',
      uplinkConversationId: '',
      sawOpen: false,
      announced: false,
      streamId: `ps-${Date.now()}-${++streamCounter}`,
    };
    sessions.set(key, s);
    // Sessions are per turn; cap the map so a long-lived tab cannot grow it unbounded.
    if (sessions.size > 20) sessions.delete(sessions.keys().next().value!);
  }
  return s;
}

/** Called from `onRequest` for every `processSession` request. */
export function observeProcessSession(url: string, body: unknown, xhr: XMLHttpRequest | undefined): void {
  const key = sessionKey(url);
  // The handshake request has no gsessionid yet and carries nothing we need.
  if (!key) return;

  if (/[?&]RID=rpc(&|$)/.test(url)) {
    if (xhr) observeBackChannel(key, xhr);
    return;
  }

  const up = parseUplink(body);
  if (!up) return;
  const session = getSession(key);
  if (up.opensTurn) {
    session.sawOpen = true;
    session.uplinkConversationId = up.conversationId;
  }
  if (up.prompt) session.prompt = up.prompt;

  if (up.submits && !session.announced) {
    session.announced = true;
    globalThis.dispatchEvent(new CustomEvent('BETTER_SIDEBAR_GENERATE_START'));
    // Show the question straight away; the model takes a moment to start.
    if (session.prompt) dispatchStream(session, '', session.prompt, false, null);
  }
}

function dispatchStream(
  session: SessionState,
  answer: string,
  user: string | null,
  finished: boolean,
  turnId: string | null,
): void {
  const detail: ModelStreamDetail = {
    streamId: session.streamId,
    thought: '',
    answer,
    user,
    finished,
    turnId,
  };
  globalThis.dispatchEvent(new CustomEvent(MODEL_STREAM_EVENT, { detail }));
}

function observeBackChannel(key: string, xhr: XMLHttpRequest): void {
  // Held by reference: the prompt upload usually lands after the back channel opens,
  // and it writes into this same object.
  const session = getSession(key);
  const reader = new ProcessSessionReader();
  const finalized = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let lastAnswer = '';
  let closed = false;

  const progress = throttle(
    (turn: ProcessSessionTurn) => dispatchStream(session, turn.answer, null, false, turn.turnId),
    DISPATCH_INTERVAL_MS,
    { leading: true, trailing: true },
  );

  const finalize = (turn: ProcessSessionTurn) => {
    if (finalized.has(turn.turnId)) return;
    finalized.add(turn.turnId);
    const timer = timers.get(turn.turnId);
    if (timer) clearTimeout(timer);
    progress.cancel();

    dispatchStream(session, turn.answer, turn.answer ? session.prompt : '', true, turn.turnId);
    if (turn.answer && turn.conversationId) persistTurn(session, turn);
  };

  const read = () => {
    let text: string;
    try {
      if (xhr.responseType && xhr.responseType !== 'text') return;
      text = xhr.responseText;
    } catch {
      return;
    }
    if (!text || !reader.push(text)) return;

    const turn = reader.current;
    if (!turn || finalized.has(turn.turnId)) return;
    if (turn.answer && turn.answer !== lastAnswer) {
      lastAnswer = turn.answer;
      progress(turn);
    }
    if (turn.done && !timers.has(turn.turnId)) {
      timers.set(turn.turnId, setTimeout(() => finalize(turn), FINALIZE_FALLBACK_MS));
    }
  };

  const close = () => {
    if (closed) return;
    closed = true;
    read();
    for (const turn of reader.turns.values()) {
      if (turn.done || turn.answer) finalize(turn);
    }
    // A back channel that closes empty is not treated as a failed turn: WebChannel may
    // recycle the back channel and carry the reply on its replacement.
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

function persistTurn(session: SessionState, turn: ProcessSessionTurn): void {
  const timestamp = Math.floor(Date.now() / 1000);
  const { conversationId } = turn;

  const messages: Record<string, unknown>[] = [];
  if (session.prompt) {
    messages.push({
      role: 'user',
      id: turn.turnId || crypto.randomUUID(),
      conversation_id: conversationId,
      content: session.prompt,
      message_type: 'text',
      created_at: timestamp,
    });
  }
  messages.push({
    role: 'model',
    id: turn.modelMessageId || crypto.randomUUID(),
    conversation_id: conversationId,
    content: turn.answer,
    message_type: 'text',
    created_at: timestamp,
  });

  // A new chat is one whose uplink named no conversation. Its title normally arrives
  // after the finish frame; if it somehow does not, the prompt stands in until the
  // next chat-list sync replaces it.
  const isNewChat = session.sawOpen && !session.uplinkConversationId;
  const title = turn.title || (isNewChat ? session.prompt.slice(0, 80) : '');

  console.log('Better Sidebar (Gemini): Captured turn', {
    conversationId,
    userMessageId: turn.turnId,
    modelMessageId: turn.modelMessageId,
    promptChars: session.prompt.length,
    replyChars: turn.answer.length,
    via: 'processSession',
    ...(isNewChat ? { newChat: true, title } : {}),
  });

  if (title) {
    const ctx = detectGeminiContext(globalThis.location?.pathname || '', null);
    const isTemporary = isGeminiTemporaryChat();
    globalThis.dispatchEvent(
      new CustomEvent('BETTER_SIDEBAR_PROMPT_CREATE', {
        detail: {
          id: conversationId,
          title,
          messages,
          created_at: timestamp,
          type: ctx.type,
          gem_id: ctx.gemId ?? undefined,
          notebook_id: ctx.notebookId ?? undefined,
          is_temporary: isTemporary,
        },
      }),
    );
  } else {
    globalThis.dispatchEvent(
      new CustomEvent('GEMINI_CHAT_CONTENT_RESPONSE', {
        detail: { conversationId, messages },
      }),
    );
  }
  trace('Better Sidebar (Gemini): processSession turn', turn);
}
