import { parseBatchExecuteRequest } from '../lib/request-parser';

export function handleDeleteNotebookResponse(response: any, url: string) {
  if (response.status !== 200) return;

  try {
    const requestBody = response.config?.body || response.config?.data;
    if (!requestBody || typeof requestBody !== 'string') return;

    const [parsedBody] = parseBatchExecuteRequest(requestBody);
    if (!Array.isArray(parsedBody)) return;

    for (const item of parsedBody) {
      // item structure: ["Nwkn9","[\"notebooks/eb97194e-...\"]",null,"generic"]
      if (!Array.isArray(item) || item[0] !== 'Nwkn9') continue;

      const payloadString = item[1];
      if (typeof payloadString !== 'string') continue;

      try {
        const payload = JSON.parse(payloadString);
        // payload: ["notebooks/<uuid>"]
        if (Array.isArray(payload) && typeof payload[0] === 'string') {
          const raw = payload[0]; // "notebooks/<uuid>"
          if (!raw.startsWith('notebooks/')) continue;
          const id = raw.slice('notebooks/'.length);

          console.log(
            `Better Sidebar (Gemini): Detected notebook deletion: ${id}`,
          );

          globalThis.dispatchEvent(
            new CustomEvent('GEMINI_NOTEBOOK_DELETE', {
              detail: { id, originalUrl: url },
            }),
          );
        }
      } catch {
        // ignore parse errors
      }
    }
  } catch (e) {
    console.error(
      'Better Sidebar (Gemini): Error handling delete notebook request',
      e,
    );
  }
}
