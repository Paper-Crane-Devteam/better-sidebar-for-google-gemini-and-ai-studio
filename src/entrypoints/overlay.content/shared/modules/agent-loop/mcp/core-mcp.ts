/**
 * Core MCP Server — the two tools the loop itself needs.
 *
 * `complete_task` is how a session ends; `activate_skill` is how it specialises. Split out
 * of the Better Sidebar server when agents became a thing, because that server is now one
 * agent's *domain* tools — and an agent that inherited the domain but not these would be
 * unable to finish its own task.
 *
 * ⚠️ Not user-toggleable and not listed per agent. Both would be ways to ship an agent that
 * loops forever with no exit, and neither buys anything: two schemas is the cheapest part
 * of the prompt and every agent needs both.
 */

import type { MCPServer } from './types';
import { activateSkillProvider } from './providers/activate-skill-provider';
import { taskProvider } from './providers/task-provider';

export const CORE_MCP_ID = 'builtin-core';

export const CORE_MCP: MCPServer = {
  id: CORE_MCP_ID,
  type: 'builtin',
  name: 'Core',
  description: 'Ending a task and loading skills',
  enabled: true,
  tools: [activateSkillProvider, taskProvider],
};
