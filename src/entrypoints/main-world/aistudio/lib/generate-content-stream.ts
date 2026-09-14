/**
 * Incremental reader for AI Studio's `GenerateContent` response.
 *
 * Why this exists: every other AI Studio response we care about is read in
 * `onResponse`, which fires at `readyState 4`. `GenerateContent` is the one that
 * streams, and reading it only when it closes is what made the agent view lag —
 * the transcript it renders arrived from `UpdatePrompt` instead, which AI Studio
 * fires ~3s *after* generation ends (measured: stream closed at t=32451, the save
 * landed at t=39938). So the model's reply showed up seven-odd seconds late.
 *
 * ## Wire format
 *
 * The body is one JSON array wrapped in another, with the chunks as its elements:
 *
 * ```
 * [[ chunk, chunk, …, trailer ]]
 * ```
 *
 * and each chunk carries a partial turn:
 *
 * ```
 * chunk[0][0]      = [turn, finishReason]   // finishReason 1 = STOP, absent while running
 * chunk[0][0][0]   = turn = [parts, role]
 * turn[0]          = parts
 * part[1]          = the text delta
 * part[12] === 1   = this part is a thought, not the answer
 * part[13]         = opaque signature blob, ignored
 * trailer          = has no chunk[0]; carries request ids we don't use
 * ```
 *
 * Text arrives as **deltas** that concatenate — thoughts into one run, the answer
 * into another. Verified against a live capture: 48 chunks reconstructing 2291
 * chars of thought and 1554 of answer, matching what the page rendered.
 *
 * ## Why a scanner rather than `JSON.parse`
 *
 * A mid-stream `responseText` is a *truncated* document — the outer arrays are
 * still open, and the cut can land inside a chunk or inside a string. Parsing it
 * throws (confirmed). So this walks the text tracking bracket depth and string
 * state, and hands each chunk to `JSON.parse` only once it has closed.
 *
 * The scan is resumable and never re-reads: `responseText` only ever grows at the
 * end, so absolute offsets stay valid and `scanPos` carries the machine's position
 * across calls. Total work is linear in the response, not quadratic in the chunks.
 */

/** Depth at which a chunk sits: `[` outer, `[` chunk-list, `[` chunk. */
const CHUNK_DEPTH = 3;

/** `finishReason` value meaning the model stopped normally. */
const FINISH_REASON_STOP = 1;

/** Index of a part's text inside the part array. */
const PART_TEXT = 1;

/** Index of the flag marking a part as reasoning rather than answer. */
const PART_IS_THOUGHT = 12;

export interface GenerateContentStreamState {
  /** Reasoning so far, concatenated. Empty when the model isn't showing its work. */
  thought: string;
  /** Answer text so far, concatenated. */
  answer: string;
  /** True once a chunk reported `finishReason`. */
  finished: boolean;
}

/** Index of the turn list inside the request body: `[model, turns, …]`. */
const REQUEST_TURNS = 1;

/** Index of a turn's role, alongside `turn[0]` holding its parts. */
const TURN_ROLE = 1;

/**
 * The message being sent, read out of the `GenerateContent` request body.
 *
 * Needed because the user's own text is no more available than the reply during a
 * generation — it reaches `conversation-messages-store` in the same late save. So a
 * live view fed only by the response would show an answer with no question above it.
 *
 * The request turns out to use the same layout as the response — `[parts, role]` with
 * the text at `part[1]` and thoughts flagged at `part[12]` — just rooted at `body[1]`
 * and holding the whole conversation. The new message is the last turn.
 *
 * Returns '' rather than throwing on anything unexpected: an answer arriving without
 * its question is a cosmetic problem, and not worth losing the reply over.
 */
export function readPendingUserText(requestBody: unknown): string {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const turns = (body as any)?.[REQUEST_TURNS];
    if (!Array.isArray(turns)) return '';

    // Last user turn, not merely the last turn: keeps working if a trailing entry
    // is ever appended for something other than the message being answered.
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      if (!Array.isArray(turn) || turn[TURN_ROLE] !== 'user') continue;

      const parts = turn[0];
      if (!Array.isArray(parts)) return '';

      let text = '';
      for (const part of parts) {
        if (!Array.isArray(part)) continue;
        if (part[PART_IS_THOUGHT] === 1) continue;
        const value = part[PART_TEXT];
        if (typeof value === 'string') text += value;
      }
      return text;
    }
  } catch {
    // fall through
  }
  return '';
}

export class GenerateContentStreamReader {
  /** How far the scanner has walked. Absolute, because the text only grows at the end. */
  private scanPos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  /** Absolute offset of the chunk currently being scanned, or -1 between chunks. */
  private chunkStart = -1;
  private begun = false;

  private thought = '';
  private answer = '';
  private finished = false;

  /**
   * Feed the current full `responseText`. Safe to call on every `readyState 3`,
   * and safe to call with text that hasn't grown since last time.
   */
  push(responseText: string): GenerateContentStreamState {
    let i = this.scanPos;

    // Find the opening bracket once. An XSSI prefix such as `)]}'` contains a `]`
    // that would put the depth count permanently out of step, and AI Studio has
    // been seen serving these responses both with and without a prefix.
    if (!this.begun) {
      const start = responseText.indexOf('[');
      if (start === -1) {
        this.scanPos = responseText.length;
        return this.snapshot();
      }
      this.begun = true;
      i = start;
    }

    for (; i < responseText.length; i++) {
      const ch = responseText[i];

      // Inside a string nothing is structural — a `]` in the model's prose must
      // not close a chunk, and an escaped quote must not end the string.
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }

      if (ch === '"') {
        this.inString = true;
      } else if (ch === '[') {
        this.depth++;
        if (this.depth === CHUNK_DEPTH) this.chunkStart = i;
      } else if (ch === ']') {
        this.depth--;
        if (this.depth === CHUNK_DEPTH - 1 && this.chunkStart !== -1) {
          this.readChunk(responseText.slice(this.chunkStart, i + 1));
          this.chunkStart = -1;
        }
      }
    }

    this.scanPos = i;
    return this.snapshot();
  }

  private snapshot(): GenerateContentStreamState {
    return { thought: this.thought, answer: this.answer, finished: this.finished };
  }

  private readChunk(raw: string): void {
    let chunk: any;
    try {
      chunk = JSON.parse(raw);
    } catch {
      // A chunk we can't read is skipped rather than aborting the stream: the
      // accumulated text so far is still correct and still worth showing.
      return;
    }

    // The trailer has no candidate. Nothing to add, and not an error.
    const candidate = chunk?.[0]?.[0];
    if (!Array.isArray(candidate)) return;

    if (candidate[1] === FINISH_REASON_STOP) this.finished = true;

    const parts = candidate[0]?.[0];
    if (!Array.isArray(parts)) return;

    for (const part of parts) {
      if (!Array.isArray(part)) continue;
      const text = part[PART_TEXT];
      if (typeof text !== 'string' || text === '') continue;
      if (part[PART_IS_THOUGHT] === 1) this.thought += text;
      else this.answer += text;
    }
  }
}
