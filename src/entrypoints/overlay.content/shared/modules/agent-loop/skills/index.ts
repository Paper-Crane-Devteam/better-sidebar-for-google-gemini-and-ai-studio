/**
 * Skills Layer — public surface.
 *
 * ⚠️ Every query is per-agent now. There is no `getEnabledSkills()` without an agent id,
 * because "every enabled skill" is not a question anything should be asking: showing the
 * Workspace agent a conversation-classifying skill it has no tools for only teaches it to
 * activate something that cannot help.
 */

export type { Skill } from './types';
export { BUILTIN_SKILLS } from './builtin-skills';
export {
  getAllSkills,
  getSkillsForAgent,
  getEnabledSkillsForAgent,
  getSkillById,
} from './skill-registry';
