/**
 * Base64 for the workspace message bridge.
 *
 * Extension messaging serialises with JSON, not structured clone, so a `Uint8Array`
 * crossing `runtime.sendMessage` arrives as `{"0":72,"1":105,…}` — one object key per
 * byte, roughly 8× the payload. Base64 costs 33% and survives intact, which makes it
 * the only practical way to move raw bytes between the content script and OPFS.
 *
 * Text still travels as text: the string ops in `fs.ts` are unchanged. These helpers
 * exist for upload and download, where the bytes must round-trip exactly and a UTF-8
 * decode would replace every invalid sequence with U+FFFD — silently corrupting the
 * file rather than failing.
 */

/**
 * Chunk size for `String.fromCharCode.apply`.
 *
 * Spreading a whole file into an argument list overflows the call stack somewhere
 * around 100k arguments, and the limit is engine-specific — so the conversion is
 * chunked regardless of input size rather than only for large inputs.
 */
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...(bytes.subarray(i, i + CHUNK) as unknown as number[]),
    );
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
