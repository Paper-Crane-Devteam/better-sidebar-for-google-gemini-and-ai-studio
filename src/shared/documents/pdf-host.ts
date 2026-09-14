/** PDF.js needs a DOM host; Chrome offscreen and Firefox background pages provide it. */
import './pdf';
import { runDocRequest } from './engine';
import type { DocRequest, DocResult } from './types';

let queue: Promise<unknown> = Promise.resolve();
export function runPdfRequest(workspaceId: string, request: DocRequest): Promise<DocResult> {
  const result = queue.then(() => runDocRequest({ workspaceId }, request));
  queue = result.catch(() => undefined);
  return result;
}
export async function dispatchPdf(id: string, payload: { workspaceId: string; request: DocRequest }) {
  try {
    const data = await runPdfRequest(payload.workspaceId, payload.request);
    await browser.runtime.sendMessage({ type: 'DOC_RESPONSE', payload: { id, success: true, data } });
  } catch (error) {
    await browser.runtime.sendMessage({ type: 'DOC_RESPONSE', payload: {
      id, success: false, error: (error as Error).message,
    } });
  }
}
