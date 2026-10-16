/** Notebook RPCs: list (a `CNgdBe` variant, see `gems.ts`), create, rename, delete. */

import type { RpcCall } from '../lib/batchexecute';
import i18n from '@/locale/i18n-bundled';

const NOTEBOOK_PREFIX = 'notebooks/';

function notebookId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.startsWith(NOTEBOOK_PREFIX)
    ? raw.slice(NOTEBOOK_PREFIX.length)
    : null;
}

/**
 * Response `[_, _, [entry, …]]`, entry `["notebooks/<uuid>", [title, …13: [seconds, nanos]]]`.
 * Routed here by `gems.ts`, which owns the shared rpcid.
 */
export function handleNotebookList(call: RpcCall): void {
  const list = (call.response as any)?.[2];
  if (!Array.isArray(list)) return;

  const notebooks: { id: string; name: string; created_at?: number }[] = [];
  for (const entry of list) {
    const id = notebookId(entry?.[0]);
    if (!id) continue;
    const meta = entry?.[1];
    const title = meta?.[0];
    const createdAt = Array.isArray(meta?.[13]) ? meta[13][0] : undefined;
    notebooks.push({
      id,
      name: typeof title === 'string' && title ? title : i18n.t('notebooks.untitledNotebook'),
      created_at: typeof createdAt === 'number' ? createdAt : undefined,
    });
  }
  if (notebooks.length === 0) return;

  console.log(`Better Sidebar (Gemini): Detected notebook list with ${notebooks.length} items`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_NOTEBOOK_LIST_RESPONSE', {
      detail: { notebooks, originalUrl: call.url },
    }),
  );
}

/** `oMH3Zd` — request `[["<name>", …]]`, response `["notebooks/<uuid>", true]`. */
export function handleCreateNotebook(call: RpcCall): void {
  const id = notebookId((call.response as any)?.[0]);
  if (!id) return;
  const requested = (call.request as any)?.[0]?.[0];
  const name =
    typeof requested === 'string' && requested ? requested : i18n.t('notebooks.untitledNotebook');

  console.log(`Better Sidebar (Gemini): Detected notebook creation: ${id} - ${name}`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_NOTEBOOK_CREATED', { detail: { id, name, originalUrl: call.url } }),
  );
}

/** `kHv0Vd` — request `["notebooks/<uuid>", ["<new name>", …]]`. */
export function handleRenameNotebook(call: RpcCall): void {
  const req = call.request as any;
  const id = notebookId(req?.[0]);
  const newName = req?.[1]?.[0];
  if (!id || typeof newName !== 'string') return;

  console.log(`Better Sidebar (Gemini): Detected notebook rename: ${id} -> ${newName}`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_NOTEBOOK_RENAME', { detail: { id, newName, originalUrl: call.url } }),
  );
}

/** `Nwkn9` — request `["notebooks/<uuid>"]`. */
export function handleDeleteNotebook(call: RpcCall): void {
  const id = notebookId((call.request as any)?.[0]);
  if (!id) return;

  console.log(`Better Sidebar (Gemini): Detected notebook deletion: ${id}`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_NOTEBOOK_DELETE', { detail: { id, originalUrl: call.url } }),
  );
}
