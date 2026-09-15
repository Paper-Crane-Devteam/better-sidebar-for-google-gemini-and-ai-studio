/**
 * Built-in Prompt Registry.
 * All built-in prompts for Agent Loop are registered here.
 * These are invisible to users in the regular prompt library.
 */

import type { BuiltInPrompt } from '../types';
import { autoClassifyPrompt } from './utilities/auto-classify';
import { exportChatsPrompt } from './utilities/export-chats';

/**
 * All registered built-in prompts.
 *
 * The "sync missing messages" wrapper is gone with its skill (see
 * `skills/builtin-skills.ts`). These wrappers read their skill out of `BUILTIN_SKILLS`
 * at module load and assert it exists, so one pointing at a commented-out skill would
 * throw on import rather than degrade — hence removed here rather than left dangling.
 */
const BUILT_IN_PROMPTS: BuiltInPrompt[] = [
  autoClassifyPrompt,
  exportChatsPrompt,
];

/**
 * Get all built-in prompts.
 */
export function getBuiltInPrompts(): BuiltInPrompt[] {
  return BUILT_IN_PROMPTS;
}

/**
 * Get a built-in prompt by ID.
 */
export function getBuiltInPromptById(id: string): BuiltInPrompt | undefined {
  return BUILT_IN_PROMPTS.find((p) => p.id === id);
}
