/**
 * Tool Registry — routes a parsed tool call to the running agent's tools.
 *
 * ⚠️ **Scoped to the session's agent, and this is a real boundary rather than tidiness.**
 * The Workspace agent's prompt contains no database schema, so any `execute_sql` it produces
 * is invented against tables it has never seen — and it would be invented confidently,
 * because the model has no way to know the tool is out of scope. Refusing here means the
 * worst case is a wasted round instead of a wrong write to the user's data.
 *
 * The refusal text differs per reason on purpose. "Not available to this agent" tells the
 * model to stop and report; "the user turned it off" invites it to ask. Collapsing them into
 * one message had the agent retrying a tool it was never going to get.
 *
 * ⚠️ **One tool family does not arrive here at all: browser writes.** They are two calls with
 * a human in between (prepare → approve → commit), so the engine drives them directly and this
 * function never sees them. Their MCP entries still exist — that is what makes them ownable,
 * refusable and visible in the prompt — and their `execute` refuses, on the reasoning that
 * anything reaching it has bypassed the approval. See `tools/browser-tools.ts`.
 */

import type { ParsedToolCall } from '../types';
import { mcpRegistry } from '../mcp/registry';
import { getSkillById, getEnabledSkillsForAgent } from '../skills/skill-registry';
import { useAgentLoopStore } from '../agent-loop-store';
import { assembleSkillActivation } from '../prompts/prompt-assembler';
import { getAgent } from '../agents/registry';
import type { AgentId } from '../agents/types';

/**
 * Execute a parsed tool call and return the result string.
 *
 * Never throws. A tool that raises instead of returning `ERROR: ...` would otherwise unwind
 * the whole round: the exception reaches the engine's top-level catch, the session goes to
 * `error` with nothing staged, and Retry restarts a wait for a message that was never sent —
 * a hang, for what should have been one failed step. Turning it into an ordinary failed
 * result keeps the AI informed and the loop alive.
 */
export async function executeToolCall(toolCall: ParsedToolCall): Promise<string> {
  try {
    return await runToolCall(toolCall);
  } catch (e) {
    console.error(`[AgentLoop] Tool "${toolCall.name}" threw:`, e);
    return `ERROR: ${toolCall.name} failed unexpectedly - ${(e as Error)?.message ?? String(e)}`;
  }
}

async function runToolCall(toolCall: ParsedToolCall): Promise<string> {
  const agentId: AgentId = useAgentLoopStore.getState().activeAgentId;

  // ── 1. Meta-tool: activate_skill ─────────────────────────────────────
  if (toolCall.name === 'activate_skill') {
    return activateSkill(toolCall.params.skill_id, agentId);
  }

  // ── 2. Is this tool available to the running agent? ──────────────────
  const refusal = toolRefusal(toolCall.name);
  if (refusal) return refusal;

  // ── 3. Delegate to the MCP registry ──────────────────────────────────
  return mcpRegistry.execute(toolCall.name, toolCall.params, agentId);
}

/**
 * The refusal this call would get right now, or null if it may run.
 *
 * Exported for the browser writes, which the engine executes itself and which therefore never
 * reach `runToolCall`. Without this they would skip the ownership check entirely — a Better
 * Sidebar session that emitted `browser_close_tabs` would have gone straight to building an
 * approval plan for it. One function so the wording cannot drift between the two paths.
 */
export function toolRefusal(toolName: string): string | null {
  const agentId: AgentId = useAgentLoopStore.getState().activeAgentId;
  const reason = mcpRegistry.refusalReason(toolName, agentId);
  return reason ? describeRefusal(toolName, reason, agentId) : null;
}

function activateSkill(skillId: string | undefined, agentId: AgentId): string {
  if (!skillId) {
    return 'ERROR: activate_skill requires a "skill_id" parameter.';
  }

  const available = getEnabledSkillsForAgent(agentId);
  const skill = getSkillById(skillId);

  if (!skill) {
    const ids = available.map((s) => s.id).join(', ');
    return `ERROR: Skill "${skillId}" not found. Available skills: ${ids || 'none'}`;
  }

  /**
   * A skill that exists but belongs elsewhere.
   *
   * Worth its own message: the id is real, so "not found" would read as a typo and invite a
   * retry. What actually happened is that the user chose a different agent for this session.
   */
  if (skill.agentId !== agentId) {
    const owner = getAgent(skill.agentId);
    return (
      `ERROR: The skill "${skillId}" belongs to the ${owner.name} agent, not this one. ` +
      'Tell the user this task needs that agent, and stop.'
    );
  }

  if (!skill.enabled) {
    return `ERROR: The skill "${skillId}" is switched off in settings. Continue without it.`;
  }

  useAgentLoopStore.getState().setActiveSkillId(skillId);
  return assembleSkillActivation(skill);
}

function describeRefusal(
  toolName: string,
  reason: 'unknown' | 'other-agent' | 'disabled',
  agentId: AgentId,
): string {
  const agent = getAgent(agentId);

  switch (reason) {
    case 'unknown': {
      const available = mcpRegistry
        .getToolSchemasForAgent(agentId)
        .map((s) => s.name)
        .join(', ');
      return `ERROR: There is no tool called "${toolName}". Available: ${available}`;
    }
    case 'other-agent':
      // Not `CANCELLED:` — nothing was refused by the user. This is a scope mistake, and
      // the only useful next move is to stop and say so.
      return (
        `ERROR: "${toolName}" is not available to the ${agent.name} agent. ` +
        'Another agent has it. Do not try to work around this — tell the user which agent ' +
        'they need and end the task.'
      );
    case 'disabled':
      return `CANCELLED: "${toolName}" is switched off in the user's settings.`;
  }
}
