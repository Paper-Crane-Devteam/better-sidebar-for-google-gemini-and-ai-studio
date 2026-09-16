/**
 * MCP Registry — which tools exist, and which agent may use them.
 *
 * Two independent questions, and keeping them separate is the whole design:
 *
 * - **Ownership** — which agent a server belongs to. Fixed in code (`agents/registry.ts`),
 *   not a user setting. The Workspace agent must not be able to run `execute_sql` even if
 *   the model asks for it by name, because it was never told the schema and any SQL it
 *   invents is a guess at the user's data.
 * - **Enabled** — whether the user wants that server's tools in the prompt at all. A
 *   preference, persisted in `agent-config-store`.
 *
 * A tool is callable only when both say yes. Ownership is checked first, and its refusal
 * reads differently on purpose: "not available to this agent" tells the model to stop
 * trying, while "the user turned it off" invites it to ask.
 */

import type { AgentId } from '../agents/types';
import type { MCPServer, ToolDefinition, ToolSchema } from './types';

/** Servers every agent gets. Registered with no owner list. */
const SHARED = 'shared' as const;

class MCPRegistry {
  private servers: MCPServer[] = [];

  /** serverId → owning agents, or `SHARED` for the core server. */
  private ownership = new Map<string, AgentId[] | typeof SHARED>();

  /**
   * Register a server.
   *
   * @param owners Agents that may use it. Omit for a server every agent gets — currently
   *               only the core one (`complete_task`, `activate_skill`).
   */
  registerServer(server: MCPServer, owners?: AgentId[]): void {
    const index = this.servers.findIndex((s) => s.id === server.id);
    if (index >= 0) {
      this.servers[index] = server;
    } else {
      this.servers.push(server);
    }
    this.ownership.set(server.id, owners ?? SHARED);
  }

  /** Every registered server, whatever its owner or state. For the settings UI. */
  getServers(): MCPServer[] {
    return this.servers;
  }

  /** Which agents may use a server. Empty array means nobody claimed it. */
  ownersOf(serverId: string): AgentId[] | typeof SHARED {
    return this.ownership.get(serverId) ?? [];
  }

  /** Whether this server belongs to this agent (or to all of them). */
  private isOwnedBy(serverId: string, agentId: AgentId): boolean {
    const owners = this.ownership.get(serverId);
    if (owners === undefined) return false;
    return owners === SHARED || owners.includes(agentId);
  }

  /** Servers for one agent: owned by it, and switched on. Prompt order. */
  getServersForAgent(agentId: AgentId): MCPServer[] {
    return this.servers.filter((s) => s.enabled && this.isOwnedBy(s.id, agentId));
  }

  /** Servers for one agent regardless of the enabled switch. For the settings UI. */
  getAllServersForAgent(agentId: AgentId): MCPServer[] {
    return this.servers.filter((s) => this.isOwnedBy(s.id, agentId));
  }

  /** Tool schemas one agent should see in its prompt. */
  getToolSchemasForAgent(agentId: AgentId): ToolSchema[] {
    return this.getServersForAgent(agentId).flatMap((s) =>
      s.tools.map((t) => t.schema),
    );
  }

  /**
   * Why a tool cannot be called, or null when it can.
   *
   * Returns the reason rather than a boolean so the caller can hand the model something
   * actionable. The three cases are genuinely different: a name that does not exist is a
   * hallucination, a name owned by another agent is a wrong-agent mistake the user has to
   * resolve, and a disabled server is a setting.
   */
  refusalReason(
    toolName: string,
    agentId: AgentId,
  ): 'unknown' | 'other-agent' | 'disabled' | null {
    const hosting = this.servers.filter((s) =>
      s.tools.some((t) => t.schema.name === toolName),
    );
    if (hosting.length === 0) return 'unknown';

    const owned = hosting.filter((s) => this.isOwnedBy(s.id, agentId));
    if (owned.length === 0) return 'other-agent';
    if (!owned.some((s) => s.enabled)) return 'disabled';
    return null;
  }

  /**
   * Which agent a set of tool names belongs to, or null when they don't agree on one.
   *
   * This is how a session that has to be *reconstructed* works out which agent it is.
   * Auto-pickup and owed-result delivery both start after a reload, when the store's
   * `activeAgentId` is back at its default — and the calls themselves are the most
   * reliable evidence available, because the model only ever saw one agent's schemas.
   * Without it a picked-up `glob_files` ran as Better Sidebar and was refused as
   * belonging to another agent, which reads to the user as the tool being broken.
   *
   * Shared servers are skipped rather than counted: `complete_task` belongs to every
   * agent, so it carries no signal, and a response holding nothing else genuinely has
   * nothing to go on. Null means "keep the caller's own answer" — never a guess.
   */
  agentForTools(toolNames: readonly string[]): AgentId | null {
    const owners = new Set<AgentId>();

    for (const name of toolNames) {
      for (const server of this.servers) {
        if (!server.tools.some((t) => t.schema.name === name)) continue;
        const claim = this.ownership.get(server.id);
        if (!claim || claim === SHARED) continue;
        for (const owner of claim) owners.add(owner);
      }
    }

    // Two owners means the response mixes agents, which the prompt cannot have asked
    // for. Refusing to choose leaves the existing refusal to explain it.
    return owners.size === 1 ? [...owners][0] : null;
  }

  /** Find a tool this agent is allowed to run. */
  findTool(toolName: string, agentId: AgentId): ToolDefinition | undefined {
    for (const server of this.getServersForAgent(agentId)) {
      const tool = server.tools.find((t) => t.schema.name === toolName);
      if (tool) return tool;
    }
    return undefined;
  }

  /** Execute a tool. The caller must have cleared `refusalReason` first. */
  async execute(
    toolName: string,
    params: Record<string, string>,
    agentId: AgentId,
  ): Promise<string> {
    const tool = this.findTool(toolName, agentId);
    if (!tool) {
      const available = this.getToolSchemasForAgent(agentId)
        .map((s) => s.name)
        .join(', ');
      return `ERROR: Unknown tool "${toolName}". Available tools: ${available}`;
    }
    return tool.execute(params);
  }

  /** Update a server's enabled flag. */
  setServerEnabled(serverId: string, enabled: boolean): void {
    const server = this.servers.find((s) => s.id === serverId);
    if (server) server.enabled = enabled;
  }

  /** Every tool name, from every server, whatever its state. */
  getAllToolNames(): string[] {
    return this.servers.flatMap((s) => s.tools.map((t) => t.schema.name));
  }
}

/** Singleton instance */
export const mcpRegistry = new MCPRegistry();
