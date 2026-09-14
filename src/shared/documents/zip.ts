/**
 * The zip layer under every OOXML format.
 *
 * `.docx`, `.xlsx` and `.pptx` are zip archives of XML parts. `fflate` was already a
 * dependency (chat export), it is dependency-free, works in a Worker, and needs no DOM
 * — which is the whole reason the document engine can live where it lives.
 *
 * ## Only unpack what is needed
 *
 * `openArchive` reads the central directory and nothing else; `part()` inflates one
 * entry on demand. A thesis is mostly embedded images, and reading its outline should
 * not decompress a single one of them. `unzipSync` on the whole file would.
 *
 * ## Repacking keeps media as-is
 *
 * Untouched entries that are already-compressed media (png, jpeg, mp4, embedded fonts)
 * are re-added with `level: 0`. Deflating a JPEG buys a fraction of a percent and costs
 * the CPU time of the whole file — on a picture-heavy deck that is the difference
 * between an edit feeling instant and feeling broken.
 *
 * ## Bomb limits are not paranoia here
 *
 * The input is "whatever the user dropped in", and the declared uncompressed size in a
 * zip header is attacker-controlled. Checking it before inflating is the only point
 * where a 10 KB file claiming to be 4 GB can be refused for free.
 */

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { DocumentError } from './types';

/** Largest single part we will inflate. `document.xml` of a 500-page book is ~20 MB. */
const MAX_PART_BYTES = 64 * 1024 * 1024;

/** Largest total inflated payload across one archive. */
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

/** More entries than this is not a document. A real one has tens, not thousands. */
const MAX_ENTRIES = 3000;

/**
 * Extensions whose bytes are already compressed.
 *
 * Re-deflating them is pure cost. `xml`/`rels`/`bin` are absent on purpose: those are
 * the text parts, where deflate earns its keep (a `sheet1.xml` routinely compresses
 * 10:1, and the file size is what the user's disk and any later upload pays for).
 */
const PRECOMPRESSED = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|mp3|m4a|wav|aac|ogg|mp4|m4v|mov|avi|wmv|zip|gz|woff2?|ttf|otf|emf|wmf)$/i;

/**
 * An opened OOXML container.
 *
 * Holds the original bytes and a lazily-inflated cache of the parts that were touched.
 * `save()` reassembles the whole archive; every entry that was never read or written
 * comes back from the original.
 */
export interface Archive {
  /** Every entry name in the archive, in central-directory order. */
  readonly names: string[];
  /** Whether an entry exists. Cheap — no inflation. */
  has(name: string): boolean;
  /** Inflate an entry as UTF-8 text. Throws `DocumentError` if absent. */
  text(name: string): string;
  /** Inflate an entry as bytes. Throws `DocumentError` if absent. */
  bytes(name: string): Uint8Array;
  /** Inflate an entry as text, or return null when it is not there. */
  textOrNull(name: string): string | null;
  /** Stage replacement text for an entry, creating it if new. */
  setText(name: string, content: string): void;
  /** Stage replacement bytes for an entry, creating it if new. */
  setBytes(name: string, content: Uint8Array): void;
  /** Remove an entry. Used for `calcChain.xml`, which must not survive an edit. */
  remove(name: string): void;
  /** Entry names that were modified, added or removed. For the edit summary. */
  changedNames(): string[];
  /** Rebuild the archive. Untouched entries keep their original bytes. */
  save(): Uint8Array;
}

/**
 * Read an archive's directory without inflating anything.
 *
 * ⚠️ `fflate` has no "list only" call, so the size checks ride on `unzipSync`'s filter
 * hook: the filter sees each entry's declared sizes and is asked before the data is
 * touched. Returning `false` for everything gives us the entry list at directory-read
 * cost, and gives the limits a place to refuse. This is deliberate use of a side
 * effect — the alternative is parsing the central directory by hand.
 */
export function openArchive(source: Uint8Array): Archive {
  const names: string[] = [];
  let declaredTotal = 0;

  try {
    unzipSync(source, {
      filter: (file) => {
        if (names.length >= MAX_ENTRIES) {
          throw new DocumentError(
            `This archive has more than ${MAX_ENTRIES} entries, which is not a document.`,
          );
        }
        if (file.originalSize > MAX_PART_BYTES) {
          throw new DocumentError(
            `"${file.name}" claims to be ${file.originalSize} bytes uncompressed, ` +
              `over the ${MAX_PART_BYTES}-byte part limit. The file may be corrupt.`,
          );
        }
        declaredTotal += file.originalSize;
        if (declaredTotal > MAX_TOTAL_BYTES) {
          throw new DocumentError(
            'This archive expands to more than ' +
              `${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB and was refused.`,
          );
        }
        names.push(file.name);
        return false; // directory only — nothing is inflated here
      },
    });
  } catch (e) {
    if (e instanceof DocumentError) throw e;
    throw new DocumentError(
      `Could not read the file as a zip archive: ${(e as Error).message}. ` +
        'It may be a legacy .doc/.xls/.ppt file — those need to be re-saved in the ' +
        'modern format first.',
    );
  }

  if (names.length === 0) {
    throw new DocumentError('The archive is empty.');
  }

  /** Entries pulled out of `source` so far. One inflate per name, at most. */
  const inflated = new Map<string, Uint8Array>();
  /** Entries staged for writing. Takes precedence over `inflated`. */
  const staged = new Map<string, Uint8Array>();
  const removed = new Set<string>();
  const nameSet = new Set(names);

  /** Inflate exactly one entry, using the filter to skip every other one. */
  function inflate(name: string): Uint8Array | null {
    const cached = inflated.get(name);
    if (cached) return cached;
    if (!nameSet.has(name)) return null;

    const result = unzipSync(source, { filter: (file) => file.name === name });
    const data = result[name];
    if (!data) return null;
    inflated.set(name, data);
    return data;
  }

  function current(name: string): Uint8Array | null {
    if (removed.has(name)) return null;
    return staged.get(name) ?? inflate(name);
  }

  return {
    names,

    has: (name) => !removed.has(name) && (staged.has(name) || nameSet.has(name)),

    bytes(name) {
      const data = current(name);
      if (!data) {
        throw new DocumentError(`The file has no "${name}" part, so it is not valid.`);
      }
      return data;
    },

    text(name) {
      return stripBom(strFromU8(this.bytes(name)));
    },

    textOrNull(name) {
      const data = current(name);
      return data ? stripBom(strFromU8(data)) : null;
    },

    setText(name, content) {
      staged.set(name, strToU8(content));
      removed.delete(name);
    },

    setBytes(name, content) {
      staged.set(name, content);
      removed.delete(name);
    },

    remove(name) {
      removed.add(name);
      staged.delete(name);
    },

    changedNames() {
      return [...new Set([...staged.keys(), ...removed])].sort();
    },

    save() {
      // Nothing was staged: hand back the original bytes untouched. This is what makes
      // a read-only round trip provably lossless, and it is also the fast path.
      if (staged.size === 0 && removed.size === 0) return source;

      const files: Record<string, Uint8Array | [Uint8Array, { level: 0 | 6 }]> = {};

      for (const name of names) {
        if (removed.has(name)) continue;
        if (staged.has(name)) continue; // written below, so it keeps its own settings
        const data = inflate(name);
        if (!data) continue;
        files[name] = PRECOMPRESSED.test(name) ? [data, { level: 0 }] : [data, { level: 6 }];
      }

      for (const [name, data] of staged) {
        files[name] = [data, { level: PRECOMPRESSED.test(name) ? 0 : 6 }];
      }

      return zipSync(files, { level: 6 });
    },
  };
}

/**
 * Drop a UTF-8 BOM.
 *
 * Word and Excel write one on some parts. Left in place it becomes a U+FEFF at index 0
 * of the string, which shifts every offset the XML cursor computes by one and makes an
 * `<?xml` prolog check fail for no visible reason.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Whether these bytes start with a local file header. Cheap format probe. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}
