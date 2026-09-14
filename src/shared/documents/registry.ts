/**
 * Format handlers, and the contract they sign.
 *
 * ## Handlers are pure bytes → result
 *
 * No OPFS or messaging. Handlers may be asynchronous. A handler receives the file's bytes and returns
 * either a projection or new bytes. Everything with a side effect — loading, backing up,
 * verifying what landed — lives in `storage.ts` and `engine.ts`.
 *
 * That split is what makes this layer testable at all: a handler can be run against a
 * fixture file with no browser, and the one thing that must never regress (open a real
 * document, change nothing, write it back, get identical bytes) is a two-line test.
 *
 * ## Registration is by extension, and the extension is trusted
 *
 * No content sniffing. A `.docx` that is really a zip of something else fails inside the
 * handler with a message about what was missing, which is more useful than a generic
 * "unsupported format" from a sniffer that guessed. The one probe that does happen is
 * `looksLikeZip`, because "this is a legacy .doc renamed" is a mistake worth naming.
 */

import type {
  DocEditRequest,
  DocFormat,
  DocOutlineResult,
  DocProjectionResult,
  DocReadRequest,
} from './types';
import { DocumentError } from './types';
import type { LoadedDocument } from './storage';

export interface EditOutcome {
  /** The rewritten file. Identical to the input when every op was skipped. */
  bytes: Uint8Array;
  /** One line per op that took effect, phrased for the user's approval card. */
  applied: string[];
  /** One line per op that was refused, with the reason the agent can act on. */
  skipped: string[];
}

export interface FormatHandler {
  format: DocFormat;
  /** Lowercase extensions, without the dot. */
  extensions: string[];
  /** What is in this file, cheaply. Must never return more than a few KB of text. */
  outline(doc: LoadedDocument): DocOutlineResult | Promise<DocOutlineResult>;
  /** Part of the content, addressed by `request.range` or `request.query`. */
  read(doc: LoadedDocument, request: DocReadRequest): DocProjectionResult | Promise<DocProjectionResult>;
  /** Apply ops. Absent while a format is still read-only. */
  edit?(doc: LoadedDocument, request: DocEditRequest, context?: { loadSource(path: string): Promise<LoadedDocument> }): EditOutcome | Promise<EditOutcome>;
  /**
   * Structural self-check on bytes this handler produced.
   *
   * Runs twice per save — once in memory before the original is touched, once on what
   * was actually read back. It should be cheap and paranoid: re-open the container,
   * confirm the parts it declares are present, confirm the XML still tokenises.
   */
  verify?(bytes: Uint8Array): void | Promise<void>;
}

const handlers = new Map<string, FormatHandler>();

export function registerHandler(handler: FormatHandler): void {
  for (const extension of handler.extensions) {
    handlers.set(extension, handler);
  }
}

export function handlerFor(path: string): FormatHandler {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  const extension = dot <= 0 ? '' : base.slice(dot + 1);
  const handler = handlers.get(extension);

  if (!handler) {
    const known = [...handlers.keys()].sort().join(', ');
    throw new DocumentError(
      `There is no document reader for ".${extension}" files. ` +
        (known
          ? `Supported: ${known}. Plain text, Markdown, CSV and JSON are handled by ` +
            'read_file instead.'
          : 'No document formats are available in this build.'),
    );
  }

  return handler;
}

/** Extensions the document tools can currently handle. For prompts and for the UI. */
export function supportedExtensions(): string[] {
  return [...handlers.keys()].sort();
}
