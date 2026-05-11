import { parseResponsePayloads } from '../lib/response-parser';
import { parseBatchExecuteRequest } from '../lib/request-parser';
import i18n from '@/locale/i18n';

/**
 * Extracts the notebook name from the request body of an `oMH3Zd` call.
 *
 * Request format (batchexecute):
 * ```
 * [[["oMH3Zd","[[\"<name>\",\"\",null,...]]",null,"generic"]]]
 * ```
 * The inner JSON payload at [0][0] holds the notebook name.
 */
function extractNotebookNameFromRequest(requestBody: any): string | null {
  try {
    let body = requestBody;
    if (typeof body !== 'string') {
      body = JSON.stringify(body);
    }

    const parsed = parseBatchExecuteRequest(body);
    if (!parsed) return null;

    // parsed = [[["oMH3Zd", "<inner-json-string>", null, "generic"]]]
    const rpcEntry = parsed?.[0]?.[0];
    if (!Array.isArray(rpcEntry)) return null;

    const innerJsonStr = rpcEntry[1];
    if (typeof innerJsonStr !== 'string') return null;

    const innerPayload = JSON.parse(innerJsonStr);
    // innerPayload = [["test5", "", null, ...]]
    const name = innerPayload?.[0]?.[0];
    return typeof name === 'string' && name ? name : null;
  } catch {
    return null;
  }
}

/**
 * rpcid `oMH3Zd` — notebook creation.
 * Parsed response payload: ["notebooks/<uuid>", true]
 * Notebook name is extracted from the request body.
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

  // Extract notebook name from the request parameters
  const notebookName = extractNotebookNameFromRequest(response.config.body);

  try {
    const payloads = parseResponsePayloads(responseBody);

    for (const payload of payloads) {
      try {
        const raw = payload?.[0]; // "notebooks/<uuid>"
        if (typeof raw !== 'string' || !raw.startsWith('notebooks/')) continue;

        const id = raw.slice('notebooks/'.length);
        const name = notebookName || i18n.t('notebooks.untitledNotebook');

        console.log(
          `Better Sidebar (Gemini): Detected notebook creation: ${id} - ${name}`,
        );

        globalThis.dispatchEvent(
          new CustomEvent('GEMINI_NOTEBOOK_CREATED', {
            detail: {
              id,
              name,
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
