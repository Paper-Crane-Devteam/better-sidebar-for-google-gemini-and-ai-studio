/**
 * The generation currently in flight, as it arrives — on either platform.
 *
 * Deliberately *not* part of `conversation-messages-store`. That store is the
 * conversation as the API reported it, and three other features read it —
 * SmartScrollbar, the Outline, and the DB dedup pass. A half-written turn in there
 * would show up as a flickering outline entry and a scrollbar node that moves under
 * the cursor, and the dedup pass would be comparing against text that is still
 * growing. So the live turn is kept beside that store and merged only by the agent
 * view, which is the one place it belongs.
 *
 * The authoritative transcript still arrives the way it always did. This is strictly
 * a head start — and, for the agent loop, the only lossless copy there is.
 *
 * ## Why the loop reads this and not the DOM
 *
 * Both platforms run the model's text through a CommonMark renderer before it reaches
 * the document, and a renderer consumes its own syntax. Measured on a live capture:
 * `\"` arrives as `"` (backslash escapes of ASCII punctuation are eaten), `\\` as `\`,
 * `*a*` as `a`, and on Gemini raw HTML tags are dropped outright and URLs are replaced
 * with link components. A `write_file` whose content is itself JSON therefore fails
 * `JSON.parse` — 11 of 15 calls in one real session — and the ones that *do* parse can
 * still be silently corrupted: a `tailwind.config.js` lost the asterisk closing its
 * block comment and was written to disk that way.
 *
 * The bytes in here have been through none of that: verified byte-identical to the
 * model's output on both platforms.
 */

import { create } from 'zustand';

export interface ModelStreamState {
  /** Identifies the generation, so a new run replaces rather than appends. */
  streamId: string | null;
  /**
   * Which conversation this belongs to, or null for "not bound yet".
   *
   * Null is the new-chat case and it has to be allowed: the first message of a new
   * chat is sent before the platform navigates to the real id, and it only does so
   * part-way through the generation. Rejecting the unbound events would blank the
   * agent view for exactly the turn a user is most likely to be watching. Same
   * "adopt the id when it arrives" rule the agent loop's own session binding uses —
   * see `RESERVED_CONVERSATION_SEGMENTS`.
   */
  conversationId: string | null;
  /** Reasoning so far. Not rendered today, but it is free to carry and cheap to keep. */
  thought: string;
  /** Answer so far. */
  answer: string;
  /** The message being answered, from the request body. */
  user: string;
  /** False while the model is still generating. */
  finished: boolean;
  /**
   * Which rendered turn this generation is for, in the platform's id space, or null.
   *
   * The exact answer to "does this stream belong to that turn on screen", which the DOM
   * reader needs and cannot get from position — see `ModelStreamDetail.turnId`.
   */
  turnId: string | null;

  /** Record progress for a stream, starting a new one if the id changed. */
  apply: (input: {
    streamId: string;
    conversationId: string | null;
    thought: string;
    answer: string;
    /** `null` leaves the stored question alone — see `ModelStreamDetail`. */
    user: string | null;
    finished: boolean;
    turnId: string | null;
  }) => void;

  /** Drop the live turn — on conversation change, or when a session is undone. */
  reset: () => void;
}

const EMPTY = {
  streamId: null,
  conversationId: null,
  thought: '',
  answer: '',
  user: '',
  finished: false,
  turnId: null,
};

export const useModelStreamStore = create<ModelStreamState>((set, get) => ({
  ...EMPTY,

  apply: ({ streamId, conversationId, thought, answer, user, finished, turnId }) => {
    const previous = get();
    const isNewStream = previous.streamId !== streamId;
    set({
      streamId,
      // Bind on the first id we see and keep it. Upgrading null → real is the
      // new-chat handover; never the reverse, or navigating to a route without an id
      // would unbind a live turn and let it show up in the next conversation.
      conversationId: isNewStream
        ? conversationId
        : (previous.conversationId ?? conversationId),
      thought,
      answer,
      // A new stream starts from nothing even if it says "unchanged", so a question
      // can never be inherited from the generation before it.
      user: user ?? (isNewStream ? '' : previous.user),
      finished,
      // Announced in the first frame and constant thereafter, so a later event that
      // happens not to repeat it must not blank it.
      turnId: turnId ?? (isNewStream ? null : previous.turnId),
    });
  },

  reset: () => set({ ...EMPTY }),
}));

/**
 * The live turns still worth showing, or null once the saved transcript covers them.
 *
 * Returning null is what makes the handover seamless: the live pair stays up through
 * the gap between the stream closing and the platform saving — measured at 7.5s on AI
 * Studio, three of them a debounce before the save is even sent — and disappears the
 * moment the saved turns land.
 *
 * `user` without `answer` is a normal state, not a half-built one: the question is
 * known from the request while the model is still thinking, and showing it then is
 * the whole point. `answer` without `user` is normal too, when the request body
 * could not be read.
 */
export function selectLiveTail(
  state: ModelStreamState,
  currentConversationId: string | null,
  messages: Array<{ id: string; role: 'user' | 'model'; content: string }>,
): { user: string; answer: string; finished: boolean } | null {
  if (!state.answer && !state.user) return null;
  // An unbound stream is the new chat we are currently looking at — it has nowhere
  // else it could belong. Anything already bound has to match.
  //
  // ⚠️ Note what is *not* here: a `!currentConversationId` guard. It used to be, and it
  // silently disabled this whole feature for the first turn of every new chat — the one
  // turn it exists for. AI Studio's new chat is `/prompts/new_chat`, and `new_chat` is a
  // reserved segment that resolves to null (see `RESERVED_CONVERSATION_SEGMENTS`), so
  // the live pair was dropped until AI Studio finished creating the prompt and the URL
  // picked up a real id. Measured effect: the agent view stayed blank for the whole first
  // generation, not even showing the question, then the finished reply appeared at once.
  //
  // The binding check below is the whole protection needed. The case worth defending
  // against is a generation started in conversation A while the user walks to another
  // page; there `state.conversationId` is A — non-null — so it is caught. A null
  // `state.conversationId` can only have come from a new chat, i.e. this screen.
  if (state.conversationId !== null && state.conversationId !== currentConversationId) {
    return null;
  }

  if (hasCaughtUp(state.answer, messages)) return null;

  return { user: state.user, answer: state.answer, finished: state.finished };
}

/** How much of the answer has to match for the transcript to count as caught up. */
const CATCH_UP_PREFIX = 200;

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Whether the saved transcript now contains *this* generation's reply.
 *
 * ⚠️ This used to be positional: an `anchorId` was captured when the stream opened and
 * any model message after it meant "caught up". That is wrong during an agent run, and
 * wrong in the way that hurts most.
 *
 * The transcript arrives late — measured ~7.5s after a generation ends on AI Studio,
 * three of them a debounce. So round N's turns routinely land *after* round N+1's stream
 * has already opened. They are positioned after N+1's anchor, so the positional test read
 * them as "N+1 has caught up" and dropped the live tail mid-write. Round N+1's cards then
 * could not appear until its own save landed, several seconds after the engine had already
 * asked for approval — which is exactly the "the approval prompt shows up before the tool
 * card" report.
 *
 * Identity, not position, fixes it: the tail steps aside when the transcript holds the
 * text it is showing, and no earlier turn can satisfy that.
 *
 * Compared on a whitespace-collapsed prefix rather than for equality, because the two
 * copies come from different endpoints (`GenerateContent` vs the save) and need not agree
 * on trailing whitespace. Being too strict here is the one failure mode worth avoiding:
 * the tail would never retire and the reply would render twice.
 */
function hasCaughtUp(
  answer: string,
  messages: Array<{ id: string; role: 'user' | 'model'; content?: string }>,
): boolean {
  const needle = normalise(answer).slice(0, CATCH_UP_PREFIX);
  // Nothing to match yet — the question is up but the model hasn't started.
  if (!needle) return false;

  return messages.some(
    (m) => m.role === 'model' && normalise(m.content ?? '').startsWith(needle),
  );
}

/**
 * The finished answer for a generation the caller is still owed, or null.
 *
 * What the agent loop reads. Two conditions, and both are load-bearing:
 *
 * `finished` — a mid-stream snapshot ends wherever the last chunk did, quite possibly
 * inside a `<bs_agent_tool>` block. Handing that to the parser produces an unclosed
 * block, which the engine reads as a truncated response and spends its one format
 * retry on.
 *
 * `streamId !== sinceStreamId` — the id the loop recorded *before* it sent. Without
 * this, a send that never reached the model would be answered with the previous turn's
 * text: it parses perfectly, so nothing would look wrong, and the round would re-run
 * the tools it had already run. `null` for `sinceStreamId` means "there was no
 * generation in flight when we sent", which any real stream is newer than.
 *
 * Conversation binding is deliberately *not* checked here. During an agent run on a
 * brand-new chat the stream opens unbound and the platform assigns the id part-way
 * through; requiring a match would reject the very first round. The loop already knows
 * which conversation it is driving, and the streamId gate is what establishes identity.
 */
export function selectSettledAnswer(
  state: ModelStreamState,
  sinceStreamId: string | null,
): string | null {
  if (!state.streamId) return null;
  if (state.streamId === sinceStreamId) return null;
  if (!state.finished) return null;
  if (!state.answer) return null;
  return state.answer;
}

/** The id of the generation currently in flight, for the loop to record before sending. */
export function currentStreamId(): string | null {
  return useModelStreamStore.getState().streamId;
}
