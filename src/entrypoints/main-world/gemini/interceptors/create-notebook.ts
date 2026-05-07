import { parseResponsePayloads } from '../lib/response-parser';
import i18n from '@/locale/i18n';

/**
 * rpcid `oMH3Zd` — notebook creation.
 * Parsed payload: ["notebooks/<uuid>", true]
 */
export function handleCreateNotebookResponse(response: any, url: string) {
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
    const payloads = parseResponsePayloads(responseBody);

    for (const payload of payloads) {
      try {
        const raw = payload?.[0]; // "notebooks/<uuid>"
        if (typeof raw !== 'string' || !raw.startsWith('notebooks/')) continue;

        const id = raw.slice('notebooks/'.length);

        console.log(
          `Better Sidebar (Gemini): Detected notebook creation: ${id}`,
        );

        globalThis.dispatchEvent(
          new CustomEvent('GEMINI_NOTEBOOK_CREATED', {
            detail: {
              id,
              name: i18n.t('notebooks.untitledNotebook'),
              originalUrl: url,
            },
          }),
        );
      } catch {
        // ignore individual payload errors
      }
    }
  } catch (e) {
    console.error(
      'Better Sidebar (Gemini): Error handling create notebook response',
      e,
    );
  }
}
