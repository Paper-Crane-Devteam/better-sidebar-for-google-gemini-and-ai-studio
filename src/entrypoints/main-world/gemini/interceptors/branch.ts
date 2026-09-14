import { parseResponsePayloads } from '../lib/response-parser';

/**
 * Branch detection (rpcid `KDNZr`).
 *
 * Branching forks a conversation at one message into a brand new conversation.
 * Nothing else tells us it happened: no StreamGenerate, no rename, and the chat
 * list endpoint is not re-fetched, so until this interceptor existed a branch was
 * invisible to the sidebar until the user reloaded the page.
 *
 * ── Payload shape ───────────────────────────────────────────────────────────
 * Request:  ["c_<source conversation>", "r_<message branched at>"]
 * Response: payloads[0][0] is the new conversation's own list entry —
 *
 *   [0]  "c_<new conversation id>"
 *   [1]  new title (Gemini prefixes the source title with "Branch • ")
 *   [5]  [seconds, nanos] creation time, the same protobuf Timestamp shape the
 *        chat-content and list-chat endpoints use
 *   [17] lineage tuple: [<r_ id>, "c_<source conversation>", "r_<message branched
 *        at>", <source title>]
 *
 * Indices [17][1] and [17][2] echo the request, which is what makes the lineage
 * trustworthy rather than inferred. [17][0] is some message id in the new
 * conversation — most likely the copy of the branch point — but nothing here
 * depends on that reading, so it is passed through unused rather than guessed at.
 */
export function handleBranchResponse(response: any, url: string) {
  if (response.status !== 200) return;

  let responseBody = response.response;
  if (typeof responseBody !== 'string') {
    try {
      responseBody = JSON.stringify(responseBody);
    } catch {
      return;
    }
  }

  try {
    const payloads = parseResponsePayloads(responseBody);
    const entry = payloads?.[0]?.[0];

    if (!Array.isArray(entry)) {
      console.warn('Better Sidebar (Gemini): Branch response had no entry', payloads);
      return;
    }

    const rawId = entry[0];
    if (typeof rawId !== 'string' || !rawId) return;
    const id = rawId.replace(/^c_/, '');

    const title = typeof entry[1] === 'string' ? entry[1] : null;

    // Seconds only: `conversations.created_at` is unix seconds everywhere.
    const timestampArr = entry[5];
    const createdAt =
      Array.isArray(timestampArr) && typeof timestampArr[0] === 'number'
        ? timestampArr[0]
        : Math.floor(Date.now() / 1000);

    const lineage = Array.isArray(entry[17]) ? entry[17] : [];
    const rawSourceId = lineage[1];
    const sourceConversationId =
      typeof rawSourceId === 'string' ? rawSourceId.replace(/^c_/, '') : null;
    const sourceMessageId = typeof lineage[2] === 'string' ? lineage[2] : null;
    const sourceTitle = typeof lineage[3] === 'string' ? lineage[3] : null;

    console.log(
      `Better Sidebar (Gemini): Detected branch ${sourceConversationId ?? '?'} -> ${id}`,
      { title, createdAt, sourceMessageId, sourceTitle, lineage },
    );

    globalThis.dispatchEvent(
      new CustomEvent('GEMINI_CHAT_BRANCH', {
        detail: {
          id,
          title,
          createdAt,
          sourceConversationId,
          sourceMessageId,
          sourceTitle,
          originalUrl: url,
        },
      }),
    );
  } catch (e) {
    console.error('Better Sidebar (Gemini): Error handling branch response', e);
  }
}
