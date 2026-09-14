/**
 * The document worker — where Office files are actually parsed and rewritten.
 *
 * ## Why a worker of its own
 *
 * Not the service worker: parsing a 20 MB workbook is seconds of uninterrupted CPU, and
 * the agent loop is writing to its ledger the whole time. Blocking the service worker
 * blocks that too.
 *
 * ⚠️ Not the *existing* DB worker either. `db-worker.ts` runs a strictly serial queue,
 * so one long document parse would sit in front of every SQL request behind it — and the
 * agent's own bookkeeping is SQL. Two workers, two queues.
 *
 * ## Why this can reach the files at all
 *
 * The worker inherits the extension origin, so `navigator.storage.getDirectory()` is the
 * *same* OPFS tree the background writes to. That is the load-bearing fact behind the
 * whole design: the engine opens the file itself, and only the projection text crosses
 * a message boundary. Nothing here is base64.
 *
 * ## No DOM, on purpose
 *
 * A Worker has no `DOMParser` and no `XMLSerializer`, which is why `ooxml/xml-cursor.ts`
 * exists. Nothing imported from here may reach for either — on Firefox this same module
 * runs as a plain Worker created by the background page, so there is no context where
 * the DOM would be available as a fallback.
 */

import type { Scope } from '@/shared/workspace/fs';
import { runDocRequest } from '@/shared/documents/engine';
// Office handlers belong only in this worker, not the PDF DOM host or background.
import '@/shared/documents/docx';
import '@/shared/documents/xlsx';
import '@/shared/documents/pptx';
import { DocumentError, type DocRequest } from '@/shared/documents/types';

interface WorkerRequest {
  id: string;
  type: 'DOC_OP';
  payload: {
    workspaceId?: string;
    request?: DocRequest;
  };
}

/**
 * Serial queue.
 *
 * Two concurrent operations on the same file would each hold their own copy of the
 * bytes and race to write it; two on different files would just both be slow while
 * doubling peak memory. Serialising costs nothing the caller notices — the agent issues
 * one document call at a time — and removes both failure modes.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.then(work, work);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data ?? ({} as WorkerRequest);

  void enqueue(async () => {
    try {
      const data = await handle(type, payload);
      self.postMessage({ id, success: true, data });
    } catch (e) {
      self.postMessage({ id, success: false, error: describe(e) });
    }
  });
};

async function handle(
  type: WorkerRequest['type'],
  payload: WorkerRequest['payload'],
): Promise<unknown> {
  if (type !== 'DOC_OP') {
    throw new DocumentError(`Unknown document request "${type}"`);
  }

  if (!payload.workspaceId) {
    throw new DocumentError('No workspace was selected for this document operation.');
  }
  if (!payload.request) {
    throw new DocumentError('The document request was empty.');
  }

  const scope: Scope = { workspaceId: payload.workspaceId };
  return runDocRequest(scope, payload.request);
}

/**
 * Turn a rejection into text the agent can act on.
 *
 * `DocumentError` messages are already written for the model, so they pass through
 * untouched. Everything else is a bug in this layer rather than a problem with the
 * user's file, and says so — otherwise the agent reads a `TypeError` as a fact about
 * the document and starts trying different paths.
 */
function describe(e: unknown): string {
  if (e instanceof DocumentError) return e.message;
  const message = (e as Error)?.message ?? String(e);
  if (/OPFS is not available/i.test(message)) {
    return 'The workspace storage is unavailable in this context.';
  }
  return `The document engine failed while processing this file: ${message}`;
}
