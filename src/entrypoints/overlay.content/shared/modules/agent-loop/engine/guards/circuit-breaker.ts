/**
 * Circuit Breaker for Agent Loop.
 *
 * Provides multi-layer protection against stuck loops:
 *
 * 1. **Loop Detection** — Detects when AI calls the same tool with identical
 *    params repeatedly (soft warning at 3, hard stop at 5).
 *
 * 2. **Consecutive Failure Tracking** — Counts failing *rounds* in a row (not
 *    individual calls) and escalates from retry → warning → forced pause.
 *
 * 3. **Format Retry Budget** — One second chance per session for a response that
 *    tried to call a tool and produced something unparseable.
 *
 * Inspired by Cline's loop-detection.ts and TaskState patterns.
 */

import { agentEventBus } from '../../event-bus';
import { identityParams } from '../parser/tool-schema';

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** Soft threshold: inject a warning giving the AI one chance to self-correct */
export const LOOP_SOFT_THRESHOLD = 3;
/** Hard threshold: force stop the loop */
export const LOOP_HARD_THRESHOLD = 5;

/**
 * Consecutive failing **rounds** before escalating.
 *
 * Rounds, not calls: a response may carry up to five statements, and if the AI has
 * guessed a column name wrong they all fail together — one mistake, five errors. The
 * AI hasn't had a chance to react to any of them yet, so counting them separately
 * punished a single misunderstanding. Four calls in one response used to trip the
 * hard stop on round 1.
 *
 * Six gives five rounds of escalating hints before giving up, so the guidance in
 * `getProgressiveErrorGuidance` actually gets a chance to land.
 */
export const FAILURE_SOFT_THRESHOLD = 2;
export const FAILURE_HARD_THRESHOLD = 6;

/**
 * How many format accidents get a second chance per session.
 *
 * One. A response cut off mid tool call, or a tool block whose JSON won't parse, is
 * worth re-asking for once — it is usually a truncated stream rather than a model
 * that misunderstood. Past that, re-sending the same instruction is just burning
 * rounds, so the session ends and the user decides.
 */
export const FORMAT_RETRY_BUDGET = 1;

// ─── State ───────────────────────────────────────────────────────────────────

export interface CircuitBreakerState {
  // Loop detection
  lastToolName: string;
  lastToolParams: string;
  consecutiveIdenticalCount: number;

  // Failure tracking — counted per round, see FAILURE_HARD_THRESHOLD
  /** Rounds in a row that produced at least one failing tool call */
  consecutiveFailedRounds: number;
  /** Every failing call, for reporting only */
  totalFailures: number;
  /** Whether the round in progress has already been counted */
  roundFailureCounted: boolean;

  /** Malformed tool blocks nudged about so far this session */
  formatRetries: number;
}

function createInitialState(): CircuitBreakerState {
  return {
    lastToolName: '',
    lastToolParams: '',
    consecutiveIdenticalCount: 0,
    consecutiveFailedRounds: 0,
    totalFailures: 0,
    roundFailureCounted: false,
    formatRetries: 0,
  };
}

// ─── Result Types ────────────────────────────────────────────────────────────

export type LoopCheckResult =
  | { action: 'ok' }
  | { action: 'warn'; message: string; count: number }
  | { action: 'stop'; message: string; count: number };

export type FailureCheckResult =
  | { action: 'retry'; message: string; count: number }
  | { action: 'warn'; message: string; count: number }
  | { action: 'stop'; message: string; count: number };

// ─── Circuit Breaker Class ───────────────────────────────────────────────────

export class CircuitBreaker {
  private state: CircuitBreakerState;

  constructor() {
    this.state = createInitialState();
  }

  /**
   * Compute a canonical signature for a tool call's params.
   * Ignores key order to prevent false negatives.
   *
   * ⚠️ Also ignores the human-facing params (`change_summary`). Those are prose the AI
   * rewrites freely, so counting them would let an AI re-issuing one broken statement
   * slip past this check simply by rephrasing its explanation — which is precisely the
   * situation the check exists for.
   */
  private toolCallSignature(params: Record<string, string>): string {
    const source = identityParams(params);
    const keys = Object.keys(source).sort();
    return JSON.stringify(source, keys);
  }

  /**
   * Check for repeated identical tool calls BEFORE executing.
   * Must be called before each tool execution.
   */
  checkRepeatedToolCall(toolName: string, params: Record<string, string>): LoopCheckResult {
    const signature = this.toolCallSignature(params);

    if (toolName === this.state.lastToolName && signature === this.state.lastToolParams) {
      this.state.consecutiveIdenticalCount++;
    } else {
      this.state.consecutiveIdenticalCount = 1;
    }

    this.state.lastToolName = toolName;
    this.state.lastToolParams = signature;

    const count = this.state.consecutiveIdenticalCount;
    const soft = LOOP_SOFT_THRESHOLD;
    const hard = LOOP_HARD_THRESHOLD;

    if (count >= hard) {
      const message =
        `[CIRCUIT BREAKER] Tool "${toolName}" called ${count} times with identical arguments. ` +
        `Loop detected — stopping execution. The AI appears stuck in a repetitive pattern.`;

      agentEventBus.emit('circuit-breaker:loop-detected', {
        toolName,
        count,
        action: 'stop',
      });

      return { action: 'stop', message, count };
    }

    if (count >= soft) {
      const message =
        `[WARNING] Tool "${toolName}" has been called ${count} times with identical arguments. ` +
        `This is not making progress. Please try a different approach or different arguments.`;

      agentEventBus.emit('circuit-breaker:loop-detected', {
        toolName,
        count,
        action: 'warn',
      });

      return { action: 'warn', message, count };
    }

    return { action: 'ok' };
  }

  /**
   * Start of a round — lets the next failure count against the budget again.
   * Called by stage ③ before it executes anything.
   */
  beginRound(): void {
    this.state.roundFailureCounted = false;
  }

  /**
   * Record a tool execution result. Call after each tool completes.
   * Returns escalation advice once consecutive failing rounds cross a threshold.
   *
   * Only the **first** failure of a round moves the counter. The rest of that
   * response is the same mistake seen several times over — the AI has had no chance
   * to read any of it yet, so charging it per call meant one wrong column name in a
   * five-statement response could exhaust the whole budget at once.
   */
  recordToolResult(toolName: string, success: boolean, errorMessage?: string): FailureCheckResult | null {
    if (success) {
      this.state.consecutiveFailedRounds = 0;
      // Also clears the round mark, so a later failure in this same round still
      // registers instead of being swallowed as "already counted".
      this.state.roundFailureCounted = false;
      return null;
    }

    this.state.totalFailures++;

    if (!this.state.roundFailureCounted) {
      this.state.roundFailureCounted = true;
      this.state.consecutiveFailedRounds++;
    }

    const count = this.state.consecutiveFailedRounds;

    agentEventBus.emit('circuit-breaker:failure-recorded', {
      toolName,
      consecutiveCount: count,
      totalCount: this.state.totalFailures,
      errorMessage,
    });

    if (count >= FAILURE_HARD_THRESHOLD) {
      return {
        action: 'stop',
        message:
          `[CIRCUIT BREAKER] ${count} responses in a row have failed. The AI cannot recover from this ` +
          `error pattern. Pausing execution — please review the error and provide guidance.`,
        count,
      };
    }

    if (count >= FAILURE_SOFT_THRESHOLD) {
      return {
        action: 'warn',
        message:
          `[WARNING] ${count} responses in a row have failed. ` +
          `You've tried this approach multiple times without success. ` +
          `Try a fundamentally different approach: check the schema with SELECT, use simpler queries, or explain the problem to the user.`,
        count,
      };
    }

    return {
      action: 'retry',
      message: `Tool execution failed. Analyze the error and try a corrected approach.`,
      count,
    };
  }

  /**
   * Claim one of the session's format retries. False when the budget is spent.
   *
   * Only called for a response that *tried* to call a tool and produced something
   * unusable — a block cut off mid-stream, or JSON that won't parse. A response that
   * simply contains no tool call at all is not a format accident and gets no retry:
   * the engine ends the session, because Gemini won't speak again unless we send
   * something, and nudging an AI that has drifted into prose mostly teaches it to
   * guess.
   */
  claimFormatRetry(): boolean {
    if (this.state.formatRetries >= FORMAT_RETRY_BUDGET) return false;
    this.state.formatRetries++;
    agentEventBus.emit('circuit-breaker:format-retry', { count: this.state.formatRetries });
    return true;
  }

  /**
   * The nudge sent after claiming a retry.
   *
   * Truncation gets its own wording on purpose: told "you forgot the tool format",
   * the AI restarts its whole response, which burns a round and can repeat work it
   * had already emitted. Told "you were cut off", it re-sends only the tail.
   */
  getFormatGuidance(kind: 'truncated' | 'unparseable', errors: string[] = []): string {
    if (kind === 'truncated') {
      return (
        `[System] Your last response ended inside an unclosed <bs_agent_tool> block, so it was cut off ` +
        `before the tool call was complete. Nothing from that block was executed. ` +
        `Re-send only the tool calls that were incomplete, and keep the response short enough to finish — ` +
        `emit fewer calls per response if needed.`
      );
    }

    const detail = errors.length > 0 ? `\n\n## Parse Errors\n\n${errors.map((e) => `- ${e}`).join('\n')}` : '';

    return (
      `[System] Your last response contained <bs_agent_tool> blocks that could not be parsed, so nothing ` +
      `was executed. Re-send them as valid JSON with "name", "description" and "params" fields.${detail}`
    );
  }

  /**
   * Escalating hints appended to a failing tool's result.
   *
   * ⚠️ The hint has to match the tool that failed. This used to be SQL-only advice
   * given to every tool, so a `doc_read` on an unsupported `.doc` came back with
   * "double-check table and column names against the schema", and a third failure
   * escalated to "run SELECT name FROM sqlite_master" — actively steering the model
   * away from the file it was asked to open. A hint about the wrong subsystem is
   * worse than no hint: the model follows it.
   */
  getProgressiveErrorGuidance(baseError: string, toolName?: string): string {
    const count = this.state.consecutiveFailedRounds;
    const hints = hintsFor(toolName);

    if (count >= 3) {
      return (
        `${baseError}\n\n` +
        `CRITICAL: ${count} of your responses in a row have failed. You MUST change your approach:\n` +
        hints.critical.map((line, i) => `${i + 1}. ${line}`).join('\n') +
        `\n${hints.critical.length + 1}. If still stuck, explain the problem to the user`
      );
    }

    if (count >= 2) {
      return (
        `${baseError}\n\n` +
        `This is the ${count}th response in a row that has failed. Consider:\n` +
        hints.consider.map((line) => `- ${line}`).join('\n')
      );
    }

    return `${baseError}\n\nSuggestion: ${hints.first}`;
  }

  /** Get current state snapshot (for debugging / UI) */
  getState(): Readonly<CircuitBreakerState> {
    return { ...this.state };
  }

  /** Full reset (e.g., on new agent loop start) */
  reset(): void {
    this.state = createInitialState();
    agentEventBus.emit('circuit-breaker:reset', undefined);
  }
}
// ─── Retry hints, per tool family ────────────────────────────────────────────

/**
 * What to suggest at each escalation level.
 *
 * Grouped by *subsystem*, not by tool: the reason a `grep_files` and a `write_file`
 * fail is the same class of mistake (a path that isn't there), and splitting them
 * would mean maintaining a paragraph per tool for no gain.
 *
 * Tools not listed here fall through to `GENERIC`, which is deliberately vague —
 * a wrong-but-specific hint is the failure mode this whole table exists to prevent.
 */
interface RetryHints {
  /** One line, appended to the first failure. */
  first: string;
  /** Bullet list, for the second failing round in a row. */
  consider: string[];
  /** Numbered steps, for the third. "Explain it to the user" is appended after these. */
  critical: string[];
}

const SQL_HINTS: RetryHints = {
  first: 'Double-check table and column names against the schema.',
  consider: [
    'Are table/column names correct? Query sqlite_master to verify.',
    'Is the SQL syntax valid for SQLite?',
    'Try a simpler query first to confirm data exists.',
  ],
  critical: [
    'Run "SELECT name FROM sqlite_master WHERE type=\'table\'" to verify table names',
    'PRAGMA is blocked — use "SELECT sql FROM sqlite_master WHERE name=\'table_name\'" for columns',
    'Break your operation into smaller, simpler steps',
  ],
};

const WORKSPACE_HINTS: RetryHints = {
  first: 'Confirm the path exists — list_files with no argument shows the workspace root.',
  consider: [
    'Does the path exist? Run list_files, or glob_files with a pattern, instead of assuming it.',
    'For edit_file, old_string must match the most recent read_file output character for character, indentation included.',
    'If old_string matched more than once, add surrounding lines rather than reaching for replace_all.',
  ],
  critical: [
    'Run "list_files" with no path to see what is actually in the workspace',
    'Re-read the file with read_file and copy old_string from that output, not from memory',
    'Narrow the work: one file, one edit, and check the result before the next one',
  ],
};

const DOCUMENT_HINTS: RetryHints = {
  first: 'Call doc_read with only a path first — the outline names the ranges and ids you can use.',
  consider: [
    'Is the format supported? Legacy .doc/.xls/.ppt are not; the file has to be saved as .docx first.',
    'Quote old_text exactly from the most recent doc_read output. Paragraph ids shift after any insert or delete.',
    'Filling a blank table cell is set_text with the cell id ("t3r2c1"), not replace_text on the cell beside it.',
    'Text you cannot find in the body may be in a header or a footnote — doc_read mode="search" covers those.',
    'Activate the builtin-docx-review skill — it holds the doc_edit operation list the schema does not.',
  ],
  critical: [
    'Run doc_read with just the path and read the warnings, not only the outline',
    'Re-read the range you are editing and copy old_text from that output verbatim',
    'If the format itself is unsupported, say so and stop retrying — no parameter change will fix it',
  ],
};

const GENERIC_HINTS: RetryHints = {
  first: 'Read the error text above — it names what was wrong with the call.',
  consider: [
    'What exactly did the error say? It usually names the parameter at fault.',
    'Are you assuming something you have not verified with a read-only call?',
    'Try the smallest version of this operation first.',
  ],
  critical: [
    'Stop repeating the call and re-read the error messages above',
    'Verify your assumptions with a read-only tool before writing anything',
    'Break the operation into smaller steps',
  ],
};

const HINTS_BY_TOOL: Record<string, RetryHints> = {
  execute_sql: SQL_HINTS,
  sync_conversation_messages: SQL_HINTS,
  export: SQL_HINTS,
  read_file: WORKSPACE_HINTS,
  write_file: WORKSPACE_HINTS,
  edit_file: WORKSPACE_HINTS,
  list_files: WORKSPACE_HINTS,
  glob_files: WORKSPACE_HINTS,
  grep_files: WORKSPACE_HINTS,
  manage_files: WORKSPACE_HINTS,
  doc_read: DOCUMENT_HINTS,
  doc_edit: DOCUMENT_HINTS,
};

function hintsFor(toolName?: string): RetryHints {
  return (toolName && HINTS_BY_TOOL[toolName]) || GENERIC_HINTS;
}
