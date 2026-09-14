/**
 * Which workspace a conversation is bound to.
 *
 * A conversation is free to pick a workspace right up until it uses one. The first
 * workspace tool call that actually runs binds it, and from then on every file
 * operation in that conversation goes to the same place — switching means a new chat.
 *
 * ## Why lock at all
 *
 * The agent is never told which workspace it is in; `notes/plan.md` simply resolves
 * inside whichever one is bound. That only holds if the answer cannot change
 * mid-conversation. Without the lock, switching would leave the transcript describing
 * files that are no longer reachable — the agent reads its own earlier message saying
 * it wrote `plan.md`, calls `read_file`, and is told the file does not exist.
 *
 * ## Why bind on success rather than on selection
 *
 * Selecting a workspace and then closing the sidebar should leave no trace, and a
 * refused call did not happen. Binding on the first call that ran puts the lock exactly
 * where the transcript starts depending on it.
 */

import { create } from 'zustand';
import { getActiveWorkspaceId } from './workspace-store';

/**
 * Known bindings, keyed by conversation.
 *
 * A zustand store rather than a bare Map because the switcher renders from it: a Map
 * mutation is invisible to React, so the control would keep offering a dropdown for a
 * conversation that had just locked itself. Also a cache — the binding is immutable
 * once set, so a hit can never be stale, which keeps a SQL round trip off the front of
 * every file read.
 */
interface BindingState {
  /** conversationId → workspaceId. Absent means "not looked up or not bound". */
  bindings: Record<string, string>;
  set: (conversationId: string, workspaceId: string) => void;
  forget: (conversationId: string) => void;
}

const useBindingStore = create<BindingState>((set) => ({
  bindings: {},
  set: (conversationId, workspaceId) =>
    set((s) =>
      // Write-once, mirroring the SQL. Re-binding here would let a race between two
      // tool calls disagree with the row that was actually kept.
      s.bindings[conversationId]
        ? s
        : { bindings: { ...s.bindings, [conversationId]: workspaceId } },
    ),
  forget: (conversationId) =>
    set((s) => {
      const next = { ...s.bindings };
      delete next[conversationId];
      return { bindings: next };
    }),
}));

/** Read the binding for a conversation, or null if it has not used a workspace yet. */
export async function getBoundWorkspaceId(
  conversationId: string | null,
): Promise<string | null> {
  if (!conversationId) return null;

  const cached = useBindingStore.getState().bindings[conversationId];
  if (cached) return cached;

  try {
    const response = await browser.runtime.sendMessage({
      type: 'AGENT_LEDGER',
      payload: { op: 'boundWorkspace', conversationId },
    });

    const bound: string | null = response?.data ?? null;
    if (bound) useBindingStore.getState().set(conversationId, bound);
    return bound;
  } catch {
    // A failed lookup must not block the tool call. Answering "unbound" runs the
    // operation in the selected workspace — the one the user is looking at.
    return null;
  }
}

/**
 * Which workspace this conversation's file operations belong in.
 *
 * The binding wins when there is one; otherwise it is whatever the switcher shows.
 */
export async function resolveWorkspaceId(
  conversationId: string | null,
): Promise<string> {
  return (await getBoundWorkspaceId(conversationId)) ?? getActiveWorkspaceId();
}

/**
 * Record that this session used a workspace, locking the conversation to it.
 *
 * Best-effort, in line with the rest of the ledger: losing the row costs the lock, not
 * the call that just succeeded. The SQL is `WHERE workspace_id IS NULL`, so a second
 * attempt cannot move an existing binding.
 */
export async function bindConversation(
  sessionId: string,
  conversationId: string | null,
  workspaceId: string,
): Promise<void> {
  if (conversationId && useBindingStore.getState().bindings[conversationId]) return;

  try {
    await browser.runtime.sendMessage({
      type: 'AGENT_LEDGER',
      payload: { op: 'sessionBindWorkspace', sessionId, workspaceId },
    });
    if (conversationId) useBindingStore.getState().set(conversationId, workspaceId);
  } catch {
    // The next call tries again; until then the conversation follows the switcher.
  }
}

/**
 * The workspace this conversation is locked to, as a hook. Null means free to change.
 *
 * Reads only the cache — `primeBinding` is what fills it. A hook cannot await, and
 * returning a stale "unlocked" for one render is the wrong answer to show on a control
 * that decides whether the user may switch.
 */
export function useBoundWorkspaceId(conversationId: string | null): string | null {
  return useBindingStore((s) =>
    conversationId ? (s.bindings[conversationId] ?? null) : null,
  );
}

/** Warm the cache so the switcher can render its locked state on first paint. */
export async function primeBinding(conversationId: string | null): Promise<void> {
  await getBoundWorkspaceId(conversationId);
}

/** Forget a cached binding — for a workspace deleted out from under it. */
export function forgetBinding(conversationId: string): void {
  useBindingStore.getState().forget(conversationId);
}
