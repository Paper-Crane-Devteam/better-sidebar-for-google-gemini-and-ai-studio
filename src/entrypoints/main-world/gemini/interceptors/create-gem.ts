import {
  parseStreamingResponse,
  extractWrbFrPayloads,
} from '../lib/response-parser';
import i18n from '@/locale/i18n';

/**
 * The rpcid `CNgdBe` is used for two distinct operations:
 *   1) Creating a gem  — response data[2][0] = [gemId, [gemName], …]
 *   2) Listing notebooks — response data[2] = [ [ "notebooks/<uuid>", [title, …], … ], … ]
 *
 * We disambiguate by inspecting the shape of the payload. Notebook list items
 * always have an id string that starts with `notebooks/`.
 */
export function handleCNgdBeResponse(response: any, url: string) {
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
        const outer = payload?.[2];
        if (!Array.isArray(outer)) continue;

        // Detect notebook list: array of tuples where the first element of
        // each tuple is a string starting with "notebooks/".
        const firstEntry = outer[0];
        const firstId = Array.isArray(firstEntry) ? firstEntry[0] : undefined;
        const isNotebookList =
          Array.isArray(firstEntry) &&
          typeof firstId === 'string' &&
          firstId.startsWith('notebooks/');

        if (isNotebookList) {
          handleNotebookList(outer, url);
          continue;
        }

        // Otherwise assume this is a gem creation response:
        //   outer === [gemId, [gemName], …]
        const gemId = firstEntry;
        const gemName = outer[1]?.[0];
        if (typeof gemId === 'string' && gemId && !gemId.includes('/')) {
          console.log(
            `Better Sidebar (Gemini): Detected gem creation: ${gemId} - ${gemName}`,
          );
          globalThis.dispatchEvent(
            new CustomEvent('GEMINI_GEM_CREATED', {
              detail: {
                id: gemId,
                name: gemName || i18n.t('gems.untitledGem'),
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
      'Better Sidebar (Gemini): Error handling CNgdBe response',
      e,
    );
  }
}

function handleNotebookList(list: any[], url: string) {
  const notebooks: {
    id: string;
    name: string;
    created_at?: number;
  }[] = [];

  for (const entry of list) {
    try {
      const rawId = entry?.[0]; // "notebooks/<uuid>"
      if (typeof rawId !== 'string' || !rawId.startsWith('notebooks/')) continue;
      const id = rawId.slice('notebooks/'.length);

      const meta = entry?.[1];
      const title = meta?.[0];
      // entry[1][13] holds a created_at tuple [seconds, nanos] per sample.
      const createdAtTuple = meta?.[13];
      const createdAt = Array.isArray(createdAtTuple) ? createdAtTuple[0] : undefined;

      notebooks.push({
        id,
        name: typeof title === 'string' && title ? title : i18n.t('notebooks.untitledNotebook'),
        created_at: typeof createdAt === 'number' ? createdAt : undefined,
      });
    } catch {
      // ignore individual entry errors
    }
  }

  if (notebooks.length === 0) return;
  console.log(
    `Better Sidebar (Gemini): Detected notebook list with ${notebooks.length} items`,
  );

  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_NOTEBOOK_LIST_RESPONSE', {
      detail: { notebooks, originalUrl: url },
    }),
  );
}

// Backwards-compat alias
export const handleCreateGemResponse = handleCNgdBeResponse;
