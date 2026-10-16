/**
 * Just enough protobuf to read Gemini's `processSession` traffic without a schema.
 *
 * The wire format is self-describing up to the field number and wire type, which is
 * all the reader needs: every value we want is a length-delimited field at a known
 * path, so "walk field N, then field M inside it" is the whole API. No `.proto`, no
 * dependency, and nothing here allocates more than the subarrays it hands back.
 *
 * Paths were mapped by hand from live captures — see `process-session.ts` for the
 * table. Anything malformed returns `undefined` rather than throwing: this runs on
 * every frame of every generation, and a frame we cannot read is a frame to skip.
 */

const WIRE_VARINT = 0;
const WIRE_I64 = 1;
const WIRE_LEN = 2;
const WIRE_I32 = 5;

export interface ProtoField {
  field: number;
  wire: number;
  /** Varints as numbers (lossy past 2^53, irrelevant for the flags we read). */
  num?: number;
  /** Length-delimited payload, as a view into the parent buffer. */
  bytes?: Uint8Array;
}

function readVarint(buf: Uint8Array, pos: number): [number, number] | null {
  let result = 0;
  let mul = 1;
  for (let i = 0; i < 10; i++) {
    if (pos >= buf.length) return null;
    const b = buf[pos++];
    result += (b & 0x7f) * mul;
    if (!(b & 0x80)) return [result, pos];
    mul *= 128;
  }
  return null;
}

/** All top-level fields of one message, or null when the bytes are not a message. */
export function decodeFields(buf: Uint8Array): ProtoField[] | null {
  const out: ProtoField[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    if (!tag) return null;
    pos = tag[1];
    const field = Math.floor(tag[0] / 8);
    const wire = tag[0] % 8;
    if (field === 0) return null;

    if (wire === WIRE_VARINT) {
      const v = readVarint(buf, pos);
      if (!v) return null;
      out.push({ field, wire, num: v[0] });
      pos = v[1];
    } else if (wire === WIRE_LEN) {
      const len = readVarint(buf, pos);
      if (!len) return null;
      pos = len[1];
      const end = pos + len[0];
      if (end > buf.length) return null;
      out.push({ field, wire, bytes: buf.subarray(pos, end) });
      pos = end;
    } else if (wire === WIRE_I64) {
      pos += 8;
    } else if (wire === WIRE_I32) {
      pos += 4;
    } else {
      return null;
    }
  }
  return pos === buf.length ? out : null;
}

/** Every occurrence of `field` in `buf`. */
function fieldsOf(buf: Uint8Array, field: number): ProtoField[] {
  return (decodeFields(buf) ?? []).filter((f) => f.field === field);
}

/** The first message found by following `path`, one field number per level. */
export function getMessage(buf: Uint8Array | undefined, path: readonly number[]): Uint8Array | undefined {
  let node = buf;
  for (const field of path) {
    if (!node) return undefined;
    node = fieldsOf(node, field).find((f) => f.bytes)?.bytes;
  }
  return node;
}

const utf8 = new TextDecoder('utf-8', { fatal: false });

/** The string at `path`, or '' when absent. */
export function getString(buf: Uint8Array | undefined, path: readonly number[]): string {
  const bytes = getMessage(buf, path);
  return bytes ? utf8.decode(bytes) : '';
}

/**
 * Every string at the last step of `path`, joined. For text that could arrive in more
 * than one segment — taking only the first would yield a clean prefix, the worst shape
 * of wrong.
 */
export function getJoinedString(buf: Uint8Array | undefined, path: readonly number[]): string {
  if (!path.length) return '';
  const parent = getMessage(buf, path.slice(0, -1));
  if (!parent) return '';
  return fieldsOf(parent, path[path.length - 1])
    .filter((f) => f.bytes)
    .map((f) => utf8.decode(f.bytes!))
    .join('');
}

/** The varint at `path`, or undefined. */
export function getNumber(buf: Uint8Array | undefined, path: readonly number[]): number | undefined {
  if (!path.length) return undefined;
  const parent = getMessage(buf, path.slice(0, -1));
  if (!parent) return undefined;
  return fieldsOf(parent, path[path.length - 1]).find((f) => f.num !== undefined)?.num;
}

export function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
