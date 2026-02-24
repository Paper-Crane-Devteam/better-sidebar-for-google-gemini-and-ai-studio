
import DbWorker from '@/shared/workers/db-worker?worker';

const pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
let isOffscreenCreating = false;
let localWorker: Worker | null = null;

// Helper to handle partial chunks
const chunkedResponses = new Map<string, { chunks: string[]; received: number; total: number }>();

// Listen for responses from Offscreen document
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'DB_RESPONSE') {
    const { id, success, data, error, chunk } = message.payload;
    const request = pendingRequests.get(id);
    
    if (request) {
      if (!success) {
        request.reject(new Error(error));
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
    localWorker = new DbWorker();
    localWorker.onmessage = (e) => {
      const { id, success, data, error, chunk } = e.data;
      const request = pendingRequests.get(id);
      if (request) {
        if (!success) {
          request.reject(new Error(error));
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

  // Method 2: Use Offscreen API (Chrome)
  // @ts-ignore
  if (hasOffscreenApi) {
      try {
        let hasOffscreen = false;
        // @ts-ignore
        if (browser.runtime.getContexts) {
          try {
             // @ts-ignore
             const contexts = await browser.runtime.getContexts({
               contextTypes: ['OFFSCREEN_DOCUMENT' as any],
             });
             hasOffscreen = contexts.length > 0;
          } catch (e) {
             // Ignore error if contextTypes is invalid or API differs
             console.warn('getContexts check failed', e);
          }
        } else {
          // Fallback for browsers with offscreen API but no getContexts (rare, but safe)
          // We assume it doesn't exist and try to create, catching the error if it does.
          // @ts-ignore
          const clients = await browser.runtime.sendMessage({ type: 'PING_OFFSCREEN' }).catch(() => null);
          // If we had a ping mechanism, we could use it. But createDocument handles duplicates by throwing.
        }

        if (hasOffscreen) {
          return;
        }

        if (isOffscreenCreating) {
          await new Promise(resolve => setTimeout(resolve, 100));
          return;
        }

        isOffscreenCreating = true;
        // @ts-ignore
        await browser.offscreen.createDocument({
          url: 'offscreen.html',
          // @ts-ignore
          reasons: [browser.offscreen.Reason.WORKERS],
          justification: 'Run SQLite WASM in a Web Worker',
        });
      } catch (err: any) {
        if (!err.message.startsWith('Only a single offscreen')) {
           console.error('Failed to create offscreen document:', err);
           // If offscreen creation fails entirely, maybe fallback to local worker?
           // But we already decided to use offscreen if API exists.
           throw err;
        }
      } finally {
        isOffscreenCreating = false;
      }
      return;
  }
}

export const initDB = async (dbName?: string) => {
  await ensureWorker();
  // We can also send an INIT message if needed, but the offscreen script inits worker on load
  return sendWorkerMessage('INIT', dbName ? { dbName } : undefined);
};

export const switchDB = async (dbName: string) => {
  await ensureWorker();
  return sendWorkerMessage('SWITCH_DB', { dbName });
};

const sendWorkerMessage = async (type: string, payload?: any): Promise<any> => {
  await ensureWorker();
  
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    
    const timeoutId = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`DB Request ${type} timed out after 30s`));
      }
    }, 30000);

    pendingRequests.set(id, { 
      resolve: (val) => {
        clearTimeout(timeoutId);
        resolve(val);
      }, 
      reject: (err) => {
        clearTimeout(timeoutId);
        reject(err);
      } 
    });
    
    if (localWorker) {
      localWorker.postMessage({ id, type, payload });
    } else {
      browser.runtime.sendMessage({
        type: 'DB_REQUEST',
        payload: { id, workerType: type, payload }
      });
    }
  });
};

export const getDB = () => {
  // Legacy: Should not be used directly anymore
  throw new Error('Direct DB access deprecated. Use async operations.');
};

export const runQuery = async (sql: string, bind?: any[]) => {
  console.log('[DB Query]', sql, bind);
  return sendWorkerMessage('EXEC', { sql, bind });
};

export const runCommand = async (sql: string, bind?: any[]) => {
  console.log('[DB Command]', sql, bind);
  return sendWorkerMessage('RUN', { sql, bind });
};

export const runBatch = async (operations: { sql: string; bind?: any[] }[]) => {
  console.log('[DB Batch]', operations.length, 'operations');
  return sendWorkerMessage('RUN_BATCH', { operations });
};

export const exportDB = async (): Promise<string> => {
  return sendWorkerMessage('EXPORT');
};

export const importDB = async (data: string, chunk?: { index: number; total: number }): Promise<void> => {
  return sendWorkerMessage('IMPORT', { data, chunk });
};

