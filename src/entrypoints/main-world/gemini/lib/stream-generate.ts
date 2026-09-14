/**
 * Incremental reader for Gemini's `StreamGenerate` response.
 *
 * Counterpart to AI Studio's `generate-content-stream.ts`, and it exists for the same
 * two reasons: the agent loop needs the model's *own* text rather than what survives
 * the markdown renderer, and it needs it when the stream closes rather than whenever
 * Gemini next writes the transcript.
 *
 * ## Wire format
 *
 * Verified against a live capture. The body is an XSSI prefix followed by alternating
 * length markers and frames:
 *
 * ```
 * )]}'
 *
 * 177
 * [["wrb.fr",null,"<innerJson>"]]
 * 1580
 * [["wrb.fr",null,"<innerJson>"]]
 * ```
 *
 * and each frame's `innerJson` — itself a JSON *string* that has to be parsed a second
 * time — carries:
 *
 * ```
 * inner[1][0]        = "c_<conversationId>"
 * inner[1][1]        = "r_<userMessageId>"
 * inner[4]           = candidates
 * inner[4][0][0]     = "rc_<modelMessageId>"
 * inner[4][0][1][0]  = the answer text
 * ```
 *
 * ## ⚠️ Snapshots, not deltas
 *
 * The one substantive difference from AI Studio. Each frame carries the **whole answer
 * so far**, so the text is *replaced* rather than appended — measured 9 → 45 → 81 chars
 * over three frames for an 81-char answer. Accumulating would triple it.
 *
 * Early frames carry no candidate at all (they announce the message ids), and later
 * ones carry unrelated metadata, so "the last frame that had text" is the rule rather
 * than "the last frame".
 *
 * ## Why a scanner rather than the existing `parseStreamingResponse`
 *
 * Not because that function is wrong — it is used unchanged by the `onResponse`
 * interceptors and it reads this same body correctly. The difference is the caller. It
 * re-splits and re-parses the **entire** body every time it is called, which is fine
 * once per request and quadratic when the caller is a progress event firing every few
 * hundred milliseconds for the length of a long generation.
 *
 * This scan is resumable and never re-reads: `responseText` only ever grows at the end,
 * so absolute offsets stay valid and `scanPos` carries the machine's position across
 * calls. Total work is linear in the response.
 *
 * Frames are found by bracket depth rather than by the length markers, which are
 * ignored entirely. Two reasons: the markers count **bytes** while `responseText` is
 * UTF-16, so any CJK in the payload — and these payloads routinely carry Chinese — puts
 * offset arithmetic out of step; and depth counting does not care whether a frame
 * occupies one line or several, so it cannot be broken by a reformatting of the
 * envelope.
 */

/** Where the answer sits inside a parsed frame's inner JSON. */
const CANDIDATES = 4;
const CANDIDATE_TEXT = 1;

/** Where the conversation id sits, as `c_<id>`. */
const IDS = 1;

export interface StreamGenerateState {
  /** The answer as of the newest frame that carried one. */
  answer: string;
  /** Conversation id without its `c_` prefix, or '' before any frame announced one. */
  conversationId: string;
  /**
   * The exchange id this generation belongs to, `r_…` prefix included, or ''.
   *
   * Worth carrying because it is the *only* exact way to tell which rendered turn a
   * generation is for. Gemini stamps the same value onto the DOM as
   * `message-content-id-r_…`, so a consumer can match the two without guessing from
   * position — and position guesses go wrong precisely at round boundaries, where the
   * previous round's finished text is still in hand when the next turn's element appears.
   */
  turnId: string;
}

/** Index of the prompt inside the parsed `f.req` payload: `[[prompt], …]`. */
const REQUEST_PROMPT_PATH = [0, 0] as const;

/**
 * The message being sent, read out of the `StreamGenerate` request body.
 *
 * Needed for the same reason as on AI Studio: during a generation the user's own text
 * is no more available than the reply, so a live view fed only by the response would
 * show an answer with no question above it.
 *
 * Takes the already-parsed `f.req` inner payload rather than re-implementing
 * `parseBatchExecuteRequest`. Returns '' on anything unexpected — an answer arriving
 * without its question is cosmetic, and not worth losing the reply over.
 */
export function readPromptFromPayload(innerJson: unknown): string {
  try {
    let node: any = innerJson;
    for (const key of REQUEST_PROMPT_PATH) node = node?.[key];
    return typeof node === 'string' ? node : '';
  } catch {
    return '';
  }
}

/**
 * A candidate's answer text, joined across however many segments it arrives in.
 *
 * Every capture examined had a single segment, and the older one-shot interceptor reads
 * `[0]` on that basis. Joining instead is free in that case and is the safe reading if a
 * long answer is ever split: taking `[0]` alone would yield a clean *prefix* of the reply,
 * which is the worst possible shape of wrong — it parses as truncated rather than as
 * corrupt, so the engine would burn its format retry on a response the model wrote
 * correctly.
 *
 * Non-strings are skipped rather than coerced, so a sibling carrying metadata cannot end
 * up concatenated into the answer.
 */
function readCandidateText(segments: unknown): string {
  if (typeof segments === 'string') return segments;
  if (!Array.isArray(segments)) return '';
  return segments.filter((s): s is string => typeof s === 'string').join('');
}

export class StreamGenerateReader {
  /** How far the scanner has walked. Absolute, because the text only grows at the end. */
  private scanPos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  /** Absolute offset of the frame currently being scanned, or -1 between frames. */
  private frameStart = -1;

  private answer = '';
  private conversationId = '';
  private turnId = '';

  /**
   * Feed the current full `responseText`. Safe to call on every `readyState 3`, and
   * safe to call with text that hasn't grown since last time.
   */
  push(responseText: string): StreamGenerateState {
    let i = this.scanPos;

    for (; i < responseText.length; i++) {
      const ch = responseText[i];

      // Inside a string nothing is structural — a `]` in the model's prose must not
      // close a frame, and an escaped quote must not end the string.
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }

      if (ch === '"') {
        this.inString = true;
        continue;
      }

      if (ch === '[') {
        // At rest, a `[` is the start of a frame. This is also what makes the XSSI
        // prefix harmless: `)]}'` has a `]` in it, but at depth 0 a `]` is ignored
        // rather than counted, so the depth can never go negative and drift.
        if (this.depth === 0) this.frameStart = i;
        this.depth++;
        continue;
      }

      if (ch === ']') {
        if (this.depth === 0) continue;
        this.depth--;
        if (this.depth === 0 && this.frameStart !== -1) {
          this.readFrame(responseText.slice(this.frameStart, i + 1));
          this.frameStart = -1;
        }
      }
    }

    this.scanPos = i;
    return this.snapshot();
  }

  private snapshot(): StreamGenerateState {
    return {
      answer: this.answer,
      conversationId: this.conversationId,
      turnId: this.turnId,
    };
  }

  private readFrame(raw: string): void {
    let frame: any;
    try {
      frame = JSON.parse(raw);
    } catch {
      // A frame we can't read is skipped rather than aborting the stream: the text
      // so far is still correct and still worth showing.
      return;
    }
    if (!Array.isArray(frame)) return;

    for (const row of frame) {
      // `wrb.fr` rows carry the payload; anything else in the envelope is not ours.
      if (!Array.isArray(row) || row[0] !== 'wrb.fr') continue;
      if (typeof row[2] !== 'string') continue;

      let inner: any;
      try {
        inner = JSON.parse(row[2]);
      } catch {
        continue;
      }

      const rawId = inner?.[IDS]?.[0];
      if (typeof rawId === 'string' && rawId) {
        this.conversationId = rawId.replace(/^c_/, '');
      }

      // Kept with its `r_` prefix, because that is the form Gemini writes into the DOM.
      const rawTurnId = inner?.[IDS]?.[1];
      if (typeof rawTurnId === 'string' && rawTurnId) this.turnId = rawTurnId;

      const text = readCandidateText(inner?.[CANDIDATES]?.[0]?.[CANDIDATE_TEXT]);
      // Snapshot semantics: replace, never append. Empty is skipped rather than
      // assigned, so a trailing metadata frame cannot blank an answer already read.
      if (text) this.answer = text;
    }
  }
}
