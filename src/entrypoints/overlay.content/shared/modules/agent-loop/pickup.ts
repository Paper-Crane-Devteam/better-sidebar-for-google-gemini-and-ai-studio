/**
 * Auto-pickup — running tool calls the user never asked us to run.
 *
 * The situation: a task finished, the user carried on typing in the same chat instead of
 * retyping `>`, and the AI answered in tool format anyway because it still remembers the
 * system prompt. Nobody is watching that response, so without this it just sits there —
 * the user sees an answer full of tool calls, no cards, no dock, and nothing happening.
 *
 * Shared between platforms on purpose. Every guard below is scar tissue from a specific
 * incident, and a second copy is a second place to relearn all of them; the AI Studio
 * feature went without pickup entirely at first and reproduced the original bug exactly.
 * The only platform-specific part is *how you read the newest model turn*, which the
 * caller supplies.
 */

import { useEffect, useRef } from 'react';
import { AgentLoopEngine, setActiveEngine } from './engine';
import type { AgentPlatformAdapter } from './adapters/types';
import { useAgentLoopStore } from './agent-loop-store';
import { useAgentRecordStore } from './agent-record-store';
import {
  buildToolCallFingerprint,
  buildToolCallKey,
  getToolRisk,
} from './execution-policy';
import { hasUnrunToolWork } from './renderer/helpers/session-end';
import { resolveAgentForRecoveredSession } from './conversation-agent';
import type { AgentId } from './agents/types';
import type { DisplayMessageTurn } from './renderer/useConversationMessages';
import { isSyncRunActive } from './tools/sync';
import { readConversationIdFromPath } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';
import { retireOnboardingHint } from '@/shared/lib/onboarding-store';

/**
 * What pickup needs to know about the newest model turn.
 *
 * A subset of `DisplayMessageTurn` rather than the whole thing, so a platform that can't
 * produce the full conversation can still take part. AI Studio can't: its turns are
 * virtualised, so only the ones near the viewport have any content — but the *newest*
 * turn is exactly the one auto-scroll keeps on screen, which is all pickup ever looks at.
 */
export type PickupTurn = Pick<
  DisplayMessageTurn,
  'id' | 'role' | 'toolCalls' | 'toolOutcomes' | 'isStreaming'
>;

export interface PickupPlan {
  /** Latch value the caller stores, so the same response cannot fire twice */
  key: string;
  /** The conversation the new session must bind to */
  conversationId: string | null;
  /**
   * The agent the new session must run as, read off the calls being picked up.
   *
   * ⚠️ Not optional bookkeeping. A picked-up session starts from nothing — after a
   * reload the store's `activeAgentId` is back at the default — so leaving this out ran
   * every picked-up response as Better Sidebar. A Workspace task interrupted mid-round
   * came back to `ERROR: "glob_files" is not available to the Better Sidebar agent`, on
   * a tool the previous round had used successfully.
   *
   * Undefined only when the conversation carries no agent marker *and* the calls name no
   * agent-owned tool, which leaves the engine's own default in place rather than guessing.
   */
  agentId: AgentId | undefined;
}

export interface PickupInput {
  /** Has the ledger for the open conversation finished loading? */
  recordsReady: boolean;
  /** Conversation id to fall back on when the URL can't be read */
  fallbackConversationId: string | null;
  /** The key of the response we last picked up, or null */
  alreadyPickedKey: string | null;
}

/**
 * Decide whether `turn` should be picked up, and under which key.
 *
 * Pure, and separate from the hook, because this is the part worth reading and worth
 * testing: every `return null` below is a rule, and the reasons are not guessable from
 * the code.
 */
export function planPickup(
  turn: PickupTurn | undefined,
  { recordsReady, fallbackConversationId, alreadyPickedKey }: PickupInput,
): PickupPlan | null {
  if (useAgentLoopStore.getState().status !== 'idle') return null;

  /**
   * The ledger decides whether these calls already ran, so nothing may be picked up
   * until it is here.
   *
   * Reading the database is a round trip through the worker, and the caller's effect is
   * driven by the DOM — which is ready first. Without this gate the write guard below
   * reads an empty ledger on the very render where it matters most, and re-executes the
   * calls it exists to protect.
   */
  if (!recordsReady) return null;

  if (!turn || turn.role !== 'model') return null;
  if (turn.toolCalls.length === 0) return null;
  // Still streaming — wait for it to finish
  if (turn.isStreaming) return null;

  // If any outcome is already known (from the next user message), it's history
  if (turn.toolOutcomes.some((o) => o !== null)) return null;

  /**
   * Is there anything here worth running?
   *
   * Judged per call rather than per turn — `complete_task` and handoff tools are never
   * work, and a turn that mixes real statements with a completion (the AI's favourite
   * shape) still owes the statements. See `hasUnrunToolWork`.
   */
  if (!hasUnrunToolWork(turn)) return null;

  /**
   * A sync run is driving the tab — none of these conversations were opened by the user,
   * so none of them is a follow-up.
   *
   * Pickup's whole premise is "the user kept talking and nobody ran the tools". A run
   * walks the tab through up to fifty conversations, and any one of them can end with
   * agent tool calls that were never reported back (a task the user stopped, say).
   * Without this the run's own navigation looks like fifty follow-ups: pickup starts a
   * session, executes the calls, and posts the results into a chat the user never
   * opened — then the run navigates away, leaving that session parked in a conversation
   * whose Dock won't even render (`belongsToCurrent`), so nothing on screen can stop it
   * and the tab refuses to start any new task until a reload.
   */
  if (isSyncRunActive()) return null;

  /**
   * Bind to the conversation the response is actually in, read from the URL *now*.
   *
   * The caller's own conversation id follows a 500ms poll (`useUrl`) while this runs off
   * the DOM — so on a router navigation the two disagree for a moment. Binding a session
   * to the previous conversation's id hides the dock outright (`belongsToCurrent`),
   * leaving the engine parked on an approval with no way on screen to answer it.
   */
  const conversationId = readConversationIdFromPath() ?? fallbackConversationId;

  /**
   * Keyed as `conversation:turn:toolcalls`, rather than a bare "already fired" boolean.
   *
   * That is the whole point: the feature is never torn down any more (conversations are
   * switched through the platform's router, not a page load), so a boolean latch set
   * once — on a response we then declined to run, or on one in some other conversation —
   * stayed set for the life of the tab and quietly disabled pickup for every response
   * after it. The user's next message got an answer full of tool calls that nothing ever
   * executed.
   *
   * A key re-arms by itself for a genuinely different response, while still refusing to
   * fire twice on the same one.
   */
  const key = [
    conversationId ?? 'unbound',
    turn.id,
    ...turn.toolCalls.map((tc) => buildToolCallFingerprint(tc.toolCall)),
  ].join('|');
  if (alreadyPickedKey === key) return null;

  /**
   * Has a *write* in this response already been through the ledger? Then stop.
   *
   * This is the guard the whole ledger exists for. Everything above reads the page, and
   * after a reload the page looks identical whether a call ran or not: the tool calls are
   * there, no results follow them, `executedCalls` is empty. So pickup used to
   * re-execute — and for a write, that is the same statement applied twice. Worse, the
   * second run asks for approval again, on a statement the user just approved, so the
   * interface actively invites the duplicate. What those results need is delivering,
   * which the dock offers separately (see `owed`); re-running is never the recovery.
   *
   * ⚠️ Writes only, and the narrowing is the point. Identity is name-plus-params, so an
   * ordinary repeated question — "show me the biggest chats again" — produces
   * byte-identical SQL to one the conversation already ran, and the guard read that as
   * the double-write it is here to stop. The response was skipped whole: statements never
   * ran, no results, nothing sent, and the transcript closed with a tick. On a follow-up
   * after a finished task this was easy to hit, because the AI naturally reaches for the
   * query it just used.
   *
   * Re-running a read costs a query and can't corrupt anything, so it is the cheaper
   * mistake by a wide margin. A write still gets the full stop, matched per call rather
   * than per response — one recorded write disqualifies the response, since pickup
   * replays it as a unit and cannot leave that one statement out.
   *
   * Both ledgers are consulted the same way: the live store first-hand for this tab, the
   * stored rows for everything before the last reload.
   */
  const executed = useAgentLoopStore.getState().executedCalls;
  const recorded = useAgentRecordStore.getState().records;
  const writeAlreadyRan = turn.toolCalls.some((tc) => {
    if (getToolRisk(tc.toolCall) !== 'write') return false;
    return (
      executed[buildToolCallFingerprint(tc.toolCall)] !== undefined ||
      recorded[buildToolCallKey(tc.toolCall)] !== undefined
    );
  });
  if (writeAlreadyRan) {
    console.log('[AgentLoop] Auto-pickup skipped: a write in this response is already in the ledger');
    return null;
  }

  /**
   * Which agent this session runs as — recovered, because the store's copy went with
   * the reload. See `resolveAgentForRecoveredSession` for where the answer comes from
   * and why the transcript outranks the tool names.
   */
  const agentId = resolveAgentForRecoveredSession(
    turn.toolCalls.map((tc) => tc.toolCall.name),
  );

  return { key, conversationId, agentId };
}

export interface UseAutoPickupOptions extends Omit<PickupInput, 'alreadyPickedKey'> {
  /**
   * The newest model turn, or undefined when there is none worth considering.
   *
   * ⚠️ Must be referentially stable while the turn is unchanged. This drives an effect,
   * and a fresh object on every poll would re-run the guards several times a second.
   */
  turn: PickupTurn | undefined;
  getAdapter: () => AgentPlatformAdapter | null;
  /** Hand the started engine back, so the feature can hold the handle it owns */
  onEngineStarted: (engine: AgentLoopEngine) => void;
}

/** Watch the newest model turn and start a follow-up session when it holds unrun work. */
export function useAutoPickup({
  turn,
  recordsReady,
  fallbackConversationId,
  getAdapter,
  onEngineStarted,
}: UseAutoPickupOptions): void {
  const pickedUpKeyRef = useRef<string | null>(null);

  // Kept in refs so the effect can depend on the turn alone — a new callback identity
  // per render must not re-run a decision that is about the page, not about React.
  const getAdapterRef = useRef(getAdapter);
  getAdapterRef.current = getAdapter;
  const onEngineStartedRef = useRef(onEngineStarted);
  onEngineStartedRef.current = onEngineStarted;
  const fallbackIdRef = useRef(fallbackConversationId);
  fallbackIdRef.current = fallbackConversationId;

  useEffect(() => {
    const plan = planPickup(turn, {
      recordsReady,
      fallbackConversationId: fallbackIdRef.current,
      alreadyPickedKey: pickedUpKeyRef.current,
    });
    if (!plan) return;

    // We need the actual DOM element to pass to the engine
    const adapter = getAdapterRef.current();
    if (!adapter) return;
    const responseElement = adapter.getLastAIResponseElement();
    if (!responseElement) return;

    pickedUpKeyRef.current = plan.key;

    // The user just did the thing the end-of-task hint exists to teach — carried on
    // talking instead of retyping `>`. Nothing left to explain, so it stops appearing.
    retireOnboardingHint('agentContinueAfterEnd');

    console.log('[AgentLoop] Auto-pickup: detected unexecuted tool calls in idle state, starting session');

    const engine = new AgentLoopEngine(adapter);
    onEngineStartedRef.current(engine);
    setActiveEngine(engine);
    engine.startFromExistingResponse(responseElement, 20, {
      conversationId: plan.conversationId,
      title: 'Follow-up task',
      // The tool layer reads this to decide what this session is allowed to run. See
      // `PickupPlan.agentId` for what happens when it is left out.
      agentId: plan.agentId,
    });
  }, [turn, recordsReady]);
}
