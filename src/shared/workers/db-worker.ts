import { initSQLite, isOpfsSupported } from '@subframe7536/sqlite-wasm';
import { useIdbStorage } from '@subframe7536/sqlite-wasm/idb';
import { useOpfsStorage } from '@subframe7536/sqlite-wasm/opfs';
import { SCHEMA } from '@/shared/db/schema';
import { NO_DB_OPEN } from '@/shared/db/protocol';
import { isTracing } from '@/shared/lib/trace';
import { runMigrations } from './migrations';

let db: any = null;
let initPromise: Promise<boolean> | null = null;

/**
 * Name of the database this worker has open.
 *
 * Deliberately starts as null instead of defaulting to the legacy filename.
 * A worker can be recreated at any time (Chrome reclaims offscreen documents),
 * and any default here means a recreated worker silently opens — or creates —
 * the wrong database while the caller still believes it is talking to the
 * profile DB it asked for. That mismatch is how a profile's data ends up
 * exported as "empty" and mirrored back over the real thing.
 *
 * With no default, an un-named worker fails loudly instead.
 */
let dbName: string | null = null;
const WASM_URL = '/assets/wa-sqlite-async.wasm';

class WorkerError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
  }
}

// Request queue to ensure serial execution of DB operations
let requestQueue = Promise.resolve();

/**
 * Errors that mean the connection is gone, not that the SQL was wrong.
 *
 * The storage handle behind SQLite (an OPFS sync access handle, or the IndexedDB
 * backing store) can be revoked while this worker keeps running — the machine
 * sleeps, the tab is discarded, the storage bucket is evicted. The handle object
 * is still there, so nothing here notices; every statement just fails from then
 * on. Matching these lets us throw the connection away and open a fresh one
 * instead of failing forever.
 *
 * Deliberately narrow: syntax errors and constraint violations must not match,
 * or a bad query would trigger a pointless reopen and get run twice.
 */
const CONNECTION_LOST_RE =
  /(closed|closing|invalidstate|nomodificationallowed|notreadable|notfound|access handle|detached|out of memory|memory access out of bounds|disk i\/o|SQLITE_IOERR|SQLITE_MISUSE|SQLITE_READONLY|not initialized|no such file)/i;

const isConnectionLost = (err: unknown): boolean => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return CONNECTION_LOST_RE.test(message);
};

/** Cheap probe to tell a live connection from a revoked one. */
const isConnectionAlive = async (): Promise<boolean> => {
  if (!db) return false;
  try {
    await db.run('SELECT 1;');
    return true;
  } catch (e) {
    console.warn('Worker: health check failed, connection is dead:', e);
    return false;
  }
};

/**
 * Drop the current connection without touching it and open a new one.
 *
 * No `close()` here on purpose: closing a revoked handle can throw or hang, and
 * we already know we are done with it.
 */
const reopenDB = async () => {
  db = null;
  initPromise = null;
  await initDB();
};

const initDB = async (newDbName?: string) => {
  // If a new name is provided and differs from the current, force re-init
  if (newDbName && newDbName !== dbName) {
    dbName = newDbName;
    db = null;
    initPromise = null;
  }

  if (!dbName) {
    throw new Error(
      'Worker: refusing to open a database without an explicit name. ' +
        'Send INIT with a dbName first.',
    );
  }

  // INIT is also what the bridge replays after a wake-up, so it is the natural
  // place to notice that an apparently open connection is no longer usable.
  if (db) {
    if (await isConnectionAlive()) return true;
    console.warn(`Worker: reopening "${dbName}" after a dead connection`);
    db = null;
    initPromise = null;
  }

  if (initPromise) return initPromise;

  // Pin the name for this init run so the async closures below can't observe a
  // concurrent switch, and so TS knows it is non-null.
  const openingDbName = dbName;

  initPromise = (async () => {
    try {
      console.log(`Worker: Initializing database "${openingDbName}"...`);

      // Add 30s timeout for opening the storage handle
      const openPromise = new Promise(async (resolve, reject) => {
        const timeoutId = setTimeout(
          () => reject(new Error('DB Initialization timed out after 30s')),
          30000,
        );

        try {
          const useOpfs = await isOpfsSupported();
          console.log(
            `Worker: Storage mode: ${useOpfs ? 'OPFS' : 'IndexedDB'}`,
          );

          let database;
          if (useOpfs) {
            database = await initSQLite(
              useOpfsStorage(openingDbName, { url: WASM_URL }),
            );
          } else {
            database = await initSQLite(
              useIdbStorage(openingDbName, { url: WASM_URL }),
            );
          }
          clearTimeout(timeoutId);
          resolve(database);
        } catch (e) {
          clearTimeout(timeoutId);
          reject(e);
        }
      });

      db = await openPromise;

      // Initialize Schema
      await db.run('PRAGMA foreign_keys = ON;');
      await db.run(SCHEMA);

      // Run Migrations
      await runMigrations(db);

      console.log(`Worker: Database "${openingDbName}" initialized successfully`);
      return true;
    } catch (err) {
      console.error('Worker: Failed to initialize database:', err);
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
};



/**
 * Close the current DB connection and reset state.
 */
const closeDB = async () => {
  if (db) {
    try {
      if (typeof db.close === 'function') {
        await db.close();
      }
    } catch (e) {
      console.warn('Worker: Error closing DB:', e);
    }
    db = null;
    initPromise = null;
  }
};

const DB_LOG_PREFIX = '[DB]';

// Helper to execute SQL with binding
const execSql = async (
  sql: string,
  bind?: any[],
  allowReopen = true,
): Promise<any[]> => {
  if (!db) throw new Error('DB not initialized');

  const tracing = isTracing();
  if (tracing) {
    console.log(
      `${DB_LOG_PREFIX} SQL:`,
      sql.trim().replace(/\s+/g, ' '),
      bind != null && bind.length ? `bind: [${bind.join(', ')}]` : '',
    );
  }

  let result: any[];
  try {
    result = await db.run(sql, bind);
  } catch (err) {
    if (!allowReopen || !isConnectionLost(err)) {
      console.error(
        `${DB_LOG_PREFIX} Failed:`,
        sql.trim().replace(/\s+/g, ' '),
        err,
      );
      throw err;
    }

    // The statement never ran against a usable connection, so replaying it
    // cannot duplicate a write.
    console.warn(`${DB_LOG_PREFIX} Connection lost, reopening and retrying:`, err);
    await reopenDB();
    return execSql(sql, bind, false);
  }

  if (tracing && result.length > 0) {
    console.log(
      `${DB_LOG_PREFIX} Result: ${result.length} row(s)`,
      result.length <= 3 ? result : result.slice(0, 3),
    );
  }
  return result;
};

/**
 * Run operations in a single transaction.
 *
 * If the connection dies the whole transaction is gone with it, so the batch is
 * replayed once on a fresh connection. Statements inside run with `allowReopen`
 * off: a mid-transaction reopen would commit half a batch.
 */
const runBatch = async (
  operations: { sql: string; bind?: any[] }[],
  allowReopen = true,
): Promise<void> => {
  try {
    await db.run('BEGIN TRANSACTION;');
    for (const op of operations) {
      await execSql(op.sql, op.bind, false);
    }
    await db.run('COMMIT;');
  } catch (e) {
    if (allowReopen && isConnectionLost(e)) {
      console.warn(
        `${DB_LOG_PREFIX} Connection lost during batch, reopening and retrying:`,
        e,
      );
      await reopenDB();
      return runBatch(operations, false);
    }
    try {
      await db.run('ROLLBACK;');
    } catch (_e) {}
    throw e;
  }
};

// Helper to convert Base64 to Uint8Array
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = self.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const handleExport = async (id: string): Promise<void> => {
  // Compact DB before dump to avoid OOM: re-importing the same ZIP causes
  // many DELETE+INSERT (replace messages), which leaves free pages and
  // inflates the file; dump() reads the whole file, so we VACUUM first.
  try {
    console.log('Worker: Optimizing FTS index...');
    await db.run("INSERT INTO messages_fts(messages_fts) VALUES('optimize');");

    console.log('Worker: Checkpointing WAL...');
    await db.run('PRAGMA wal_checkpoint(TRUNCATE);');

    console.log('Worker: Vacuuming database...');
    await db.run('VACUUM;');
  } catch (e) {
    console.warn(
      'Worker: Cleanup before export failed, exporting without compacting',
      e,
    );
  }

  const data: Uint8Array = await db.dump();
  const totalLength = data.byteLength;
  // Chunk size must be a multiple of 3 to align with Base64 encoding without padding issues in concatenation
  const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB
  const totalChunks = Math.ceil(totalLength / CHUNK_SIZE);

  // Batch size for String.fromCharCode to avoid stack overflow
  const BATCH_SIZE = 32768;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalLength);
    const chunk = data.subarray(start, end);

    // Efficiently convert chunk to binary string
    let binary = '';
    for (let j = 0; j < chunk.length; j += BATCH_SIZE) {
      const batchEnd = Math.min(j + BATCH_SIZE, chunk.length);
      // Use apply to convert a batch of bytes to string
      binary += String.fromCharCode.apply(
        null,
        chunk.subarray(j, batchEnd) as unknown as number[],
      );
    }

    const base64 = self.btoa(binary);

    self.postMessage({
      id,
      success: true,
      data: base64,
      chunk: {
        index: i,
        total: totalChunks,
      },
    });

    // Yield to event loop to allow GC and UI responsiveness
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

// Helper to buffer chunks for import
const importBuffer: string[] = [];

const handleImport = async (
  base64: string,
  chunk?: { index: number; total: number },
): Promise<void> => {
  // Collect chunks
  if (chunk) {
    importBuffer[chunk.index] = base64;
    // Check if all chunks received
    let receivedCount = 0;
    for (let i = 0; i < chunk.total; i++) {
      if (importBuffer[i]) receivedCount++;
    }

    if (receivedCount < chunk.total) {
      return; // Wait for more chunks
    }

    // All chunks received, rebuild base64 string
    base64 = importBuffer.join('');
    // Clear buffer
    importBuffer.length = 0;
  }

  if (!dbName) {
    throw new Error('Worker: cannot import before a database is opened');
  }
  const targetDbName = dbName;

  try {
    const useOpfs = await isOpfsSupported();

    if (useOpfs) {
      console.log('Worker: Starting OPFS import (manual overwrite)...');

      // 1. Close existing DB connection to release lock
      if (db) {
        console.log('Worker: Closing database...');
        if (typeof db.close === 'function') {
          await db.close();
        }
        db = null;
        initPromise = null;
      }

      // 2. Decode data
      const bytes = base64ToUint8Array(base64);

      // 3. Get OPFS root
      const root = await navigator.storage.getDirectory();

      // 4. Clean up auxiliary files
      for (const suffix of ['-journal', '-wal', '-shm']) {
        try {
          await root.removeEntry(targetDbName + suffix);
        } catch (e) {
          // Ignore if file doesn't exist
        }
      }

      // 5. Overwrite the main DB file
      const fileHandle = await root.getFileHandle(targetDbName, {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes as any);
      await writable.close();

      console.log('Worker: OPFS file overwritten successfully.');

      // 6. Re-initialize DB
      await initDB();
      return;
    }

    // Fallback for non-OPFS (IndexedDB)
    if (db && typeof db.sync === 'function') {
      const bytes = base64ToUint8Array(base64);
      const blob = new Blob([bytes as any]);
      const stream = blob.stream();
      await db.sync(stream);
    } else {
      throw new Error('Database import not supported in this configuration');
    }
  } catch (err) {
    console.error('Worker: Import failed:', err);
    // Try to recover DB connection if it was closed
    if (!db) {
      try {
        await initDB();
      } catch (e) {
        console.error('Worker: Recovery init failed:', e);
      }
    }
    throw err;
  }
};

const processMessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    // GET_DB_NAME must answer even before a DB is open — callers use it
    // precisely to detect the "worker has nothing open" state.
    if (type === 'GET_DB_NAME') {
      self.postMessage({ id, success: true, data: db ? dbName : null });
      return;
    }

    // INIT and SWITCH_DB carry the database name in their own payload, so they
    // are exactly the requests that can rescue a worker that has no name yet.
    // Gating them behind the check below would reject the only messages capable
    // of clearing the condition, leaving the worker permanently unusable.
    const carriesDbName = type === 'INIT' || type === 'SWITCH_DB';

    if (!db && !carriesDbName) {
      if (!dbName) {
        // The worker was (re)created without being told which DB to open.
        // Refusing to guess is intentional; see the `dbName` declaration.
        // The code lets the caller recognise this and replay INIT — nothing has
        // been executed at this point, so replaying is safe even for writes.
        throw new WorkerError(
          `Worker: no database open and no name known (request "${type}"). ` +
            'The caller must send INIT with a dbName after (re)creating the worker.',
          NO_DB_OPEN,
        );
      }
      await initDB();
    }

    switch (type) {
      case 'INIT': {
        const initDbName = payload?.dbName;
        await initDB(initDbName);
        self.postMessage({ id, success: true });
        break;
      }

      case 'SWITCH_DB': {
        const { dbName: newDbName } = payload;
        console.log(`Worker: Switching database to "${newDbName}"...`);
        await closeDB();
        await initDB(newDbName);
        self.postMessage({ id, success: true });
        break;
      }

      case 'EXEC': {
        const { sql, bind } = payload;
        const result = await execSql(sql, bind);
        self.postMessage({ id, success: true, data: result });
        break;
      }

      case 'RUN': {
        const { sql, bind } = payload;
        await execSql(sql, bind);
        self.postMessage({ id, success: true });
        break;
      }

      case 'RUN_BATCH': {
        const { operations } = payload;
        await runBatch(operations);
        self.postMessage({ id, success: true });
        break;
      }

      case 'EXPORT': {
        await handleExport(id);
        // postMessage is handled inside handleExport via chunks
        break;
      }

      case 'IMPORT': {
        const { data, chunk } = payload;
        await handleImport(data, chunk);
        self.postMessage({ id, success: true });
        break;
      }

      default:
        console.error('Worker: Unknown message type', type);
        self.postMessage({ id, success: false, error: 'Unknown message type' });
    }
  } catch (error: any) {
    console.error('Worker: Error processing message', error);
    self.postMessage({
      id,
      success: false,
      error: error.message,
      code: error.code,
    });
  }
};

self.onmessage = (e) => {
  // Chain the request to the queue to ensure serial execution
  requestQueue = requestQueue.then(async () => {
    try {
      await processMessage(e);
    } catch (error: any) {
      console.error('Worker: Unhandled error in message queue', error);
    }
  });
};
