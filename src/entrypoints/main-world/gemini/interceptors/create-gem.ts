import {
  parseStreamingResponse,
  extractWrbFrPayloads,
} from '../lib/response-parser';

export function handleCreateGemResponse(response: any, url: string) {
  if (response.status !== 200) return;

  let responseBody = response.response;
  if (typeof responseBody !== 'string') {
    try {
      responseBody = JSON.stringify(responseBody);
    } catch {
      return;
    }
  }

  try {
    const retChunks = parseStreamingResponse(responseBody);
    const chunks = retChunks.map((chunk) => chunk[0]);

    if (chunks.length === 0) return;

    const payloads = extractWrbFrPayloads(chunks);

    for (const payload of payloads) {
      try {
        // Gem creation response: data[2][0][0] = id, data[2][0][1][0] = name
        const gemData = payload?.[2]?.[0];
        if (!gemData) continue;

        const id = gemData[0];
        const name = gemData[1]?.[0];

        if (typeof id === 'string' && id) {
          console.log(
            `Better Sidebar (Gemini): Detected gem creation: ${id} - ${name}`,
          );

          globalThis.dispatchEvent(
            new CustomEvent('GEMINI_GEM_CREATED', {
              detail: {
                id,
                name: name || 'Untitled Gem',
                originalUrl: url,
              },
            }),
          );
        }
      } catch {
        // ignore individual payload errors
      }
    }
  } catch (e) {
    console.error(
      'Better Sidebar (Gemini): Error handling create gem response',
      e,
    );
  }
}
