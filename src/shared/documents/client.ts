/**
 * The content script's view of the document engine.
 *
 * Thin by design, exactly like `workspace/client.ts`: assemble the message, unwrap the
 * response, throw a plain `Error` carrying the text the engine already wrote for the
 * agent. No parsing happens on this side of the bridge and nothing here may import
 * anything under `documents/` other than types — pulling in `engine.ts` would drag
 * `fflate` and every format handler into the overlay bundle that is injected into every
 * page load, for code that cannot run there anyway (OPFS in a content script belongs to
 * gemini.google.com, not to the extension).
 */

import type { DocEditRequest, DocReadRequest, DocResult } from './types';

async function call(workspaceId: string, payload: DocReadRequest | DocEditRequest) {
  const response = await browser.runtime.sendMessage({
    type: 'DOCUMENT_OP',
    workspaceId,
    payload,
  });

  // A background that threw before reaching the handler answers `undefined`, which would
  // otherwise surface as "cannot read property success of undefined".
  if (!response) {
    throw new Error('The document engine is unavailable (no response from the extension)');
  }
  if (!response.success) {
    throw new Error(response.error || 'The document operation failed');
  }
  return response.data as DocResult;
}

export function readDocument(
  workspaceId: string,
  request: Omit<DocReadRequest, 'kind'>,
): Promise<DocResult> {
  return call(workspaceId, { kind: 'read', ...request });
}

export function editDocument(
  workspaceId: string,
  request: Omit<DocEditRequest, 'kind'>,
): Promise<DocResult> {
  return call(workspaceId, { kind: 'edit', ...request });
}
