/**
 * Better Sidebar MCP Server — the extension's own data.
 *
 * `execute_sql`, `sync_conversation_messages` and `export`: everything that reads or writes
 * the local database. Belongs to the Better Sidebar agent and to no other.
 *
 * ⚠️ `activate_skill` and `complete_task` used to live here. They moved to `core-mcp.ts`
 * when agents were split out — they are loop machinery, not this domain's tools, and the
 * Workspace agent needs them just as much while needing none of the SQL.
 *
 * `name` and `description` are English defaults; the settings UI resolves localized
 * versions via `agent.mcp.builtin.name` / `.description`.
 */

import type { MCPServer } from './types';
import { sqlProvider } from './providers/sql-provider';
import { syncProvider } from './providers/sync-provider';
import { exportProvider } from './providers/export-provider';

export const BUILTIN_MCP_ID = 'builtin-bettersidebar';

export const BUILTIN_MCP: MCPServer = {
  id: BUILTIN_MCP_ID,
  type: 'builtin',
  name: 'Better Sidebar',
  description: 'Query and change conversations, folders, tags and prompts',
  enabled: true,
  tools: [sqlProvider, syncProvider, exportProvider],
};
