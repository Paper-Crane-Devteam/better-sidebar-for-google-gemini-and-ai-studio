import { parseBatchExecuteRequest } from '../lib/request-parser';

export function handleRenameNotebookResponse(response: any, url: string) {
  if (response.status !== 200) return;

  try {
    const requestBody = response.config?.body || response.config?.data;
    if (!requestBody || typeof requestBody !== 'string') return;

    const [parsedBody] = parseBatchExecuteRequest(requestBody);
    if (!Array.isArray(parsedBody)) return;

    for (const item of parsedBody) {
      // item structure: ["kHv0Vd","[\"notebooks/<uuid>\",[\"new name\",...]]",null,"generic"]
      if (!Array.isArray(item) || item[0] !== 'kHv0Vd') continue;

      const payloadString = item[1];
      if (typeof payloadString !== 'string') continue;

      try {
        const payload = JSON.parse(payloadString);
        // payload: ["notebooks/<uuid>", ["<new_name>", "", "", ...]]
        if (!Array.isArray(payload) || payload.length < 2) continue;

        const raw = payload[0]; // "notebooks/<uuid>"
        if (typeof raw !== 'string' || !raw.startsWith('notebooks/')) continue;

        const id = raw.slice('notebooks/'.length);
        const details = payload[1];
        if (!Array.isArray(details) || typeof details[0] !== 'string') continue;

        const newName = details[0];

        console.log(
          `Better Sidebar (Gemini): Detected notebook rename: ${id} -> ${newName}`,
        );

        globalThis.dispatchEvent(
          new CustomEvent('GEMINI_NOTEBOOK_RENAME', {
            detail: { id, newName, originalUrl: url },
          }),
        );
      } catch {
        // ignore parse errors
      }
    }
  } catch (e) {
    console.error(
      'Better Sidebar (Gemini): Error handling rename notebook request',
      e,
    );
  }
}
