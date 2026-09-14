/**
 * Prompt Assembler — composes the final prompt from Soul + Skills + MCP schemas.
 *
 * Two main entry points:
 * 1. assembleFinalPrompt() — called when user triggers agent (> popup select)
 * 2. assembleSkillActivation() — called when AI invokes activate_skill tool
 */

import type { Skill } from '../skills/types';
import type { PlatformId } from '../adapters/adapter-factory';
import { getCurrentPlatformId } from '../adapters/adapter-factory';
import { INBOX_FOLDER_ID, SNIPPET_INBOX_ID, PROMPT_INBOX_ID } from '@/shared/constants/inbox';
import { getSoulPrompt } from './soul';
import { generateToolSchemaPrompt } from '../mcp/schema-generator';
import { browserPrompt } from '../../browser-agent/prompt';

// ─── Placeholder Resolution ──────────────────────────────────────────────────

/**
 * Skill prompts (built-in and user-authored) are static strings, so they refer
 * to inbox folders through placeholders. Resolve them to the literal IDs here
 * so the agent never has to guess or look an inbox up by its localized name.
 */
function resolveInboxPlaceholders(content: string, platform: PlatformId | null): string {
  // Platform is always known in practice (the agent only runs on a detected
  // platform); the fallback keeps the placeholder self-describing just in case.
  const conversationInbox = platform ? INBOX_FOLDER_ID(platform) : `${INBOX_FOLDER_ID('')}<platform>`;
  return content
    .replace(/<CONVERSATION_INBOX_ID>/g, conversationInbox)
    .replace(/<SNIPPET_INBOX_ID>/g, SNIPPET_INBOX_ID)
    .replace(/<PROMPT_INBOX_ID>/g, PROMPT_INBOX_ID);
}

// ─── Skills Summary Generation ───────────────────────────────────────────────

/**
 * Generate skills summary for the Soul prompt.
 *
 * Always lists every enabled skill, including when the user pre-selected one.
 * Naming only the active skill made `activate_skill` a tool with no legal argument:
 * a run started from "Export Conversations" that turned out to need a sync had no way
 * of knowing a sync skill existed, let alone what its id was.
 *
 * `activeSkill` only changes the framing — its instructions are appended verbatim
 * further down, so the agent is told not to re-activate it.
 */
function generateSkillsSummary(skills: Skill[], activeSkill?: Skill): string {
  if (skills.length === 0) return 'No skills available.';

  let output = '### Available Skills\n\n';
  for (const skill of skills) {
    const active = skill.id === activeSkill?.id ? ' — **already active** (instructions included below)' : '';
    output += `- **${skill.id}**: ${skill.title} — ${skill.description}${active}\n`;
  }
  output += '\nTo activate a skill, call:\n';
  output += '```\n<bs_agent_tool>\n{"name": "activate_skill", "description": "Activating skill", "params": {"skill_id": "SKILL_ID"}}\n</bs_agent_tool>\n```\n';

  if (activeSkill) {
    output += `\nThe user already chose **${activeSkill.title}**, and its full instructions are at the end of this message — do not activate it again. Activate one of the others only if the work turns out to need it.\n`;
  }

  return output;
}

// ─── Main Assembly ───────────────────────────────────────────────────────────

export interface AssembleOptions {
  agentKind?: 'data' | 'browser';
  focus?: string;
  /** User explicitly chose a skill from popup (null = free-form / AI will choose) */
  selectedSkill?: Skill;
  /** All enabled skills (for generating summary) */
  allSkills: Skill[];
  /** Current platform */
  platform: PlatformId | null;
}

/**
 * Assemble the final prompt to inject into the editor capsule.
 *
 * Always: Soul + every enabled skill (id, title, description) + tool schemas.
 * Plus, when a skill was pre-selected, its full instructions appended at the end.
 */
export function assembleFinalPrompt(options: AssembleOptions): string {
  if (options.agentKind === 'browser') return browserPrompt(options.focus);
  const { selectedSkill, allSkills, platform } = options;

  // The picked skill has to appear in the list even if it is disabled — the user
  // launching it is a stronger signal than the toggle.
  const skills =
    selectedSkill && !allSkills.some((s) => s.id === selectedSkill.id)
      ? [...allSkills, selectedSkill]
      : allSkills;

  const skillsSummary = generateSkillsSummary(skills, selectedSkill);

  const toolSchemas = generateToolSchemaPrompt();

  let prompt = getSoulPrompt({
    platform,
    skillsSummary,
    toolSchemas,
  });

  // Append selected skill's prompt content
  if (selectedSkill) {
    const skillContent = resolveInboxPlaceholders(selectedSkill.promptContent, platform);
    prompt += `\n\n## Active Skill Instructions\n\n${skillContent}`;
  }

  return prompt;
}

// ─── Skill Activation Response ───────────────────────────────────────────────

/**
 * Assemble the response when AI calls activate_skill.
 * Returns skill prompt content so AI gets specialized instructions.
 */
export function assembleSkillActivation(skill: Skill): string {
  const content = resolveInboxPlaceholders(skill.promptContent, getCurrentPlatformId());

  return `## Skill Activated: ${skill.title}

${content}

You now have specialized instructions for this task. Proceed with execution using the available tools.`;
}
