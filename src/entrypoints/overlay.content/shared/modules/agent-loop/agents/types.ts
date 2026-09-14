/**
 * What an agent is.
 *
 * An agent is the answer to "what does this thing operate on". Everything else follows
 * from that: which tools it gets, which skills apply, what its prompt says, and what the
 * Agent tab shows when you switch to it.
 *
 * ⚠️ An agent is **not** a skill. A skill is optional detail loaded mid-task; an agent is
 * the whole context the session runs in, chosen before the first message and fixed for its
 * duration. Conflating them is what the old design did — the workspace shipped as a skill,
 * which meant the database schema and the file protocol were both in every prompt and the
 * model routinely reached for the wrong one.
 */

import type { PlatformId } from '../adapters/adapter-factory';

/**
 * Agent ids.
 *
 * These are wire format: they go into the `[#bs-agent:<id>#]` marker that sits in sent
 * messages forever, into `>` capsule attributes, and into persisted UI state. ⚠️ Renaming
 * one orphans every conversation that already carries it — see `LEGACY_AGENT_IDS`.
 */
export type AgentId = 'bettersidebar' | 'workspace';

/** Context a soul builder gets. Everything dynamic, nothing it could look up itself. */
export interface SoulContext {
  platform: PlatformId | null;
  /** The agent's own skills, already rendered as a list. Empty string when it has none. */
  skillsSummary: string;
  /** Tool schemas for the agent's own MCP servers. */
  toolSchemas: string;
}

export interface AgentDefinition {
  id: AgentId;
  /** English default. UI resolves `agent.agents.<id>.name` over the top. */
  name: string;
  /** One line, shown under the name in the `>` list and the Agent tab. */
  description: string;
  /** lucide-react icon name. */
  icon: string;
  /**
   * MCP servers this agent may use, in the order the prompt should present them.
   *
   * Does **not** include the core server (`activate_skill`, `complete_task`) — every agent
   * gets that, and listing it per agent would only create the opportunity to forget it and
   * ship an agent that cannot end its own session.
   */
  mcpServerIds: string[];
  /**
   * What the Agent tab shows when this agent is selected.
   *
   * `workspace` puts the file tree in the tab, because for that agent the files *are* the
   * subject and hiding them behind a separate tab makes the agent feel like it is working
   * somewhere you cannot see.
   */
  tabContent: 'launcher' | 'workspace';
  buildSoul(context: SoulContext): string;
}
