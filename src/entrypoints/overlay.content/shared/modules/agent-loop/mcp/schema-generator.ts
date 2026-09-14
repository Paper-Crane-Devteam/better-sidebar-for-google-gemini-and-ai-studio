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
    output += `## MCP: ${server.name}\n`;
    output += `${server.description}\n\n`;

    for (const tool of server.tools) {
      const { schema } = tool;
      output += `### ${schema.name}\n`;
      output += `${schema.description}\n`;
      output += `Parameters:\n`;

      for (const [key, val] of Object.entries(schema.parameters.properties)) {
        const isRequired = schema.parameters.required.includes(key);
        output += `  - ${key}: ${val.type}${isRequired ? ' (required)' : ''} — ${val.description}\n`;
      }
      output += '\n';
    }
  }

  return output.trim();
}
