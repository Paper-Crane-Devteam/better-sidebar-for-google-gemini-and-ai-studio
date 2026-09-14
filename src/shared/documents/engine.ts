/**
 * The document engine's entry point — one function, called by the worker.
 *
 * Sequences the three things a document operation needs: pick a handler, load the
 * bytes, and (for an edit) hand the result to `saveDocument` so it lands safely. All the
 * format knowledge is behind `handlerFor`, and all the I/O is here or in `storage.ts`.
 *
 * ⚠️ This module must run at the extension origin — it opens OPFS. In practice that
 * means the doc worker inside the offscreen document (or the fallback worker on
 * Firefox). Calling it from a content script would silently address
 * `gemini.google.com`'s storage, which is empty, and every read would report "not
 * found" for a file the user can see in the tree.
 */

import type * as fsTypes from '@/shared/workspace/fs';
import { DocumentError, type DocRequest, type DocResult } from './types';
import { handlerFor } from './registry';
import { loadDocument, saveDocument } from './storage';

// Each execution host registers its formats before calling this engine: the document
// worker imports Office handlers; pdf-host imports PDF. Keeping registration at the
// host boundary prevents the PDF/background bundles from duplicating Office parsers.

export async function runDocRequest(
  scope: fsTypes.Scope,
  request: DocRequest,
): Promise<DocResult> {
  const handler = handlerFor(request.path);
  const doc = await loadDocument(scope, request.path);

  if (request.kind === 'read') {
    return request.mode === 'outline'
      ? handler.outline(doc)
      : handler.read(doc, request);
  }

  if (!handler.edit) {
    throw new DocumentError(
      `Reading ${handler.format} files is supported, but editing them is not yet. ` +
        'Report what needs to change and let the user make the edit.',
    );
  }

  if (request.ops.length === 0) {
    throw new DocumentError('doc_edit needs at least one operation in "ops".');
  }

  const outcome = await handler.edit(doc, request, { loadSource: (path) => loadDocument(scope, path) });

  // Nothing took effect: do not write, and do not take a backup. A save here would burn
  // the session's one backup slot on a no-op, which is exactly when the user later needs
  // it to hold the *real* previous version.
  if (outcome.applied.length === 0) {
    return {
      kind: 'edit',
      path: request.path,
      applied: [],
      skipped: outcome.skipped.length > 0
        ? outcome.skipped
        : ['No operation matched anything in the document, so nothing was written.'],
    };
  }

  const saved = await saveDocument(scope, request.path, outcome.bytes, {
    sessionId: request.sessionId,
    verify: handler.verify,
  });

  return {
    kind: 'edit',
    path: request.path,
    applied: outcome.applied,
    skipped: outcome.skipped,
    backupPath: saved.backupPath,
  };
}
