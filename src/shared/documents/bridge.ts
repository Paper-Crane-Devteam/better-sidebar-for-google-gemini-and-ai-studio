/**
 * Background → document worker, one round trip.
 *
 * Much smaller than the DB bridge next door, and the reason is worth stating: **document
 * requests are stateless.** Every one carries its own workspace id and path, so there is
 * no equivalent of `INIT`, no "which database is open", no replay, no session lock. A
 * worker that was just rebuilt is immediately as useful as one that has been up for an
 * hour.
 *
 * ⚠️ Only reads are retried. A dropped `doc_edit` might have been dropped *after* the
 * write landed, and replaying it would apply the same change twice — for a tracked-change
 * edit that means two overlapping revisions on one sentence, which is worse than the
 * failure it was trying to paper over.
 *
 * ⚠️ Must be called from the background. It routes through `runtime.sendMessage` to the
 * offscreen document; a content script would get no reply, because responses come back
 * over `sendMessage` and those never reach content scripts (the same trap documented in
 * `agent-loop/ledger-client.ts`).
 */

import { ensureOffscreenDocument } from '@/shared/offscreen-host';
import type { DocRequest, DocResult } from './types';

/** A request that never got an answer, as opposed to one the engine refused. */
class DocTransportError extends Error {}

/**
 * Budget for one document operation.
 *
 * Generous compared with the DB bridge's 30 s because the work is genuinely long: a
 * large workbook is seconds of parsing before the first byte of an answer exists. The
 * timeout is here to stop a *lost* message from hanging the agent, not to police slow
 * files.
 */
const REQUEST_TIMEOUT_MS = 120000;

/** Short first attempt, for the case a freshly built host has no listener yet. */
const HANDSHAKE_TIMEOUT_MS = 5000;

const pending = new Map<
  string,
  { resolve: (value: any) => void; reject: (error: any) => void }
>();

let localWorker: Worker | null = null;

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'DOC_RESPONSE') return;
  settle(message.payload);
});

function settle(payload: {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}): void {
  const request = pending.get(payload.id);
  if (!request) return;
  pending.delete(payload.id);
  if (payload.success) {
    request.resolve(payload.data);
  } else {
    request.reject(new Error(payload.error || 'The document operation failed.'));
  }
}

/**
 * Make sure something is listening, on whichever browser this is.
 *
 * Chrome: the shared offscreen document. Firefox: a Worker created straight from the
 * background page — it has no offscreen API, but its background is a page rather than a
 * service worker, so `new Worker()` is allowed there.
 */
async function ensureHost(): Promise<void> {
  const status = await ensureOffscreenDocument();
  if (status.available) return;

  if (localWorker) return;

  // Dynamic import so `new Worker()` never appears in a Chrome MV3 service worker bundle,
  // and — as a side effect that the offscreen path depends on — so Vite emits the worker
  // as `assets/doc-worker.js`. See `wxt.config.ts`'s `worker.rollupOptions`.
  const { default: DocWorker } = await import('@/shared/workers/doc-worker?worker');
  localWorker = new DocWorker();
  localWorker.onmessage = (e: MessageEvent) => settle(e.data);
  localWorker.onerror = (event) => {
    console.error('[Documents] Local worker error, discarding it:', event.message);
    try {
      localWorker?.terminate();
    } catch {
      // Already gone.
    }
    localWorker = null;
  };
}

/** Run one document operation in the worker. */
export async function runDocumentOp(
  workspaceId: string,
  request: DocRequest,
): Promise<DocResult> {
  if (/\.pdf$/i.test(request.path) && !(await ensureOffscreenDocument()).available) {
    const { runPdfRequest } = await import('./pdf-host');
    return runPdfRequest(workspaceId, request);
  }
  return call('DOC_OP', { workspaceId, request }, request.kind === 'read');
}

async function call<T>(
  workerType: 'DOC_OP',
  payload: Record<string, unknown>,
  retryable: boolean,
): Promise<T> {
  await ensureHost();

  const attempts = retryable ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const timeout =
      retryable && attempt === 0 && attempts > 1
        ? HANDSHAKE_TIMEOUT_MS
        : REQUEST_TIMEOUT_MS;

    try {
      return await post<T>(workerType, payload, timeout);
    } catch (e) {
      lastError = e;
      if (!(e instanceof DocTransportError) || attempt === attempts - 1) throw e;
      console.warn(
        `[Documents] ${workerType} got no answer, retrying:`,
        (e as Error).message,
      );
      await ensureHost();
    }
  }

  throw lastError;
}

function post<T>(
  workerType: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = crypto.randomUUID();

    const fail = (message: string) => {
      if (!pending.delete(id)) return;
      reject(new DocTransportError(message));
    };

    const timer = setTimeout(
      () => fail(`The document engine did not answer within ${timeoutMs}ms.`),
      timeoutMs,
    );

    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value as T);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });

    if (localWorker) {
      localWorker.postMessage({ id, type: workerType, payload });
      return;
    }

    browser.runtime
      .sendMessage({ type: 'DOC_REQUEST', payload: { id, workerType, payload } })
      .catch((err: any) => {
        // Nothing received it at all — fail now instead of burning the whole timeout.
        clearTimeout(timer);
        fail(`The document engine is unreachable: ${err?.message ?? err}`);
      });
  });
}
