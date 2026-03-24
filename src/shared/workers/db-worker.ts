import { initSQLite, isOpfsSupported } from '@subframe7536/sqlite-wasm';
import { useIdbStorage } from '@subframe7536/sqlite-wasm/idb';
import { useOpfsStorage } from '@subframe7536/sqlite-wasm/opfs';
import { SCHEMA } from '@/shared/db/schema';
import { runMigrations } from './migrations';

let db: any = null;
let initPromise: Promise<boolean> | null = null;

let dbName = 'prompt-manager-for-google-ai-studio.db';
const WASM_URL = '/assets/wa-sqlite-async.wasm';

// Request queue to ensure serial execution of DB operations
let requestQueue = Promise.resolve();

const initDB = async (newDbName?: string) => {
  // If a new name is provided and differs from the current, force re-init
  if (newDbName && newDbName !== dbName) {
    dbName = newDbName;
    db = null;
    initPromise = null;
  }

  if (db) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log(`Worker: Initializing database "${dbName}"...`);

      // Add 30s timeout for DB initialization
      const initPromise = new Promise(async (resolve, reject) => {
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
              useOpfsStorage(dbName, { url: WASM_URL }),
            );
          } else {
            database = await initSQLite(
              useIdbStorage(dbName, { url: WASM_URL }),
            );
          }
          clearTimeout(timeoutId);
          resolve(database);
        } catch (e) {
          clearTimeout(timeoutId);
          reject(e);
        }
      });

      db = await initPromise;

      // Initialize Schema
      await db.run('PRAGMA foreign_keys = ON;');
      await db.run(SCHEMA);

      // Run Migrations
      await runMigrations(db);

      console.log(`Worker: Database "${dbName}" initialized successfully`);
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
const execSql = async (sql: string, bind?: any[]) => {
  if (!db) throw new Error('DB not initialized');

  const logSql = sql.trim().replace(/\s+/g, ' ');
  console.log(
    `${DB_LOG_PREFIX} SQL:`,
    logSql,
    bind != null && bind.length ? `bind: [${bind.join(', ')}]` : '',
  );

  const result = await db.run(sql, bind);

  if (result.length > 0) {
    console.log(
      `${DB_LOG_PREFIX} Result: ${result.length} row(s)`,
      result.length <= 3 ? result : result.slice(0, 3),
    );
  } else {
    console.log(`${DB_LOG_PREFIX} Result: 0 rows (ok)`);
  }
  return result;
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
          await root.removeEntry(dbName + suffix);
        } catch (e) {
          // Ignore if file doesn't exist
        }
      }

      // 5. Overwrite the main DB file
      const fileHandle = await root.getFileHandle(dbName, {
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
    if (!db && type !== 'INIT') {
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
        try {
          await db.run('BEGIN TRANSACTION;');
          for (const op of operations) {
            await execSql(op.sql, op.bind);
          }
          await db.run('COMMIT;');
          self.postMessage({ id, success: true });
        } catch (e) {
          try {
            await db.run('ROLLBACK;');
          } catch (_e) {}
          throw e;
        }
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
    self.postMessage({ id, success: false, error: error.message });
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
