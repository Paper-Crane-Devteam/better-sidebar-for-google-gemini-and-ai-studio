/**
 * Codec for Gemini's `batchexecute` endpoint — the one place that knows its wire format.
 *
 * Every Gemini RPC except generation goes through this endpoint, and every interceptor
 * used to re-implement the same three steps: dig `f.req` out of a form body, split the
 * length-prefixed response into frames, double-parse the `wrb.fr` row. Handlers now get
 * the result — an `RpcCall` with both sides already decoded — and never see the wire.
 *
 * ## Request
 *
 * Form body, `f.req=<json>&at=<token>`:
 * ```
 * [[ [rpcid, "<inner json>", null, "generic" | "<n>"], … ]]
 * ```
 * The fourth element keys the call within a batch: `"generic"` for a lone call,
 * `"1"`, `"2"`, … when one request carries several.
 *
 * ## Response
 *
 * XSSI prefix, then `<byte length>\n<json frame>` repeated. Each frame is an array of
 * rows; the ones that matter are
 * ```
 * ["wrb.fr", rpcid, "<inner json>" | null, null, null, <status> | null, "generic" | "<n>"]
 * ```
 * A null payload with a `[code, …]` status is a per-RPC error inside an HTTP 200 —
 * e.g. `5` (NOT_FOUND) for a conversation this account cannot see.
 *
 * Frames are found by bracket depth, not by the length markers: those count UTF-8
 * bytes while JS strings are UTF-16, so any CJK in a payload would put offset
 * arithmetic out of step.
 */

import { trace } from '@/shared/lib/trace';

export interface RpcCall {
  rpcid: string;
  /** The call's inner payload, parsed. `undefined` when the request was not readable. */
  request: unknown;
  /** The response payload, parsed. `null` on a per-RPC error or when absent. */
  response: unknown;
  /** google.rpc code of a per-RPC error, else null. */
  errorCode: number | null;
  /** HTTP status of the whole batch. */
  status: number;
  url: string;
}

export interface RpcResponseRow {
  rpcid: string;
  /** `"generic"` or the call's index within the batch. */
  key: string;
  payload: unknown;
  errorCode: number | null;
}

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Top-level JSON arrays in `text`, in order. Partial trailing frames are skipped. */
function splitFrames(text: string): unknown[] {
  const frames: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '[') {
      // The XSSI prefix `)]}'` holds a `]`, harmless because depth 0 ignores it.
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ']' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        const frame = parseJson(text.slice(start, i + 1));
        if (frame !== undefined) frames.push(frame);
        start = -1;
      }
    }
  }
  return frames;
}

/** Every `wrb.fr` row of a response body. */
export function decodeBatchResponse(text: string): RpcResponseRow[] {
  const rows: RpcResponseRow[] = [];
  for (const frame of splitFrames(text)) {
    if (!Array.isArray(frame)) continue;
    for (const row of frame) {
      if (!Array.isArray(row) || row[0] !== 'wrb.fr' || typeof row[1] !== 'string') continue;
      const status = row[5];
      rows.push({
        rpcid: row[1],
        key: typeof row[6] === 'string' ? row[6] : 'generic',
        payload: typeof row[2] === 'string' ? (parseJson(row[2]) ?? null) : null,
        errorCode: Array.isArray(status) && typeof status[0] === 'number' ? status[0] : null,
      });
    }
  }
  return rows;
}

interface RequestEntry {
  rpcid: string;
  key: string;
  payload: unknown;
}

/** The calls named in a request body's `f.req`, or [] when there is none. */
export function decodeBatchRequest(body: unknown): RequestEntry[] {
  if (typeof body !== 'string' || !body.includes('f.req=')) return [];
  let outer: unknown;
  try {
    outer = parseJson(new URLSearchParams(body).get('f.req'));
  } catch {
    return [];
  }
  const calls = Array.isArray(outer) ? outer[0] : undefined;
  if (!Array.isArray(calls)) return [];

  const entries: RequestEntry[] = [];
  for (const call of calls) {
    if (!Array.isArray(call) || typeof call[0] !== 'string') continue;
    entries.push({
      rpcid: call[0],
      key: typeof call[3] === 'string' ? call[3] : 'generic',
      payload: parseJson(call[1]),
    });
  }
  return entries;
}

/**
 * Both halves of one batchexecute round trip, paired per call.
 *
 * Pairing is by rpcid + key, so a batch carrying several calls (or the same rpcid
 * twice) gives each handler its own request alongside its own response. A call whose
 * request could not be read still comes through, with `request: undefined` — the
 * response is usually what a handler needs.
 */
export function decodeBatchExecute(input: {
  url: string;
  status: number;
  requestBody: unknown;
  responseText: string;
}): RpcCall[] {
  const requests = decodeBatchRequest(input.requestBody);
  const findRequest = (rpcid: string, key: string) =>
    requests.find((r) => r.rpcid === rpcid && r.key === key) ??
    requests.find((r) => r.rpcid === rpcid);

  const calls: RpcCall[] = decodeBatchResponse(input.responseText).map((row) => ({
    rpcid: row.rpcid,
    request: findRequest(row.rpcid, row.key)?.payload,
    response: row.payload,
    errorCode: row.errorCode,
    status: input.status,
    url: input.url,
  }));

  trace('Better Sidebar (Gemini): batchexecute', calls.map((c) => c.rpcid).join(','), calls);
  return calls;
}
