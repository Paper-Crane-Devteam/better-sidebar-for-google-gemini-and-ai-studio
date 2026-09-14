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
 */

import type { ParsedToolCall } from '../types';
import { mcpRegistry } from '../mcp/registry';
import { getSkillById, getEnabledSkillsForAgent } from '../skills/skill-registry';
import { useAgentLoopStore } from '../agent-loop-store';
import { assembleSkillActivation } from '../prompts/prompt-assembler';
import { getAgent } from '../agents/registry';
import type { AgentId } from '../agents/types';
import { isBrowserTool, isBrowserWrite } from '@/shared/browser-agent/contracts';
import { browserRequest } from '../../browser-agent/client';

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
  if (isBrowserTool(toolCall.name)) {
    if (agentId !== 'browser') return 'ERROR: Browser tools require a Browser Agent task.';
    if (isBrowserWrite(toolCall.name)) return 'ERROR: Browser writes require a prepared plan and explicit approval through the engine.';
    return JSON.stringify(await browserRequest({ action: 'read', tool: toolCall.name, params: toolCall.params }));
  }
  if (agentId === 'browser' && toolCall.name !== 'complete_task') return 'ERROR: Only browser tools and complete_task are available in Browser Agent.';

  // ── 1. Meta-tool: activate_skill ─────────────────────────────────────
  if (toolCall.name === 'activate_skill') {
    return activateSkill(toolCall.params.skill_id, agentId);
  }

  // ── 2. Is this tool available to the running agent? ──────────────────
  const refusal = mcpRegistry.refusalReason(toolCall.name, agentId);
  if (refusal) {
    return describeRefusal(toolCall.name, refusal, agentId);
  }

  // ── 3. Delegate to the MCP registry ──────────────────────────────────
  return mcpRegistry.execute(toolCall.name, toolCall.params, agentId);
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
