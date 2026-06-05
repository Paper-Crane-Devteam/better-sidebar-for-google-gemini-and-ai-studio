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

// Initialize the worker using the bundled asset URL (same origin as extension)
try {
  const workerUrl = browser.runtime.getURL('assets/db-worker.js');
  worker = new Worker(workerUrl);
  console.log('[Offscreen] DB Worker initialized via extension URL:', workerUrl);

  worker.onmessage = async (e) => {
    // Forward result back to background script
    const { id, success, data, error, chunk } = e.data;
    
    // If the worker already chunked it, just forward it
    if (chunk) {
        browser.runtime.sendMessage({
            type: 'DB_RESPONSE',
            payload: { id, success, data, error, chunk }
        });
        return;
    }

    // Chunking threshold (e.g., 10MB to be safe, max is ~64MB in Chrome but safer to stay lower)
    const CHUNK_SIZE = 10 * 1024 * 1024; 

    if (success && data && typeof data === 'string' && data.length > CHUNK_SIZE) {
        console.log(`[Offscreen] Data too large (${data.length} chars), splitting into chunks...`);
        const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
        
        for (let i = 0; i < totalChunks; i++) {
            const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            await browser.runtime.sendMessage({
                type: 'DB_RESPONSE',
                payload: { 
                    id, 
                    success: true, 
                    data: chunk, 
                    chunk: { index: i, total: totalChunks } 
                }
            });
        }
    } else {
        browser.runtime.sendMessage({
            type: 'DB_RESPONSE',
            payload: { id, success, data, error }
        });
    }
  };
} catch (e) {
  console.error('[Offscreen] Failed to create worker:', e);
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'DB_REQUEST') {
    if (worker) {
      // Forward request to worker
      const { id, workerType, payload } = message.payload;
      worker.postMessage({ id, type: workerType, payload });
    } else {
      console.error('[Offscreen] Worker not ready');
      browser.runtime.sendMessage({
        type: 'DB_RESPONSE',
        payload: { 
          id: message.payload.id, 
          success: false, 
          error: 'Worker not initialized' 
        }
      });
    }
  }
});

