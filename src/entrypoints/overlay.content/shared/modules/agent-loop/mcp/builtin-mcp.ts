/**
 * Better Sidebar MCP Server — the extension's own data.
 *
 * `execute_sql` and `export`: everything that reads or writes the local database.
 * `open_new_chat`: continue in a fresh conversation (new tab, prompt pre-filled).
 * Belongs to the Better Sidebar agent and to no other.
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
// import { syncProvider } from './providers/sync-provider';
import { exportProvider } from './providers/export-provider';
import { newChatProvider } from './providers/new-chat-provider';

export const BUILTIN_MCP_ID = 'builtin-bettersidebar';

export const BUILTIN_MCP: MCPServer = {
  id: BUILTIN_MCP_ID,
  type: 'builtin',
  name: 'Better Sidebar',
  description: 'Query and change conversations, folders, tags and prompts',
  enabled: true,
  /*
   * `syncProvider` is parked, not removed. The tool navigated the tab through every
   * conversation that had no transcript and scrolled each history to the top, because
   * that was the only way the messages ever reached the database. The idle backfill
   * (`content/shared/backfill/runner.ts`) now pulls them from the platform's own
   * endpoint while the tab sits there, so the agent has nothing to offer here that the
   * extension is not already doing quietly.
   *
   * Bring it back — here and in `skills/builtin-skills.ts` — if that endpoint changes
   * and the backfill stops producing anything: driving the page is slower and costs the
   * user their tab, but it only depends on the DOM, which is the part that has to keep
   * working. Everything under `tools/sync/` is untouched and still exported.
   */
  tools: [sqlProvider, /* syncProvider, */ exportProvider, newChatProvider],
};
