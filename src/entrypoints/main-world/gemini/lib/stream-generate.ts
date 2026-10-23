/**
 * Reader for Gemini's `StreamGenerate` generation endpoint.
 *
 * History, so the next change is less of a surprise:
 *   - ≤ 2026-10-14   StreamGenerate over XHR
 *   - 2026-10-15     replaced by WebChannel `processSession` (`lib/process-session.ts`)
 *   - 2026-10-20     back to StreamGenerate, now sent via **fetch**
 *                    (`boq_gemini-web-uiserver_20261020.01_p0`)
 * Both readers are kept and both transports are tapped; whichever Gemini serves wins.
 *
 * ## Request
 *
 * Form body `f.req=<json>&at=<token>`, `f.req = [null, "<inner json>"]`:
 * ```
 * inner[0][0]   the prompt
 * inner[2]      [c_<conversationId>, r_…?, rc_…?, …] — absent/empty for a new chat.
 *               rc_ names the reply being regenerated, when there is one.
 *               Moved to inner[71] in 20261021 (inner[2] null there).
 * inner[19]     "notebooks/<uuid>" inside a notebook
 * ```
 *
 * ## Response
 *
 * XSSI prefix, then `<byte length>\n[["wrb.fr",null,"<inner json>"]]` repeated:
 * ```
 * inner[1][0]          "c_<conversationId>"
 * inner[1][1]          "r_<userMessageId>"
 * inner[4][0][0]       "rc_<modelMessageId>"
 * inner[4][0][1]       answer segments — a full snapshot, replace don't append
 * inner[10][0]         title (new chats), or inner[2][11][0] in some builds
 * ```
 *
 * Frames are found by bracket depth, not the length markers (bytes vs UTF-16), and the
 * scan is resumable so it can be fed on every progress tick in linear total time.
 */

export interface StreamGenerateRequest {
  prompt: string;
  /** Conversation the request continues, without `c_`; '' for a new chat. */
  conversationId: string;
  /** `rc_` of the reply this request replaces (regenerate/edit), or null. */
  previousModelResponseId: string | null;
  notebookId: string | null;
}

const isConversationContext = (v: unknown): v is unknown[] =>
  Array.isArray(v) && typeof v[0] === 'string' && v[0].startsWith('c_');

/**
 * `[c_<id>, r_…?, rc_…?, …]`. It sat at inner[2] up to the 20261020 build and moved
 * to inner[71] in 20261021 (inner[2] is now null). Known slots first, then any
 * top-level array shaped like it, so the next move doesn't silently turn every turn
 * into a "new chat".
 */
function findConversationContext(inner: unknown[]): unknown[] | null {
  for (const v of [inner[2], inner[71]]) if (isConversationContext(v)) return v;
  return (inner.find(isConversationContext) as unknown[] | undefined) ?? null;
}

/** Reads the `f.req` body. Never throws; fields it cannot find stay empty. */
export function parseStreamGenerateRequest(body: unknown): StreamGenerateRequest {
  const out: StreamGenerateRequest = {
    prompt: '',
    conversationId: '',
    previousModelResponseId: null,
    notebookId: null,
  };
  if (typeof body !== 'string' || !body.includes('f.req=')) return out;
  try {
    const outer = JSON.parse(new URLSearchParams(body).get('f.req') || '');
    const inner = typeof outer?.[1] === 'string' ? JSON.parse(outer[1]) : null;
    if (!Array.isArray(inner)) return out;

    if (typeof inner[0]?.[0] === 'string') out.prompt = inner[0][0];

    const ctx = findConversationContext(inner);
    if (ctx) {
      out.conversationId = (ctx[0] as string).replace(/^c_/, '');
      if (typeof ctx[2] === 'string' && ctx[2].startsWith('rc_')) out.previousModelResponseId = ctx[2];
    }

    const nb =
      typeof inner[19] === 'string' && inner[19].startsWith('notebooks/')
        ? inner[19]
        : inner.find((v) => typeof v === 'string' && v.startsWith('notebooks/'));
    if (typeof nb === 'string') out.notebookId = nb.slice('notebooks/'.length);
  } catch {
    // Malformed body: return what we have.
  }
  return out;
}

export interface StreamGenerateState {
  answer: string;
  /** Without `c_`. */
  conversationId: string;
  /** `r_…`, prefix kept — the form Gemini writes into the DOM. */
  turnId: string;
  /** `rc_…`. */
  modelMessageId: string;
  title: string;
}

/** Joined so a reply split across segments is never read as a clean prefix. */
function readCandidateText(segments: unknown): string {
  if (typeof segments === 'string') return segments;
  if (!Array.isArray(segments)) return '';
  return segments.filter((s): s is string => typeof s === 'string').join('');
}

export class StreamGenerateReader {
  private scanPos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private frameStart = -1;
  /** Guards against a shrink (e.g. an aborted XHR resetting responseText). */
  private seenLength = 0;

  readonly state: StreamGenerateState = {
    answer: '',
    conversationId: '',
    turnId: '',
    modelMessageId: '',
    title: '',
  };

  /** Feed the full text received so far. Safe to call repeatedly with the same text. */
  push(text: string): StreamGenerateState {
    if (text.length < this.seenLength) return this.state;
    this.seenLength = text.length;

    let i = this.scanPos;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') this.inString = false;
        continue;
      }
      if (ch === '"') {
        this.inString = true;
      } else if (ch === '[') {
        // The XSSI prefix `)]}'` holds a `]`, harmless because depth 0 ignores it.
        if (this.depth === 0) this.frameStart = i;
        this.depth++;
      } else if (ch === ']') {
        if (this.depth === 0) continue;
        this.depth--;
        if (this.depth === 0 && this.frameStart !== -1) {
          this.readFrame(text.slice(this.frameStart, i + 1));
          this.frameStart = -1;
        }
      }
    }
    this.scanPos = i;
    return this.state;
  }

  private readFrame(raw: string): void {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(frame)) return;

    for (const row of frame) {
      if (!Array.isArray(row) || row[0] !== 'wrb.fr' || typeof row[2] !== 'string') continue;
      let inner: any;
      try {
        inner = JSON.parse(row[2]);
      } catch {
        continue;
      }

      const conv = inner?.[1]?.[0];
      if (typeof conv === 'string' && conv) this.state.conversationId = conv.replace(/^c_/, '');
      const turn = inner?.[1]?.[1];
      if (typeof turn === 'string' && turn) this.state.turnId = turn;

      const candidate = inner?.[4]?.[0];
      if (typeof candidate?.[0] === 'string' && candidate[0]) this.state.modelMessageId = candidate[0];
      // Snapshot semantics: replace; skip empty so a metadata frame cannot blank it.
      const text = readCandidateText(candidate?.[1]);
      if (text) this.state.answer = text;

      const title = inner?.[10]?.[0] ?? inner?.[2]?.[11]?.[0];
      if (typeof title === 'string' && title) this.state.title = title;
    }
  }
}
