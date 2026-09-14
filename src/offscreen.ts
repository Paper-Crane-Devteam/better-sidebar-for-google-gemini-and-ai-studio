// This script runs in the offscreen document
// It acts as a bridge between the Background Script and the DB Worker
//
// NOTE: We cannot use Vite's `?worker` import because in dev mode it creates
// a Worker URL pointing to http://localhost:3000 which doesn't match the
// chrome-extension:// origin of the offscreen document. Chrome 149+ enforces
// strict same-origin checks on Dedicated Workers (DWH_INVALID_SCRIPT_URL_ORIGIN).
//
// Instead, we reference the pre-bundled worker file from web_accessible_resources
// using chrome.runtime.getURL(), which stays within the extension's origin.

let worker: Worker | null = null;

const handleWorkerMessage = async (e: MessageEvent) => {
  // Forward result back to background script
  const { id, success, data, error, code, chunk } = e.data;

  // If the worker already chunked it, just forward it
  if (chunk) {
    browser.runtime.sendMessage({
      type: 'DB_RESPONSE',
      payload: { id, success, data, error, code, chunk },
    });
    return;
  }

  // Chunking threshold (e.g., 10MB to be safe, max is ~64MB in Chrome but safer to stay lower)
  const CHUNK_SIZE = 10 * 1024 * 1024;

  if (success && data && typeof data === 'string' && data.length > CHUNK_SIZE) {
    console.log(
      `[Offscreen] Data too large (${data.length} chars), splitting into chunks...`,
    );
    const totalChunks = Math.ceil(data.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await browser.runtime.sendMessage({
        type: 'DB_RESPONSE',
        payload: {
          id,
          success: true,
          data: chunk,
          chunk: { index: i, total: totalChunks },
        },
      });
    }
  } else {
    browser.runtime.sendMessage({
      type: 'DB_RESPONSE',
      payload: { id, success, data, error, code },
    });
  }
};

/** How many workers this document has built; >1 means we replaced a dead one. */
let workerCount = 0;

const createWorker = (): Worker => {
  const workerUrl = browser.runtime.getURL('assets/db-worker.js');
  const created = new Worker(workerUrl);
  workerCount++;
  created.onmessage = handleWorkerMessage;

  /**
   * A worker that died takes its database connection with it, and it can never
   * be revived. Drop the reference so the next request builds a fresh one —
   * otherwise every later request is posted into a dead worker and simply never
   * answered, which reads as "the database is gone" on the other side.
   */
  created.onerror = (event) => {
    console.error('[Offscreen] DB Worker error, discarding it:', event.message);
    try {
      created.terminate();
    } catch (e) {
      // Already gone
    }
    if (worker === created) worker = null;
  };

  // A replacement worker knows nothing about the database the previous one had
  // open, and this document existing is what the bridge uses to decide it does
  // not need to send INIT. Tell it explicitly, or the next request lands on a
  // nameless worker and gets refused.
  if (workerCount > 1) {
    browser.runtime
      .sendMessage({ type: 'DB_WORKER_REPLACED' })
      .catch(() => {
        // Service worker is asleep; it will re-init on its own when it wakes.
      });
  }

  console.log('[Offscreen] DB Worker created via extension URL:', workerUrl);
  return created;
};

/** Lazily (re)create the worker so a crash is recoverable. */
const getWorker = (): Worker => {
  if (!worker) worker = createWorker();
  return worker;
};

// Warm up immediately: the background side usually sends INIT right away.
try {
  getWorker();
} catch (e) {
  console.error('[Offscreen] Failed to create worker:', e);
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type !== 'DB_REQUEST') return;

  const { id, workerType, payload } = message.payload;
  try {
    getWorker().postMessage({ id, type: workerType, payload });
  } catch (e: any) {
    console.error('[Offscreen] Failed to forward request to worker:', e);
    worker = null;
    browser.runtime.sendMessage({
      type: 'DB_RESPONSE',
      payload: {
        id,
        success: false,
        error: `Worker unavailable: ${e?.message ?? e}`,
      },
    });
  }
});

// ─── Document worker ─────────────────────────────────────────────────────────
//
// A second worker, deliberately not the DB one. `db-worker` serialises everything it is
// given, so a 20-second parse of a large workbook would sit in front of every SQL request
// queued behind it — and the agent's own ledger writes are SQL. Two workers, two queues.
//
// Same URL trick as above (`runtime.getURL`) and for the same reason: a `?worker` import
// resolves to the dev server's origin in development, which Chrome refuses to load from a
// chrome-extension:// page.
//
// Responses are never chunked. A document result is a projection capped at a couple of
// tens of KB by `docx/project.ts` — the size limit that matters is the agent's round
// budget, which is far below anything `sendMessage` struggles with.

let docWorker: Worker | null = null;

const createDocWorker = (): Worker => {
  const workerUrl = browser.runtime.getURL('assets/doc-worker.js');
  const created = new Worker(workerUrl);

  created.onmessage = (e: MessageEvent) => {
    const { id, success, data, error } = e.data;
    browser.runtime.sendMessage({
      type: 'DOC_RESPONSE',
      payload: { id, success, data, error },
    });
  };

  // A worker that died cannot be revived, and every later request posted into it would
  // simply never be answered — which reads as "documents stopped working" with no error.
  // Dropping the reference makes the next request build a fresh one.
  created.onerror = (event) => {
    console.error('[Offscreen] Doc Worker error, discarding it:', event.message);
    try {
      created.terminate();
    } catch {
      // Already gone.
    }
    if (docWorker === created) docWorker = null;
  };

  console.log('[Offscreen] Doc Worker created via extension URL:', workerUrl);
  return created;
};

// Built on first use rather than at startup: most sessions never open a document, and
// this saves parsing the worker bundle for all of them.
const getDocWorker = (): Worker => {
  if (!docWorker) docWorker = createDocWorker();
  return docWorker;
};

browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type !== 'DOC_REQUEST') return;

  const { id, workerType, payload } = message.payload;
  if (/\.pdf$/i.test(payload?.request?.path ?? '')) {
    void import('./shared/documents/pdf-host').then(({ dispatchPdf }) => dispatchPdf(id, payload)).catch(error => {
      void browser.runtime.sendMessage({ type: 'DOC_RESPONSE', payload: { id, success: false, error: `PDF host failed: ${error.message}` } });
    });
    return;
  }
  try {
    getDocWorker().postMessage({ id, type: workerType, payload });
  } catch (e: any) {
    console.error('[Offscreen] Failed to forward document request:', e);
    docWorker = null;
    browser.runtime.sendMessage({
      type: 'DOC_RESPONSE',
      payload: {
        id,
        success: false,
        error: `The document engine could not be started: ${e?.message ?? e}`,
      },
    });
  }
});
