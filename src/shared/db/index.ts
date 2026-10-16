import { NO_DB_OPEN } from './protocol';
import { ensureOffscreenDocument } from '@/shared/offscreen-host';
import { trace } from '@/shared/lib/trace';

const pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
let localWorker: Worker | null = null;

/**
 * A request that never reached the worker (host torn down, message dropped,
 * no answer in time) as opposed to one the worker answered with an error.
 *
 * Only these are safe to retry, and only for idempotent request types.
 */
class DbTransportError extends Error {}

/**
 * Request types that can be replayed without changing the outcome.
 *
 * INIT/SWITCH_DB open a database by name, GET_DB_NAME only reads — running any
 * of them twice is the same as running it once. EXEC/RUN/RUN_BATCH/IMPORT are
 * deliberately absent: replaying a write could apply it twice.
 */
const IDEMPOTENT_TYPES = new Set(['INIT', 'SWITCH_DB', 'GET_DB_NAME']);

/**
 * First attempt at an idempotent request gets a short leash on purpose.
 *
 * The failure this exists for is a freshly created offscreen document whose
 * message listener is not registered yet: the request is silently dropped
 * (`runtime.sendMessage` still finds a receiver — this very service worker — so
 * it does not even throw). Waiting the full timeout for that would stall the
 * first query after every wake-up.
 */
const HANDSHAKE_TIMEOUT_MS = 4000;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 3;

/**
 * The database this side of the bridge believes should be open.
 * Set by initDB/switchDB and replayed to any freshly created worker.
 */
let desiredDbName: string | null = null;

/**
 * True when the worker host was just created and has therefore not been told
 * which database to open. The worker refuses to guess (see db-worker.ts), so we
 * must replay INIT before any other request.
 *
 * This matters because the offscreen document can be reclaimed or crash
 * independently of the service worker: without the replay, the recreated worker
 * would have no dbName and every subsequent request would fail.
 */
let workerNeedsInit = false;

// ─── DB session lock ─────────────────────────────────────────────────────────

/**
 * Serializes database *switches* against multi-step database *operations*.
 *
 * There is exactly one worker and one open database at a time, but callers run
 * concurrently: every extension message is handled in its own async task, and
 * each one may switch the active database to match its sender tab. Meanwhile a
 * sync performs dozens of separate round trips (read a table, write a batch,
 * read the next table...).
 *
 * Without this lock, a switch can land between any two of those round trips, so
 * the second half of an operation executes against a different database than the
 * first half. For a merge that means Phase 2 issues its DELETEs against another
 * profile's data while judging it against this profile's remote payload — which
 * deletes nearly everything in it.
 *
 * Validating the database once at the start cannot catch this; the connection
 * has to stay pinned for the whole operation.
 */
//
// The gate below is a reader/writer lock where the "readers" are grouped by
// database name:
//
// - A *lease* (`withDb`) pins one database. Any number of leases on the same
//   database run concurrently — that is ordinary traffic from one tab — but a
//   lease on a different database waits until every lease on the current one has
//   been released, and only then switches. So a tab's handler can no longer have
//   its second query land in another tab's profile.
// - An *exclusive* section (`initDB`, `switchDB`) waits for all leases to drain
//   and keeps everyone else out while it runs.
//
// Waiters are served FIFO, with one exception: a lease on the database that is
// already pinned is admitted immediately, even past queued waiters. That is what
// makes a nested `withDbSession` inside a message lease (backup, Drive sync) safe
// instead of a deadlock. The cost is that a busy tab can delay another tab's
// switch until its in-flight requests drain, which happens between messages.
//
// Not reentrant across databases: calling `switchDB`/`initDB`, or `withDb` on a
// *different* database, from inside a lease waits on itself forever.

type GateWaiter =
  | { kind: 'lease'; db: string; grant: () => void }
  | { kind: 'exclusive'; grant: () => void };

const gateQueue: GateWaiter[] = [];
let leaseCount = 0;
let leaseDb: string | null = null;
/** Resolves once the pinned database is actually open; shared by its leases */
let leaseReady: Promise<void> = Promise.resolve();
let exclusiveHeld = false;

function pumpGate() {
  while (gateQueue.length && !exclusiveHeld) {
    const head = gateQueue[0];
    if (head.kind === 'exclusive') {
      if (leaseCount > 0) return;
      gateQueue.shift();
      exclusiveHeld = true;
      head.grant();
      return;
    }
    if (leaseCount > 0 && head.db !== leaseDb) return;
    gateQueue.shift();
    admitLease(head.db);
    head.grant();
  }
}

function admitLease(db: string) {
  if (leaseCount === 0) {
    // First lease of a new pin: open the database before anyone runs a query.
    leaseDb = db;
    leaseReady = openForLease(db);
    // A failed open is reported to each lease holder; it must not poison the gate.
    leaseReady.catch(() => undefined);
  }
  leaseCount++;
}

async function openForLease(dbName: string) {
  await ensureWorker();
  const current = workerNeedsInit
    ? null
    : await rawSendWorkerMessage('GET_DB_NAME');
  if (current !== dbName) {
    console.log(`[DB] Pinning "${dbName}" (was "${current}")`);
    await rawSwitchDB(dbName);
  } else {
    // Already on the right database, but requests may still have to replay INIT
    // if the worker gets replaced mid-lease. Point the replay at this database so
    // recovery cannot open a different profile.
    desiredDbName = dbName;
  }
}

function releaseLease() {
  leaseCount--;
  if (leaseCount === 0) leaseDb = null;
  pumpGate();
}

/**
 * Run `fn` with the connection pinned to `dbName`.
 *
 * Concurrent with other leases on the same database; serialized against leases
 * on any other database and against `switchDB`/`initDB`.
 */
export async function withDb<T>(dbName: string, fn: () => Promise<T>): Promise<T> {
  if (!exclusiveHeld && leaseCount > 0 && leaseDb === dbName) {
    admitLease(dbName);
  } else {
    await new Promise<void>((grant) => {
      gateQueue.push({ kind: 'lease', db: dbName, grant });
      pumpGate();
    });
  }
  try {
    await leaseReady;
    return await fn();
  } finally {
    releaseLease();
  }
}

async function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  await new Promise<void>((grant) => {
    gateQueue.push({ kind: 'exclusive', grant });
    pumpGate();
  });
  try {
    return await fn();
  } finally {
    exclusiveHeld = false;
    pumpGate();
  }
}

/**
 * Serializes multi-step sessions against each other.
 *
 * Leases alone let two sessions on the same database interleave — a restore
 * emptying tables while an export reads them. Sessions take their lease first
 * and this second; the fixed order is what keeps the two locks deadlock-free.
 */
let sessionChain: Promise<unknown> = Promise.resolve();

function runSessionSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const result = sessionChain.then(fn, fn);
  sessionChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * The database this side of the bridge has open (or is opening), or null before
 * the first open. Inside a `withDb` lease this is the leased database.
 */
export const getOpenDbName = (): string | null => desiredDbName;

// Helper to handle partial chunks
const chunkedResponses = new Map<string, { chunks: string[]; received: number; total: number }>();

/** Rebuild a worker-side error, preserving the code so callers can react to it. */
const toWorkerError = (message: string, code?: string): Error => {
  const err = new Error(message) as Error & { code?: string };
  if (code) err.code = code;
  return err;
};

// Listen for responses from Offscreen document
browser.runtime.onMessage.addListener((message) => {
  // The host document tells us when it had to build a replacement worker. That
  // worker has no database open, and since the document still exists nothing
  // else would make us notice.
  if (message.type === 'DB_WORKER_REPLACED') {
    console.warn('[DB] Worker was replaced, INIT will be replayed');
    workerNeedsInit = true;
    return;
  }

  if (message.type === 'DB_RESPONSE') {
    const { id, success, data, error, code, chunk } = message.payload;
    const request = pendingRequests.get(id);
    
    if (request) {
      if (!success) {
        request.reject(toWorkerError(error, code));
        pendingRequests.delete(id);
        return;
      }

      if (chunk) {
        // Handle chunked response
        let entry = chunkedResponses.get(id);
        if (!entry) {
          entry = { chunks: new Array(chunk.total), received: 0, total: chunk.total };
          chunkedResponses.set(id, entry);
        }

        entry.chunks[chunk.index] = data;
        entry.received++;

        if (entry.received === entry.total) {
          const fullData = entry.chunks.join('');
          request.resolve(fullData);
          pendingRequests.delete(id);
          chunkedResponses.delete(id);
        }
      } else {
        // Standard response
        request.resolve(data);
        pendingRequests.delete(id);
      }
    }
  }
});

async function ensureWorker() {
  // Method 1: Use local worker (Firefox or fallback)
  // Check if offscreen API is missing OR if we prefer local worker in this context
  // Use explicit check for offscreen API existence on the browser object
  // @ts-ignore - offscreen might not be in the definition depending on version/types
  const hasOffscreenApi = typeof browser !== 'undefined' && !!browser.offscreen;
  
  if (!hasOffscreenApi) {
    if (localWorker) return;
    
    console.log('Initializing local DB Worker (Fallback/Firefox mode)...');
    // Dynamic import to avoid `new Worker()` appearing in service worker context (Chrome MV3)
    const { default: DbWorker } = await import('@/shared/workers/db-worker?worker');
    localWorker = new DbWorker();
    workerNeedsInit = true;
    localWorker.onmessage = (e) => {
      const { id, success, data, error, code, chunk } = e.data;
      const request = pendingRequests.get(id);
      if (request) {
        if (!success) {
          request.reject(toWorkerError(error, code));
          pendingRequests.delete(id);
          return;
        }

        if (chunk) {
          // Handle chunked response
          let entry = chunkedResponses.get(id);
          if (!entry) {
            entry = { chunks: new Array(chunk.total), received: 0, total: chunk.total };
            chunkedResponses.set(id, entry);
          }

          entry.chunks[chunk.index] = data;
          entry.received++;

          if (entry.received === entry.total) {
            const fullData = entry.chunks.join('');
            request.resolve(fullData);
            pendingRequests.delete(id);
            chunkedResponses.delete(id);
          }
        } else {
          request.resolve(data);
          pendingRequests.delete(id);
        }
      }
    };
    return;
  }

  // Method 2: Use Offscreen API (Chrome).
  //
  // Creation is delegated to `offscreen-host.ts` because the document engine needs the
  // same document, and two subsystems each probing-and-creating is a race where the
  // loser sees "Only a single offscreen document may be created".
  const status = await ensureOffscreenDocument();

  // A brand new document's DB worker has no database open, and the bridge would
  // otherwise assume the connection is live because the document exists.
  if (status.created) workerNeedsInit = true;
}

export const initDB = async (dbName?: string) =>
  runExclusive(async () => {
    await ensureWorker();
    if (dbName) desiredDbName = dbName;
    const result = await rawSendWorkerMessage(
      'INIT',
      dbName ? { dbName } : undefined,
    );
    workerNeedsInit = false;
    return result;
  });

/**
 * Switch the active database.
 *
 * Waits for every in-flight lease to finish, so a tab that wants a different
 * profile cannot yank the connection out from under a running operation. Must
 * not be called from inside a lease.
 */
export const switchDB = async (dbName: string) =>
  runExclusive(() => rawSwitchDB(dbName));

/** Switch without taking the lock. Only for callers that already hold it. */
const rawSwitchDB = async (dbName: string) => {
  await ensureWorker();
  desiredDbName = dbName;
  const result = await rawSendWorkerMessage('SWITCH_DB', { dbName });
  workerNeedsInit = false;
  return result;
};

/**
 * Run a multi-step database operation with the connection pinned to `dbName`.
 *
 * A lease on `dbName` (see `withDb`) plus mutual exclusion with other sessions,
 * so concurrent switches queue behind it and two sessions never interleave.
 *
 * Use this for anything that issues more than one dependent query — sync,
 * export, import, restore. Safe to call from inside a lease on the same
 * database; do not call `switchDB`/`initDB`/`withDbSession` from inside `fn`.
 */
export const withDbSession = async <T>(
  dbName: string,
  fn: () => Promise<T>,
): Promise<T> => withDb(dbName, () => runSessionSerialized(fn));

/**
 * Ask the worker which database it actually has open.
 * Returns null when the worker has nothing open and none is expected.
 *
 * Use this to verify assumptions before destructive or identity-sensitive work
 * (sync, export). The value being verified against generally comes from a
 * different piece of service-worker memory (e.g. the tab→profile map), so this
 * still catches real drift; it only settles a worker that was just recreated
 * rather than reporting a transient "nothing open".
 */
export const getWorkerDbName = async (): Promise<string | null> => {
  return sendWorkerMessage('GET_DB_NAME');
};

/**
 * Replay INIT if the worker is known to have nothing open.
 *
 * A freshly (re)created worker has no dbName and refuses to guess one, so this
 * has to happen before any other request.
 */
const replayInitIfNeeded = async () => {
  if (!workerNeedsInit || !desiredDbName) return;
  console.log(`[DB] Worker needs init, opening "${desiredDbName}"`);
  await rawSendWorkerMessage('INIT', { dbName: desiredDbName });
  workerNeedsInit = false;
};

const sendWorkerMessage = async (type: string, payload?: any): Promise<any> => {
  await ensureWorker();
  await replayInitIfNeeded();

  try {
    return await rawSendWorkerMessage(type, payload);
  } catch (err: any) {
    // The worker turned out to have no database open — it was replaced while we
    // believed the connection was still good. Recover instead of surfacing it:
    // the worker refuses this case *before* executing anything, so replaying is
    // safe even for writes.
    if (err?.code !== NO_DB_OPEN || !desiredDbName) throw err;

    console.warn(
      `[DB] Worker lost its database; reopening "${desiredDbName}" and retrying ${type}`,
    );
    workerNeedsInit = true;
    await replayInitIfNeeded();
    return rawSendWorkerMessage(type, payload);
  }
};

/**
 * Post a message to the worker without any ensure/re-init handling.
 *
 * Retries only when the request never got an answer *and* replaying it is safe
 * (see IDEMPOTENT_TYPES). Errors reported by the worker itself are passed
 * straight through — they will not change on a second try.
 */
const rawSendWorkerMessage = async (
  type: string,
  payload?: any,
): Promise<any> => {
  const retryable = IDEMPOTENT_TYPES.has(type);
  const attempts = retryable ? MAX_ATTEMPTS : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Short first try for idempotent requests, full budget afterwards: the
    // retry may be waiting on real work (migrations on a fresh open).
    const timeoutMs =
      retryable && attempt === 0 ? HANDSHAKE_TIMEOUT_MS : REQUEST_TIMEOUT_MS;

    try {
      return await postToWorker(type, payload, timeoutMs);
    } catch (err) {
      lastError = err;
      if (!(err instanceof DbTransportError) || attempt === attempts - 1) {
        throw err;
      }
      console.warn(
        `[DB] ${type} got no answer (attempt ${attempt + 1}/${attempts}), retrying:`,
        (err as Error).message,
      );
      // The host may have been torn down entirely; rebuild it before retrying.
      await ensureWorker();
    }
  }

  throw lastError;
};

/** Single round trip to the worker. */
const postToWorker = (
  type: string,
  payload: any,
  timeoutMs: number,
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const fail = (message: string) => {
      if (!pendingRequests.delete(id)) return;
      chunkedResponses.delete(id);
      // No need to force an INIT replay here: a worker that lost its database
      // says so (NO_DB_OPEN) and a host that vanished is rebuilt by
      // ensureWorker, which flags the replay itself.
      reject(new DbTransportError(message));
    };

    const timeoutId = setTimeout(
      () => fail(`DB Request ${type} timed out after ${timeoutMs}ms`),
      timeoutMs,
    );

    pendingRequests.set(id, {
      resolve: (val) => {
        clearTimeout(timeoutId);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeoutId);
        reject(err);
      },
    });

    if (localWorker) {
      localWorker.postMessage({ id, type, payload });
      return;
    }

    browser.runtime
      .sendMessage({
        type: 'DB_REQUEST',
        payload: { id, workerType: type, payload },
      })
      .catch((err: any) => {
        // No receiver at all: fail now instead of burning the whole timeout.
        clearTimeout(timeoutId);
        fail(`DB Request ${type} could not be delivered: ${err?.message ?? err}`);
      });
  });
};

export const getDB = () => {
  // Legacy: Should not be used directly anymore
  throw new Error('Direct DB access deprecated. Use async operations.');
};

export const runQuery = async (sql: string, bind?: any[]) => {
  trace('[DB Query]', sql, bind);
  return sendWorkerMessage('EXEC', { sql, bind });
};

export const runCommand = async (sql: string, bind?: any[]) => {
  trace('[DB Command]', sql, bind);
  return sendWorkerMessage('RUN', { sql, bind });
};

export const runBatch = async (operations: { sql: string; bind?: any[] }[]) => {
  trace('[DB Batch]', operations.length, 'operations');
  return sendWorkerMessage('RUN_BATCH', { operations });
};

export const exportDB = async (): Promise<string> => {
  return sendWorkerMessage('EXPORT');
};

export const importDB = async (data: string, chunk?: { index: number; total: number }): Promise<void> => {
  return sendWorkerMessage('IMPORT', { data, chunk });
};

