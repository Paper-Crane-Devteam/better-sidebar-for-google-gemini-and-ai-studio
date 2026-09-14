/**
 * Agent Loop — shared types.
 * Platform-agnostic type definitions for the Agent Loop feature.
 */

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * Loop status.
 *
 * `awaiting_send` is a checkpoint rather than a fault, and the distinction from
 * `paused` is load-bearing for the UI: tool results are sitting in the editor
 * waiting to go back to the AI, either because the engine is about to click send
 * itself or because this round had something the user approved by hand.
 *
 * `paused` means something went wrong or the loop hit a guard (timeout,
 * breakpoint, circuit breaker, max rounds) and needs an explicit retry.
 */
export type AgentLoopStatus =
  | 'idle'
  | 'waiting_ai'
  | 'parsing'
  | 'executing'
  | 'awaiting_approval'
  | 'sending'
  | 'awaiting_send'
  | 'paused'
  | 'error';

// ─── Tool Calls ──────────────────────────────────────────────────────────────

export interface ParsedToolCall {
  name: string;
  /** Human-readable description of what this tool call does (shown to user) */
  description?: string;
  params: Record<string, string>;
}

export interface ParseResult {
  toolCalls: ParsedToolCall[];
  errors: string[];
}

/**
 * `timestamp` records ordering, not duration — the summary card walks history
 * backwards to find the last `complete_task`. Nothing measures elapsed time.
 */
export interface ToolCallResult {
  toolName: string;
  /**
   * The AI's own human-readable description of this step
   * ("Create folder Coding"). Preferred over `toolName` in the UI.
   */
  description?: string;
  success: boolean;
  result: string;
  timestamp: number;
}

/**
 * What became of a tool call in this session.
 *
 * Display only, now that the engine is the sole thing that executes: the card in the
 * chat uses it to show "ran" / "refused" instead of an actionable button. It used to
 * be a guard against the manual Run button repeating work the engine had done.
 */
export interface ExecutedCall {
  toolName: string;
  isWrite: boolean;
  success: boolean;
  /** True when the user refused it, as opposed to it running and failing */
  rejected?: boolean;
  timestamp: number;
  source: 'engine';
}

/**
 * Why a session ended — drives the completion card in the Agent tab.
 *
 * `infeasible` is not an error: the AI decided the request cannot be carried out
 * (missing data, no suitable tool) and said so through `complete_task`. Without a
 * reason of its own, that verdict used to fall into the no-tool-call path, where
 * the nudge pushed an AI that already knew better to keep guessing.
 */
/**
 * Why a session ended.
 *
 * Note there is no `max_rounds`: hitting the step limit is a check-in, not an end.
 * It pauses and asks whether to carry on, so it never produces an end reason —
 * announcing the session over is what made a routine pause read as a failure.
 */
export type AgentEndReason =
  | 'complete'
  | 'infeasible'
  | 'user_stop'
  | 'error'
  | 'circuit_breaker'
  | 'paywall'
  /**
   * The AI answered without calling a tool, so there is nothing to run and
   * nothing to send back. Gemini only speaks when spoken to, so continuing the
   * loop would mean waiting on a turn that is never coming — the session ends
   * here instead. Not an error: it usually means the model drifted into prose.
   */
  | 'no_tool_call';

/** How much of the request `complete_task` claims to have delivered */
export type TaskOutcome = 'success' | 'partial' | 'infeasible';

// ─── Built-in Prompts ────────────────────────────────────────────────────────

export interface BuiltInPrompt {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Returns the utility-specific prompt content (appended after base prompt) */
  getPromptContent: () => string;
}

// ─── Approval ────────────────────────────────────────────────────────────────

/**
 * What a tool call does, as far as the approval policy is concerned.
 *
 * - `read`    — looks at data
 * - `write`   — changes data
 * - `control` — steers the loop and touches nothing. `complete_task` is the whole
 *   category: it ends the session and that is all. There is no operation to allow
 *   or refuse, so it sits outside both auto-run switches rather than being filed
 *   under `read` and inheriting a gate that has nothing to gate.
 */
export type ToolRisk = 'read' | 'write' | 'control';

/**
 * How far an approval reaches.
 *
 * `round` exists because a response often carries several reads: approving five
 * SELECTs one at a time is the kind of friction that makes people switch the whole
 * safety net off.
 */
export type ApprovalScope = 'once' | 'round' | 'task';

/**
 * Answer to an approval request.
 *
 * The reason matters on a rejection: told only `CANCELLED:`, the AI's most likely
 * next move is to send the same statement again and trip the loop detector.
 */
export interface ApprovalDecision {
  approved: boolean;
  scope: ApprovalScope;
  /** Optional explanation, passed back to the AI when the user says no */
  reason?: string;
}

/**
 * A tool call waiting for the user's go-ahead.
 *
 * `fingerprint` is what lets the card in the chat know it is the one being asked
 * about — approval happens next to the call you are reading, not in a separate
 * dialog describing it second-hand.
 */
export interface PendingApproval {
  browserPlan?: import('@/shared/browser-agent/contracts').PlanPreview;
  fingerprint: string;
  toolName: string;
  description?: string;
  params: Record<string, string>;
  risk: ToolRisk;
  /** Calls left in this response, so "approve the rest" can say how many */
  remaining: number;
  resolve: (decision: ApprovalDecision) => void;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface AgentLoopSettings {
  /** Feature toggle */
  enabled: boolean;
  /** Whether non-SELECT operations require user confirmation */
  confirmWrites: boolean;
  /** Maximum loop rounds before auto-pause */
  maxRounds: number;
}

// ─── Trigger State ───────────────────────────────────────────────────────────
// See useAgentTrigger.ts → AgentTriggerPopupState
