/**
 * Schema-less protobuf dumper, for reverse-engineering Google's binary payloads
 * (Gemini `processSession`, any `$rpc` / grpc-web body).
 *
 * Prints one line per field as a dotted path — `.2.7.1.4.4.5.2.1 "text"` — which is
 * exactly the form the extension's readers index by (see
 * src/entrypoints/main-world/gemini/lib/process-session.ts). Length-delimited fields
 * are shown as a string when they read as text, recursed into when they parse as a
 * message, and as `bytes N` otherwise.
 */

function readVarint(b, i) {
  let r = 0n;
  let s = 0n;
  for (;;) {
    if (i >= b.length) throw new Error('eof');
    const x = b[i++];
    r |= BigInt(x & 0x7f) << s;
    s += 7n;
    if (!(x & 0x80)) break;
  }
  return [r, i];
}

export function decodeProto(b) {
  const out = [];
  let i = 0;
  try {
    while (i < b.length) {
      let tag;
      [tag, i] = readVarint(b, i);
      const f = Number(tag >> 3n);
      const w = Number(tag & 7n);
      if (f === 0) return null;
      if (w === 0) {
        let v;
        [v, i] = readVarint(b, i);
        out.push([f, 'v', v]);
      } else if (w === 2) {
        let l;
        [l, i] = readVarint(b, i);
        l = Number(l);
        if (i + l > b.length) return null;
        out.push([f, 'b', b.subarray(i, i + l)]);
        i += l;
      } else if (w === 5) {
        out.push([f, 'f32', b.readFloatLE(i)]);
        i += 4;
      } else if (w === 1) {
        out.push([f, 'f64', b.readDoubleLE(i)]);
        i += 8;
      } else return null;
    }
  } catch {
    return null;
  }
  return out;
}

const PRINTABLE = /^[\x20-\x7e\u00a0-\uffff\n\r\t]*$/;

/** Lines of `<path> <value>`, indented by depth. `maxStr` clips long strings. */
export function dumpProto(buf, { maxStr = 300, path = '', indent = '' } = {}) {
  const lines = [];
  const fields = decodeProto(buf);
  if (!fields) return [`${indent}${path} (not a protobuf message, ${buf.length}B)`];
  for (const [f, t, v] of fields) {
    const p = `${path}.${f}`;
    if (t !== 'b') {
      lines.push(`${indent}${p} ${t} ${String(v)}`);
      continue;
    }
    const s = v.toString('utf8');
    const printable = PRINTABLE.test(s) && !s.includes('\ufffd');
    const sub = v.length ? decodeProto(v) : null;
    if (printable && (s.length < 4 || !sub)) {
      lines.push(`${indent}${p} ${JSON.stringify(s.length > maxStr ? `${s.slice(0, maxStr)}…(${s.length})` : s)}`);
    } else if (sub && sub.length) {
      lines.push(`${indent}${p} { (${v.length}B)`);
      lines.push(...dumpProto(v, { maxStr, path: p, indent: `${indent}  ` }));
    } else {
      lines.push(`${indent}${p} bytes ${v.length}`);
    }
  }
  return lines;
}

export function b64ToBuffer(s) {
  return Buffer.from(String(s).replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
