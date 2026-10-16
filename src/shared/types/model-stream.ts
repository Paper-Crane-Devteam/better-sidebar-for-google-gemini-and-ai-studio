/**
 * The contract for `MODEL_STREAM`, shared by the sides that never import each other:
 * the main-world interceptors that dispatch it and the overlay hook that listens
 * (`shared/hooks/useModelStream.ts`).
 *
 * Dispatched by:
 * - `main-world/aistudio/interceptors/generate-content.ts` (AI Studio `GenerateContent`)
 * - `main-world/gemini/interceptors/process-session.ts` (Gemini `processSession`)
 *
 * ## Why one contract for two platforms
 *
 * The two wire formats have nothing in common — AI Studio streams a nested JSON array
 * of **deltas**, Gemini streams WebChannel protobuf frames each carrying a **full
 * snapshot**. Both differences are absorbed by the platform reader, so what crosses
 * the world boundary is the same three strings either way.
 *
 * That matters beyond tidiness: `buildToolCallKey` is a digest of a call's params, and
 * it is computed independently by the engine and by the card that renders it. Those two
 * agree only if both read the *same bytes*. One source per platform, shared by both
 * consumers, is what makes the digest sound — see `renderer/helpers/tool-outcomes.ts`.
 *
 * Its own module so neither bundle has to pull in the other. Types and one string,
 * nothing with a runtime cost.
 */

/** Fired repeatedly while the model generates, then once more when it stops. */
export const MODEL_STREAM_EVENT = 'BETTER_SIDEBAR_MODEL_STREAM';

export interface ModelStreamDetail {
  /**
   * Identifies this generation, so a consumer can tell a fresh run from the one it
   * is already showing without diffing text.
   *
   * Also how the agent loop proves freshness: it records the id in flight when it
   * sends, and refuses any answer still carrying an older one. Without that, a send
   * that never reached the model would be answered with the *previous* turn's text,
   * which parses perfectly and re-runs the previous round's tools.
   */
  streamId: string;
  /**
   * Reasoning so far. Accumulated rather than a delta — a consumer that misses an
   * event to throttling or a slow render still ends up with the right text.
   *
   * Always '' on Gemini: its stream carries no separate thought channel that we have
   * found. Absence is not worth a platform flag — nothing reads this yet.
   */
  thought: string;
  /** Answer so far, accumulated for the same reason. */
  answer: string;
  /**
   * The message this generation is answering, read off the request — or `null`
   * meaning "unchanged, keep what you have".
   *
   * Carried alongside the reply because the question is no more available than the
   * answer until the platform saves the chat, and rendering a reply with nothing above
   * it looks like a bug.
   *
   * `null` on the events in between is not premature optimisation: during an agent
   * run this string is the assembled prompt or a tool-results payload — tens of
   * kilobytes — and every event is structured-cloned across the world boundary. It
   * is sent when the stream opens and again when it closes, and those are the only
   * two moments it can differ.
   */
  user: string | null;
  /** True on the final event for this stream. */
  finished: boolean;
  /**
   * Which rendered turn this generation belongs to, in the platform's own id space, or
   * null when the platform does not say.
   *
   * On Gemini this is the `r_…` exchange id, which is also what it stamps onto the DOM as
   * `message-content-id-r_…`. That makes "is this stream this turn's?" an equality check
   * rather than a guess from position — and position is wrong exactly at a round boundary,
   * where the finished text of round N is still in hand as round N+1's element appears.
   *
   * Null on AI Studio, whose renderer reads the transcript store and never needs to line a
   * stream up against a DOM node.
   */
  turnId: string | null;
}
