/**
 * Tool Registry.
 * Routes parsed tool calls to MCP registry or handles meta-tools (activate_skill).
 * Replaces the old switch-case pattern with MCP provider delegation.
 */

import type { ParsedToolCall } from '../types';
import { isBrowserTool, isBrowserWrite } from '@/shared/browser-agent/contracts';
import { browserRequest, useBrowserAgent } from '../../browser-agent/client';
import { mcpRegistry } from '../mcp/registry';
import { getSkillById, getEnabledSkills } from '../skills/skill-registry';
import { useAgentLoopStore } from '../agent-loop-store';
import { assembleSkillActivation } from '../prompts/prompt-assembler';

/**
 * Execute a parsed tool call and return the result string.
 *
 * Never throws. A tool that raises instead of returning `ERROR: ...` would otherwise
 * unwind the whole round: the exception reaches the engine's top-level catch, the
 * session goes to `error` with nothing staged, and Retry restarts a wait for a
 * message that was never sent — a hang, for what should have been one failed step.
 * Turning it into an ordinary failed result keeps the AI informed and the loop alive.
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
  const browserMode = useBrowserAgent.getState().running === 'browser';
  if (isBrowserTool(toolCall.name)) {
    if (!browserMode) return 'ERROR: Browser tools require a Browser Agent task.';
    if (isBrowserWrite(toolCall.name)) return 'ERROR: Browser writes require a prepared plan and explicit approval through the engine.';
    return JSON.stringify(await browserRequest({ action: 'read', tool: toolCall.name, params: toolCall.params }));
  }
  if (browserMode && toolCall.name !== 'complete_task') return 'ERROR: Only browser tools and complete_task are available in Browser Agent.';
  // ── 1. Meta-tool: activate_skill ─────────────────────────────────────
  if (toolCall.name === 'activate_skill') {
    const skillId = toolCall.params.skill_id;
    if (!skillId) {
      return 'ERROR: activate_skill requires a "skill_id" parameter.';
    }

    const skill = getSkillById(skillId);
    if (!skill) {
      const available = getEnabledSkills()
        .map((s) => s.id)
        .join(', ');
      return `ERROR: Skill "${skillId}" not found. Available skills: ${available}`;
    }

    // Record activated skill in store
    useAgentLoopStore.getState().setActiveSkillId(skillId);

    // Return skill prompt content
    return assembleSkillActivation(skill);
  }

  // ── 2. Check if tool's MCP server is enabled ─────────────────────────
  if (!mcpRegistry.isToolEnabled(toolCall.name)) {
    return `CANCELLED: 工具 ${toolCall.name} 不可用（其所属 MCP 已被禁用）`;
  }

  // ── 3. Delegate to MCP registry ──────────────────────────────────────
  return mcpRegistry.execute(toolCall.name, toolCall.params);
}
