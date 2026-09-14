/**
 * Prompt Assembler — builds one agent's system prompt.
 *
 * Two entry points:
 * 1. `assembleFinalPrompt()` — when the user starts a session from the `>` list.
 * 2. `assembleSkillActivation()` — when the running agent calls `activate_skill`.
 *
 * ⚠️ Everything is scoped to one agent. The soul, the tool schemas and the skill list all
 * come from that agent's definition, so nothing here decides what an agent can do — it only
 * assembles what `agents/registry.ts` already declared.
 *
 * There is no longer a `selectedSkill`. The `>` list offers agents, and a skill is loaded
 * mid-task by the agent that needs it, so a prompt is never built with one already pinned.
 */

import type { Skill } from '../skills/types';
import type { PlatformId } from '../adapters/adapter-factory';
import { getCurrentPlatformId } from '../adapters/adapter-factory';
import { INBOX_FOLDER_ID, SNIPPET_INBOX_ID, PROMPT_INBOX_ID } from '@/shared/constants/inbox';
import { getAgent } from '../agents/registry';
import type { AgentId } from '../agents/types';
import { getEnabledSkillsForAgent } from '../skills/skill-registry';
import { generateToolSchemaPrompt } from '../mcp/schema-generator';
import { browserPrompt } from '../../browser-agent/prompt';

// ─── Placeholder Resolution ──────────────────────────────────────────────────

/**
 * Skill prompts (built-in and user-authored) are static strings, so they refer to inbox
 * folders through placeholders. Resolve them to literal IDs here so the agent never has to
 * guess, or look an inbox up by its localized name.
 */
function resolveInboxPlaceholders(content: string, platform: PlatformId | null): string {
  // Platform is always known in practice (the agent only runs on a detected platform);
  // the fallback keeps the placeholder self-describing just in case.
  const conversationInbox = platform
    ? INBOX_FOLDER_ID(platform)
    : `${INBOX_FOLDER_ID('')}<platform>`;
  return content
    .replace(/<CONVERSATION_INBOX_ID>/g, conversationInbox)
    .replace(/<SNIPPET_INBOX_ID>/g, SNIPPET_INBOX_ID)
    .replace(/<PROMPT_INBOX_ID>/g, PROMPT_INBOX_ID);
}

// ─── Skills Summary ──────────────────────────────────────────────────────────

/**
 * The agent's own skills, as a list it can activate from.
 *
 * ⚠️ Returns an empty string when there are none, and the caller relies on that: an agent
 * shown an empty skill list calls `activate_skill` with an invented id and burns a round
 * being told it does not exist. The Workspace agent has no skills yet, so this is the live
 * path, not a defensive branch.
 */
function generateSkillsSummary(skills: Skill[]): string {
  if (skills.length === 0) return '';

  let output = '';
  for (const skill of skills) {
    output += `- **${skill.id}**: ${skill.title} — ${skill.description}\n`;
  }
  output += '\nTo activate one:\n';
  output +=
    '```\n<bs_agent_tool>\n{"name": "activate_skill", "description": "Activating skill", "params": {"skill_id": "SKILL_ID"}}\n</bs_agent_tool>\n```\n';

  return output;
}

// ─── Main Assembly ───────────────────────────────────────────────────────────

export interface AssembleOptions {
  /** Which agent this session runs as. */
  agentId: AgentId;
  focus?: string;
  /** Current platform. */
  platform: PlatformId | null;
}

export function assembleFinalPrompt(options: AssembleOptions): string {
  if (options.agentId === 'browser') return browserPrompt(options.focus);
  const { agentId, platform } = options;
  const agent = getAgent(agentId);

  return agent.buildSoul({
    platform,
    skillsSummary: generateSkillsSummary(getEnabledSkillsForAgent(agentId)),
    toolSchemas: generateToolSchemaPrompt(agentId),
  });
}

// ─── Skill Activation Response ───────────────────────────────────────────────

/** What `activate_skill` returns: the skill's full instructions. */
export function assembleSkillActivation(skill: Skill): string {
  const content = resolveInboxPlaceholders(skill.promptContent, getCurrentPlatformId());

  return `## Skill Activated: ${skill.title}

${content}

You now have specialized instructions for this task. Proceed with execution using the available tools.`;
}
