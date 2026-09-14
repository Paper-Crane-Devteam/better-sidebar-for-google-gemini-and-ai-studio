/**
 * The agent tool call ledger, reached from the content script.
 *
 * The engine runs in a content script, and `@/shared/db` does not work there: its
 * `DB_REQUEST` reaches the offscreen document, but the `DB_RESPONSE` comes back over
 * `runtime.sendMessage`, which never lands in a content script. Calling the repos
 * directly from the engine therefore blocked every single tool call — including ones
 * that touch no data, like `activate_skill` — until the bridge's 30-second timeout.
 *
 * Going through the background also happens to be the only correct option: this is
 * where `ensureDbForTab` runs, so it is the only path that writes to the profile the
 * sending tab actually belongs to.
 *
 * Deliberately not folded into `EXECUTE_SQL`. That handler is the agent's own tool
 * surface — paywall checks, statement blocklist, undo snapshots — and our own
 * bookkeeping has no business being subject to any of it.
 */

import { agentSessionRepo, agentToolCallRepo } from '@/shared/db/operations';
import type { ExtensionMessage, ExtensionResponse } from '@/shared/types/messages';
import type { MessageSender } from '../types';

export async function handleAgentLedger(
  message: ExtensionMessage,
  _sender: MessageSender,
): Promise<ExtensionResponse | null> {
  if (message.type !== 'AGENT_LEDGER') return null;

  const payload = message.payload;

  try {
    switch (payload.op) {
      case 'sessionCreate':
        await agentSessionRepo.create(payload.session);
        return { success: true };

      case 'sessionClaim':
        await agentSessionRepo.claimConversation(payload.sessionId, payload.conversationId);
        return { success: true };

      case 'sessionEnd':
        await agentSessionRepo.end(payload.sessionId, payload.endReason, payload.rounds);
        return { success: true };

      case 'sessionBindWorkspace':
        await agentSessionRepo.bindWorkspace(payload.sessionId, payload.workspaceId);
        return { success: true };

      case 'boundWorkspace':
        return {
          success: true,
          data: await agentSessionRepo.boundWorkspace(payload.conversationId),
        };

      case 'callBegin':
        await agentToolCallRepo.begin(payload.call);
        return { success: true };

      case 'callSettle':
        await agentToolCallRepo.settle(payload.id, payload.status, payload.resultBody);
        return { success: true };

      case 'roundDelivered':
        await agentToolCallRepo.markRoundDelivered(payload.sessionId, payload.round);
        return { success: true };

      case 'sessionDiscardUndelivered':
        await agentToolCallRepo.discardSessionUndelivered(payload.sessionId);
        return { success: true };

      case 'markDelivered':
        await agentToolCallRepo.markDeliveredByIds(payload.ids);
        return { success: true };

      case 'listByConversation':
        return {
          success: true,
          data: await agentToolCallRepo.listByConversation(payload.conversationId),
        };

      case 'clearUndelivered':
        await agentToolCallRepo.clearUndelivered(payload.conversationId);
        return { success: true };

      default:
        return { success: false, error: 'Unknown agent ledger op' };
    }
  } catch (e: unknown) {
    // Reported rather than thrown; the caller treats a failed ledger write as
    // "no record" and carries on. Notably no `notifyDataUpdated()` — nothing in the
    // sidebar reads these tables, and firing it on every tool call would refresh the
    // whole UI several times per round.
    return { success: false, error: (e as Error).message };
  }
}
