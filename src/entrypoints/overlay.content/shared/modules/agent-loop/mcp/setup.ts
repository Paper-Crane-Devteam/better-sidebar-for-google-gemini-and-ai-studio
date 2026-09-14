/**
 * MCP Setup — registers every builtin server, with its owning agent.
 *
 * Ownership is read off `AGENTS` rather than written out again here. That is deliberate:
 * an agent's definition already lists the servers it uses, and a second list would be a
 * second source of truth for the one fact that decides whether an agent can reach a tool.
 * A server nobody claims simply never becomes callable, which is a loud enough failure.
 */

import { mcpRegistry } from './registry';
import { CORE_MCP } from './core-mcp';
import { BUILTIN_MCP } from './builtin-mcp';
import { WORKSPACE_MCP, WORKSPACE_MCP_ID } from './workspace-mcp';
import { DOCUMENT_MCP, DOCUMENT_MCP_ID } from './document-mcp';
import { AGENTS } from '../agents/registry';
import type { AgentId } from '../agents/types';
import { useAgentConfigStore } from '../agent-config-store';

/** Every builtin server that belongs to an agent, by id. */
const OWNED_SERVERS = [BUILTIN_MCP, WORKSPACE_MCP, DOCUMENT_MCP];

/**
 * Servers the user cannot switch off.
 *
 * Only the core one. It holds `complete_task`, and a session that cannot end is not a
 * degraded session — it is a hang with a Stop button as its only exit.
 */
const REQUIRED_SERVER_IDS: readonly string[] = [CORE_MCP.id];

export function initMCPRegistry(): void {
  // Shared: no owner list, so every agent gets it.
  mcpRegistry.registerServer({ ...CORE_MCP });

  for (const server of OWNED_SERVERS) {
    const owners = AGENTS.filter((a) => a.mcpServerIds.includes(server.id)).map(
      (a) => a.id as AgentId,
    );
    if (owners.length === 0) {
      console.warn(
        `[AgentLoop] MCP server "${server.id}" is not listed by any agent, so nothing ` +
          'can call its tools. Add it to an agent in agents/registry.ts.',
      );
    }
    mcpRegistry.registerServer({ ...server }, owners);
  }

  syncMCPEnabledState();
}

/**
 * Sync enabled flags from the config store.
 *
 * ⚠️ Must be called after any change to `disabledMcpServers`: the registry holds its own
 * `enabled` flag, and the store alone does not reach it — the tools would stay in the
 * prompt until the next page load.
 */
export function syncMCPEnabledState(): void {
  const { disabledMcpServers } = useAgentConfigStore.getState();

  for (const server of mcpRegistry.getServers()) {
    const required = REQUIRED_SERVER_IDS.includes(server.id);
    mcpRegistry.setServerEnabled(
      server.id,
      required || !disabledMcpServers.includes(server.id),
    );
  }
}

/** Whether a server is currently switched on, by id. */
export function isServerEnabled(serverId: string): boolean {
  return !useAgentConfigStore.getState().disabledMcpServers.includes(serverId);
}

/** Turn a server on or off, and push the change into the registry. */
export function setServerEnabled(serverId: string, enabled: boolean): void {
  const { disabledMcpServers, toggleMcpServer } = useAgentConfigStore.getState();
  const currentlyDisabled = disabledMcpServers.includes(serverId);
  if (currentlyDisabled === !enabled) return; // already in the requested state
  toggleMcpServer(serverId);
  syncMCPEnabledState();
}

/**
 * Whether the workspace file tools are available.
 *
 * Kept as a named helper because the Agent tab asks this question to decide whether to
 * offer the file tree at all, and `WORKSPACE_MCP_ID` is not a string worth spreading.
 */
export function isWorkspaceEnabled(): boolean {
  return isServerEnabled(WORKSPACE_MCP_ID);
}

export function setWorkspaceEnabled(enabled: boolean): void {
  setServerEnabled(WORKSPACE_MCP_ID, enabled);
}

export function isDocumentsEnabled(): boolean {
  return isServerEnabled(DOCUMENT_MCP_ID);
}

export function setDocumentsEnabled(enabled: boolean): void {
  setServerEnabled(DOCUMENT_MCP_ID, enabled);
}
