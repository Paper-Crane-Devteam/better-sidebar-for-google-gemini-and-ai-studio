/**
 * MCP Schema Generator.
 *
 * Renders the "Available Tools" section of a soul prompt: the tools of whichever servers
 * the running agent owns and the user has switched on.
 *
 * ⚠️ Scoped by agent, and that is not cosmetic. Listing every tool would tell the Workspace
 * agent that `execute_sql` exists while its prompt contains no schema — so its first
 * instinct on any data question would be to invent SQL against tables it has never seen.
 */

import { mcpRegistry } from './registry';
import type { AgentId } from '../agents/types';

export function generateToolSchemaPrompt(agentId: AgentId): string {
  const servers = mcpRegistry.getServersForAgent(agentId);

  if (servers.length === 0) return 'No tools available.';

  let output = '';

  for (const server of servers) {
    // `promptTools` where a server has one: the tools that are registered but not currently
    // permitted are real, and stay callable-in-principle, but telling the model about one it
    // will only be refused for costs a round and reads as a broken tool. See `mcp/types.ts`.
    const tools = server.promptTools?.() ?? server.tools;
    if (tools.length === 0) continue;

    output += `## MCP: ${server.name}\n`;
    output += `${server.description}\n\n`;

    for (const tool of tools) {
      const { schema } = tool;
      output += `### ${schema.name}\n`;
      const properties = Object.entries(schema.parameters.properties);

      output += `${schema.description}\n`;
      // "none" spelled out rather than a bare "Parameters:" with nothing under it. A tool
      // that genuinely takes nothing (`list_themes`) otherwise reads as a truncated schema,
      // which is an invitation to invent a parameter.
      output += properties.length === 0 ? 'Parameters: none\n' : 'Parameters:\n';

      for (const [key, val] of properties) {
        const isRequired = schema.parameters.required.includes(key);
        output += `  - ${key}: ${val.type}${isRequired ? ' (required)' : ''} — ${val.description}\n`;
      }
      output += '\n';
    }
  }

  return output.trim();
}
