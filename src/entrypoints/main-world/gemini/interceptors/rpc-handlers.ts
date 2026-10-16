/**
 * rpcid → handler. The only place that says which Gemini RPC means what.
 *
 * Transport does not appear here: XHR and fetch both reach these through
 * `observeBatchExecute`, so the next time Gemini changes how a request is sent the
 * handlers stay as they are.
 */

import { decodeBatchExecute, type RpcCall } from '../lib/batchexecute';
import { handleChatContent } from './chat-content';
import { handleListChat } from './list-chat';
import { handleBranchChat, handleDeleteChat, handleRenameChat } from './chat-actions';
import { handleDeleteGem, handleListRpc } from './gems';
import { handleCreateNotebook, handleDeleteNotebook, handleRenameNotebook } from './notebooks';

const RPC_HANDLERS: Record<string, (call: RpcCall) => void> = {
  hNvQHb: handleChatContent,
  MaZiqc: handleListChat,
  GzXR5e: handleDeleteChat,
  MUAZcd: handleRenameChat,
  KDNZr: handleBranchChat,
  CNgdBe: handleListRpc,
  UXcSJb: handleDeleteGem,
  oMH3Zd: handleCreateNotebook,
  kHv0Vd: handleRenameNotebook,
  Nwkn9: handleDeleteNotebook,
};

/** One finished batchexecute round trip, from whichever transport carried it. */
export function observeBatchExecute(input: {
  url: string;
  status: number;
  requestBody: unknown;
  responseText: string;
}): void {
  if (input.status !== 200) return;

  for (const call of decodeBatchExecute(input)) {
    const handler = RPC_HANDLERS[call.rpcid];
    if (!handler) continue;
    try {
      handler(call);
    } catch (e) {
      console.error(`Better Sidebar (Gemini): ${call.rpcid} handler failed`, e);
    }
  }
}
