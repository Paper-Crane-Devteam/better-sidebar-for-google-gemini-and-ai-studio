/**
 * Skill Registry — combines builtin + custom skills, scoped to one agent.
 *
 * ## Skills are per-agent now, and never shown to the user as a choice
 *
 * Two changes landed together and they reinforce each other:
 *
 * - A skill belongs to exactly one agent. The Workspace agent is not told that a
 *   conversation-classifying skill exists, because it has no `execute_sql` to carry it out.
 * - The user no longer picks a skill up front. The `>` list offers *agents*; the running
 *   agent calls `activate_skill` itself when the task turns out to need one. Choosing a
 *   skill by hand meant committing to an approach before seeing the data, and the wrong
 *   guess cost a whole session.
 *
 * For builtin skills, `titleKey` / `descriptionKey` are resolved via i18n so UI consumers
 * see localized strings. `promptContent` stays English — it is for the model.
 */

import type { Skill } from './types';
import { BUILTIN_SKILLS } from './builtin-skills';
import { useAgentConfigStore } from '../agent-config-store';
import { DEFAULT_AGENT_ID, normalizeAgentId } from '../agents/registry';
import type { AgentId } from '../agents/types';
import i18n from '@/locale/i18n';

/** Resolve i18n keys on a builtin skill (display only; `promptContent` stays English). */
function localize(skill: Skill): Skill {
  if (!skill.titleKey) return skill;
  return {
    ...skill,
    title: i18n.t(skill.titleKey, { defaultValue: skill.title }),
    description: skill.descriptionKey
      ? i18n.t(skill.descriptionKey, { defaultValue: skill.description })
      : skill.description,
  };
}

/**
 * Give every skill a definite owner.
 *
 * Custom skills created before agents existed have no `agentId`. They default to Better
 * Sidebar because that is the only thing that existed when they were written — and because
 * a user's own skill quietly disappearing after an update is worse than one showing up
 * under the wrong agent, where they can see it and move it.
 */
function withOwner(skill: Skill): Skill & { agentId: AgentId } {
  return { ...skill, agentId: normalizeAgentId(skill.agentId ?? DEFAULT_AGENT_ID) };
}

/** All skills, both kinds, with enabled state and owner applied. */
export function getAllSkills(): Array<Skill & { agentId: AgentId }> {
  const { customSkills, disabledBuiltinSkills } = useAgentConfigStore.getState();

  const builtins = BUILTIN_SKILLS.map((s) =>
    withOwner(localize({ ...s, enabled: !disabledBuiltinSkills.includes(s.id) })),
  );

  return [...builtins, ...customSkills.map(withOwner)];
}

/** All skills belonging to one agent, whatever their enabled state. For settings. */
export function getSkillsForAgent(agentId: AgentId): Array<Skill & { agentId: AgentId }> {
  return getAllSkills().filter((s) => s.agentId === agentId);
}

/**
 * The skills one agent may activate: its own, and switched on.
 *
 * This is what goes into the prompt, so an empty result is meaningful — `skillsBlock`
 * renders nothing at all rather than an empty list, because an agent shown an empty list
 * calls `activate_skill` with an invented id.
 */
export function getEnabledSkillsForAgent(agentId: AgentId): Skill[] {
  return getSkillsForAgent(agentId).filter((s) => s.enabled);
}

/**
 * Look a skill up by id.
 *
 * Not scoped by agent: `activate_skill` results are already gated by the agent's own skill
 * list in the prompt, and a lookup that failed on an id the model read from that same list
 * would be a confusing dead end. The engine checks ownership separately when it matters.
 */
export function getSkillById(id: string): (Skill & { agentId: AgentId }) | undefined {
  return getAllSkills().find((s) => s.id === id);
}
