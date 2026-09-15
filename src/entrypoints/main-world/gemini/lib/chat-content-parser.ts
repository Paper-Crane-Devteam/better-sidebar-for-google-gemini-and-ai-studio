/**
 * Gemini chat-content (`hNvQHb`) payload parsing.
 *
 * Lives apart from the interceptor because two callers need it and only one of
 * them is an interception: the XHR the page makes when you open a conversation,
 * and the background backfill that asks for conversations nobody opened. The
 * backfill goes through `fetch`, which ajax-hook does not proxy, so it has to
 * parse the same bytes itself rather than piggy-backing on the interceptor.
 *
 * Response payload shape:
 *   [ entries, nextPageToken | null, …, [] ]
 *
 * `entries` is newest-first, one element per turn (a user message and the model
 * reply that answered it).
 */

export interface ChatContentMessage {
  role: 'user' | 'model';
  id: string;
  conversation_id: string;
  content: string;
  message_type: 'text';
  created_at: number | null;
}

/**
 * A parsed message that still carries its ordering key.
 *
 * Kept separate from `ChatContentMessage` so the key cannot leak into a DB write
 * or across a `CustomEvent` boundary: it is scratch data, and callers strip it
 * with `sortChatMessages` once they hold every page they intend to sort.
 */
export interface SortableChatContentMessage extends ChatContentMessage {
  _sortMs: number;
}

/**
 * Turn one page of `entries` into messages, in whatever order they arrived.
 *
 * Unsorted on purpose: a paginated read spans several pages, and sorting each
 * page in isolation would leave the pages themselves out of order. Callers sort
 * once, at the end, with `sortChatMessages`.
 */
export function parseChatContentEntries(
  entries: unknown,
): SortableChatContentMessage[] {
  const out: SortableChatContentMessage[] = [];
  if (!Array.isArray(entries)) return out;

  for (const entry of entries as any[]) {
    try {
      // user: entry[2][0][0]
      // model: entry[3][0][0][1][0]
      // timestamp: entry[4] -> [seconds, nanos]
      const conversationId = entry?.[0]?.[0]?.replace(/^c_/, '');
      const userContentId = entry?.[0]?.[1];
      const modelContentId = entry?.[3]?.[3];
      const userContent = entry?.[2]?.[0]?.[0];
      const modelContent = entry?.[3]?.[0]?.[0]?.[1]?.[0];

      // entry[4] is a protobuf Timestamp: [seconds, nanos].
      //
      // Both halves matter. Gemini returns entries newest-first, and seconds
      // alone cannot separate a question from its answer, so ordering on seconds
      // left same-second pairs in reverse — visible as scrambled order_index
      // once they reached the DB. The nanos resolve it, but only for sorting:
      // `created_at` stays in seconds because `messages.timestamp` is seconds
      // everywhere else, and conversations.created_at is derived from MIN() over it.
      const timestampArr = entry?.[4];

      let timestamp: number | null = null;
      // Undated entries sort last rather than to the epoch, so a single missing
      // timestamp cannot drag an entry to the top.
      let sortMs = Number.MAX_SAFE_INTEGER;
      if (Array.isArray(timestampArr) && typeof timestampArr[0] === 'number') {
        timestamp = timestampArr[0];
        const nanos = typeof timestampArr[1] === 'number' ? timestampArr[1] : 0;
        sortMs = timestamp * 1000 + nanos / 1e6;
      }

      if (userContent) {
        out.push({
          role: 'user',
          id: userContentId,
          conversation_id: conversationId,
          content: userContent,
          message_type: 'text',
          created_at: timestamp,
          _sortMs: sortMs,
        });
      }
      if (modelContent) {
        out.push({
          role: 'model',
          id: modelContentId,
          conversation_id: conversationId,
          content: modelContent,
          message_type: 'text',
          created_at: timestamp,
          _sortMs: sortMs,
        });
      }
    } catch {
      // One malformed turn must not cost us the rest of the transcript.
    }
  }

  return out;
}

/**
 * Chronological order, with the scratch ordering key removed.
 *
 * A stable sort keeps user-before-model inside one turn, since both carry the
 * turn's timestamp.
 */
export function sortChatMessages(
  messages: SortableChatContentMessage[],
): ChatContentMessage[] {
  return [...messages]
    .sort((a, b) => a._sortMs - b._sortMs)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _sortMs, ...msg }) => msg);
}

/**
 * The cursor for the next (older) page, or null when the transcript is complete.
 */
export function getNextPageToken(payload: any): string | null {
  const token = payload?.[1];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/** The `entries` array of a chat-content payload. */
export function getChatContentEntries(payload: any): unknown {
  return payload?.[0];
}
