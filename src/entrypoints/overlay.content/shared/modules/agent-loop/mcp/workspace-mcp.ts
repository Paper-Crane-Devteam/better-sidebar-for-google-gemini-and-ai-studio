/**
 * Workspace MCP Server — "Agent Workspace".
 *
 * A second builtin server, parallel to `BUILTIN_MCP`, rather than more tools inside
 * it. Two consequences that are the point of the split:
 *
 * - It can be turned off. The file tools are useless to someone who only wants chat
 *   organisation, and seven extra tool schemas in every prompt is real token cost.
 * - `complete_task` and `activate_skill` stay in the core server, so the workspace
 *   agent still gets them — the loop cannot end without `complete_task`.
 */

import type { MCPServer } from './types';
import { WORKSPACE_TOOLS } from './providers/workspace-provider';

export const WORKSPACE_MCP_ID = 'builtin-workspace';

export const WORKSPACE_MCP: MCPServer = {
  id: WORKSPACE_MCP_ID,
  type: 'builtin',
  // Just "Files" now, not "Agent Workspace". It sits inside the Workspace agent's section in
  // settings, so repeating the agent's name in its own tool group read as a second thing
  // called the workspace.
  name: 'Files',
  description:
    'A private file workspace the agent can read, write and search. Files persist ' +
    'across sessions and are shared between Gemini and AI Studio.',
  enabled: true,
  tools: WORKSPACE_TOOLS,
};
