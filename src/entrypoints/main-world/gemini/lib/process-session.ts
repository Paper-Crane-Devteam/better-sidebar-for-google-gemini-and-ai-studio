/**
 * Reader for Gemini's WebChannel generation protocol (`geminiweb-pa…/v1/processSession`).
 *
 * Replaced `StreamGenerate` in the 2026-10 web build (`boq_gemini-web-uiserver_20261015`).
 * Same information, entirely different transport: a goog WebChannel session per turn,
 * protobuf payloads in base64, no JSON arrays to index into.
 *
 * ## Uplink (POST, form body)
 *
 * `count=N&ofs=K&req0___data__=<b64>&req1___data__=…` — one protobuf per `reqI`.
 *
 * ```
 * .1                    session open — sent when the input is focused, *before* typing
 * .1.8.5.1.72.1         "c_<conversationId>"   — ABSENT for a brand-new chat
 * .2.9.1                the user's message (may share an upload with .1)
 * .4                    half-close — after the reply, or ~60s later if nothing was sent
 * ```
 *
 * ## Downlink (`RID=rpc`, long-lived GET)
 *
 * `<len>\n[[seq,["<b64>"]],…]` repeated. `len` counts bytes, so frames are found by
 * bracket depth instead (same reasoning as `stream-generate.ts`). Each b64 payload:
 *
 * ```
 * .2.7.1.1              1 on the frame where the reply finished
 * .2.7.1.2.1            "r_<userMessageId>"   (a uuid on the very first frame)
 * .2.7.1.4.4.2.1        "c_<conversationId>"
 * .2.7.1.4.4.5.1        "rc_<modelMessageId>"
 * .2.7.1.4.4.5.2.1      reply text — a full snapshot, replace don't append
 * .2.7.1.4.4.11.1       title — new chats only, in a frame *after* the finish frame
 * ```
 *
 * ## ⚠️ The XHR is aborted when the stream ends
 *
 * WebChannel calls `abort()` on the back channel once the turn is done, which resets
 * `responseText` to ''. The reader therefore never re-reads: it consumes text as it
 * grows and keeps its own state, so the abort costs nothing.
 */

import {
  base64ToBytes,
  decodeFields,
  getJoinedString,
  getMessage,
  getNumber,
  getString,
} from './protobuf';

const PATH_UP_CONVERSATION = [1, 8, 5, 1, 72, 1] as const;
const PATH_UP_PROMPT = [2, 9, 1] as const;

const PATH_TURN = [2, 7, 1] as const;
const PATH_TURN_DONE = [1] as const;
const PATH_TURN_ID = [2, 1] as const;
const PATH_CONTENT = [4, 4] as const;
const PATH_CONVERSATION = [2, 1] as const;
const PATH_MODEL_ID = [5, 1] as const;
const PATH_ANSWER = [5, 2, 1] as const;
const PATH_TITLE = [11, 1] as const;

export interface UplinkInfo {
  /** True when this upload opens a turn (carries field 1). */
  opensTurn: boolean;
  /** Conversation id without `c_`, '' when absent (new chat) or not in this upload. */
  conversationId: string;
  /** The user's message, '' when not in this upload. */
  prompt: string;
  /** True when this upload half-closes the session (field 4). Not a send signal. */
  submits: boolean;
}

/** Reads every `reqN___data__` in a WebChannel forward-channel body. */
export function parseUplink(body: unknown): UplinkInfo | null {
  if (typeof body !== 'string' || !body.includes('___data__')) return null;

  const info: UplinkInfo = { opensTurn: false, conversationId: '', prompt: '', submits: false };
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(body);
  } catch {
    return null;
  }

  for (const [key, value] of params) {
    if (!/^req\d+___data__$/.test(key)) continue;
    // URLSearchParams turns a raw '+' into a space; base64 never contains spaces.
    const bytes = base64ToBytes(value.replace(/ /g, '+'));
    if (!bytes) continue;
    const fields = decodeFields(bytes);
    if (!fields) continue;

    for (const f of fields) {
      if (f.field === 1) info.opensTurn = true;
      if (f.field === 4) info.submits = true;
    }
    const conv = getString(bytes, PATH_UP_CONVERSATION);
    if (conv) info.conversationId = conv.replace(/^c_/, '');
    const prompt = getString(bytes, PATH_UP_PROMPT);
    if (prompt) info.prompt = prompt;
  }
  return info;
}

export interface ProcessSessionTurn {
  /** `r_…`, prefix kept — the form Gemini writes into the DOM. */
  turnId: string;
  /** Without `c_`. */
  conversationId: string;
  /** `rc_…`. */
  modelMessageId: string;
  answer: string;
  title: string;
  /** The finish frame has been seen. */
  done: boolean;
}

/**
 * Resumable scanner over the back channel's `responseText`. One instance per XHR.
 * Turns are keyed by `r_` id so a channel carrying more than one turn stays correct.
 */
export class ProcessSessionReader {
  private scanPos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private frameStart = -1;
  /** Text consumed so far, so a shrink (abort → '') is recognised and ignored. */
  private seenLength = 0;

  readonly turns = new Map<string, ProcessSessionTurn>();
  /** The most recently touched turn. */
  current: ProcessSessionTurn | null = null;

  /** Feed the full current `responseText`. Returns true when anything changed. */
  push(text: string): boolean {
    // Aborted: responseText was reset. Everything we need is already in state.
    if (text.length < this.seenLength) return false;
    this.seenLength = text.length;

    let changed = false;
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
        if (this.depth === 0) this.frameStart = i;
        this.depth++;
      } else if (ch === ']') {
        if (this.depth === 0) continue;
        this.depth--;
        if (this.depth === 0 && this.frameStart !== -1) {
          if (this.readFrame(text.slice(this.frameStart, i + 1))) changed = true;
          this.frameStart = -1;
        }
      }
    }
    this.scanPos = i;
    return changed;
  }

  private readFrame(raw: string): boolean {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!Array.isArray(frame)) return false;

    let changed = false;
    for (const row of frame) {
      // [seq, ["<b64>"]] — control rows carry "noop", "c", etc. and are skipped.
      const payload = Array.isArray(row) && Array.isArray(row[1]) ? row[1][0] : undefined;
      if (typeof payload !== 'string' || payload.length < 8) continue;
      const bytes = base64ToBytes(payload);
      if (!bytes || !decodeFields(bytes)) continue;
      if (this.readPayload(bytes)) changed = true;
    }
    return changed;
  }

  private readPayload(bytes: Uint8Array): boolean {
    const turnMsg = getMessage(bytes, PATH_TURN);
    if (!turnMsg) return false;

    const turnId = getString(turnMsg, PATH_TURN_ID);
    // The first frame names the turn with a client uuid; only `r_` ids are real.
    if (!turnId.startsWith('r_')) return false;

    let turn = this.turns.get(turnId);
    if (!turn) {
      turn = { turnId, conversationId: '', modelMessageId: '', answer: '', title: '', done: false };
      this.turns.set(turnId, turn);
    }
    this.current = turn;

    const before = `${turn.conversationId}|${turn.modelMessageId}|${turn.answer.length}|${turn.title}|${turn.done}`;

    if (getNumber(turnMsg, PATH_TURN_DONE) === 1) turn.done = true;

    const content = getMessage(turnMsg, PATH_CONTENT);
    if (content) {
      const conv = getString(content, PATH_CONVERSATION);
      if (conv) turn.conversationId = conv.replace(/^c_/, '');
      const rc = getString(content, PATH_MODEL_ID);
      if (rc) turn.modelMessageId = rc;
      // Snapshot semantics: replace; skip empty so a metadata frame cannot blank it.
      const answer = getJoinedString(content, PATH_ANSWER);
      if (answer) turn.answer = answer;
      const title = getString(content, PATH_TITLE);
      if (title) turn.title = title;
    }

    const after = `${turn.conversationId}|${turn.modelMessageId}|${turn.answer.length}|${turn.title}|${turn.done}`;
    return before !== after;
  }
}
