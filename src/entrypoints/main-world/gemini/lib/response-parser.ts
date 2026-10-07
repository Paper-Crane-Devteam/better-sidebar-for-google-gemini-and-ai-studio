/**
 * Parses the streaming response format from Google Gemini.
 * Heuristic: Split by lines that consist solely of a number (the length).
 */
export function parseStreamingResponse(responseBody: string): any[] {
  const chunks: any[] = [];
  
  let raw = responseBody;
  // Remove XSSI prefix if present
  if (raw.startsWith(")]}'")) {
    raw = raw.substring(4);
  }
  
  // Split by newlines
  // In the stream, we see patterns like:
  // <JSON>
  // <NUMBER>
  // <JSON>
  // So we assume any line that matches ^\d+$ is a delimiter.
  
  const lines = raw.split('\n');
  let currentJsonStr = '';
  
  for (const line of lines) {
      const trimmed = line.trim();
      
      // Check if this line is a length delimiter
      // It must be a non-empty string of digits
      if (/^\d+$/.test(trimmed)) {
          // If we have accumulated a JSON string, try to parse it
          if (currentJsonStr.trim()) {
              try {
                  // Sometimes the accumulated string might be wrapped in [] or similar,
                  // or just be the JSON array.
                  chunks.push(JSON.parse(currentJsonStr));
              } catch (e) {
                  // If parse fails, maybe it wasn't a complete JSON yet?
                  // But based on the structure, chunks are separated by lengths.
                  // Only common issue is if a number appears inside a JSON string on its own line.
                  // But standard JSON usually doesn't format that way unless pretty-printed.
                  // Gemini response seems to be compact JSON.
                  // console.warn('Gemini Parser: Failed to parse intermediate chunk', e);
              }
              currentJsonStr = '';
          }
      } else {
          // It's part of the JSON content
          currentJsonStr += line + '\n';
      }
  }
  
  // Parse any remaining content
  if (currentJsonStr.trim()) {
      try {
          chunks.push(JSON.parse(currentJsonStr));
      } catch (e) {
          // console.warn('Gemini Parser: Failed to parse final chunk', e);
      }
  }

  return chunks;
}

/**
 * Extracts and parses payloads from 'wrb.fr' chunks.
 * These chunks typically contain a JSON string in index 2.
 */
export function extractWrbFrPayloads(chunks: any[]): any[] {
  const payloads: any[] = [];
  
  chunks.forEach(chunk => {
    // Usually chunk is like ["wrb.fr", "someId", "jsonString"]
    if (Array.isArray(chunk) && chunk[0] === 'wrb.fr') {
       if (chunk.length > 2 && typeof chunk[2] === 'string') {
         try {
           payloads.push(JSON.parse(chunk[2]));
         } catch (e) {
           // ignore
         }
       }
    }
  });
  
  return payloads;
}

/**
 * Convenience: parse streaming response body and extract wrb.fr payloads in one step.
 * Every interceptor does this same sequence, so this avoids repetition.
 */
export function parseResponsePayloads(responseBody: string): any[] {
  const retChunks = parseStreamingResponse(responseBody);
  const chunks = retChunks.map((chunk) => chunk[0]);
  return extractWrbFrPayloads(chunks);
}

/**
 * The RPC status code of a failed `wrb.fr` chunk, or null when there is none.
 *
 * batchexecute reports per-RPC errors inside an HTTP 200: the payload slot (index
 * 2) is null and index 5 holds a google.rpc.Status-shaped array whose first
 * element is the canonical code — e.g.
 * `["wrb.fr","hNvQHb",null,null,null,[5,null,[["…BardErrorInfo",[1167]]]],"generic"]`
 * for a conversation that does not exist (5 = NOT_FOUND).
 */
export function getWrbFrErrorCode(responseBody: string): number | null {
  for (const raw of parseStreamingResponse(responseBody)) {
    const chunk = Array.isArray(raw) ? raw[0] : null;
    if (!Array.isArray(chunk) || chunk[0] !== 'wrb.fr') continue;
    if (typeof chunk[2] === 'string') continue;
    const status = chunk[5];
    if (Array.isArray(status) && typeof status[0] === 'number') return status[0];
  }
  return null;
}
