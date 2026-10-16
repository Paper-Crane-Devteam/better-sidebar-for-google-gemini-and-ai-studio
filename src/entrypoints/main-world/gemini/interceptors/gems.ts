/**
 * Gem RPCs, plus the routing for `CNgdBe`.
 *
 * `CNgdBe` is a generic "list my things" RPC. What it lists is chosen by the
 * *request*, so that is what routes it — reading the response shape to guess, as the
 * old handler did, reported every existing gem as newly created on every page load.
 * Observed on the 2026-10 web build:
 *
 *   [2, [lang], 0]               the user's own gems
 *   [1, [lang], 0]               recently used gems, premade ones included — ignored
 *   [2, [lang], 0, null, [2]]    notebooks
 *
 * Gem *creation* has no dedicated capture: the UI re-fetches the own-gems list after
 * creating one, and that list is upserted wholesale, so a new gem lands with it.
 */

import type { RpcCall } from '../lib/batchexecute';
import { handleNotebookList } from './notebooks';

const LIST_OWN = 2;
const LIST_KIND_NOTEBOOKS = 2;

export function handleListRpc(call: RpcCall): void {
  const req = call.request as any;
  if (!Array.isArray(req)) return;

  if (Array.isArray(req[4]) && req[4][0] === LIST_KIND_NOTEBOOKS) {
    handleNotebookList(call);
  } else if (req[0] === LIST_OWN && req[4] == null) {
    handleGemList(call);
  }
}

/** Response `[_, _, [gem, …]]`, gem `["<id>", ["<name>", "<description>", …], …]`. */
function handleGemList(call: RpcCall): void {
  const list = (call.response as any)?.[2];
  if (!Array.isArray(list)) return;

  const gems: { id: string; name: string; description?: string }[] = [];
  for (const entry of list) {
    const id = entry?.[0];
    const name = entry?.[1]?.[0];
    if (typeof id !== 'string' || !id || typeof name !== 'string') continue;
    const description = entry?.[1]?.[1];
    gems.push({
      id,
      name,
      description: typeof description === 'string' && description ? description : undefined,
    });
  }
  if (gems.length === 0) return;

  console.log(`Better Sidebar (Gemini): Parsed ${gems.length} gems`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_GEM_LIST_RESPONSE', { detail: { gems, originalUrl: call.url } }),
  );
}

/** `UXcSJb` — request `["<gem id>"]`. */
export function handleDeleteGem(call: RpcCall): void {
  const id = (call.request as any)?.[0];
  if (typeof id !== 'string' || !id) return;

  console.log(`Better Sidebar (Gemini): Detected gem deletion: ${id}`);
  globalThis.dispatchEvent(
    new CustomEvent('GEMINI_GEM_DELETE', { detail: { id, originalUrl: call.url } }),
  );
}
