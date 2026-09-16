/**
 * MCP Layer — Type definitions.
 *
 * Defines the standard interfaces for tool schemas, tool definitions,
 * and MCP Server containers.
 */

// ─── Tool Schema (written into prompt for AI) ────────────────────────────────

/** JSON Schema for tool parameters */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required: string[];
}

/** Tool schema — the "contract" that AI sees in the prompt */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

// ─── Tool Definition (schema + executor) ─────────────────────────────────────

/** Complete tool definition — schema + execution function */
export interface ToolDefinition {
  schema: ToolSchema;
  execute: (params: Record<string, string>) => Promise<string>;
}

// ─── MCP Server ──────────────────────────────────────────────────────────────

/** MCP Server — a container of related tools */
export interface MCPServer {
  id: string;
  type: 'builtin' | 'custom';
  name: string;
  description: string;
  enabled: boolean;
  /**
   * Every tool this server can execute.
   *
   * This is the list ownership and refusal are decided from, so it must be complete and
   * constant: it answers "does this tool exist, and whose is it", and a tool that comes and
   * goes would make a session's own calls unrecognisable after a reload (see `agentForTools`).
   */
  tools: ToolDefinition[];
  /**
   * The subset worth putting in the prompt, when that is narrower than `tools`.
   *
   * ⚠️ Exists for exactly one situation: a tool that is real but **not permitted right now**.
   * The Browser agent's tools each need a Chrome permission the user may not have granted, and
   * a model shown `browser_close_tabs` and then refused reads that as a bug and retries. So
   * those are withheld from the prompt while staying registered, which keeps the schema honest
   * without making the tool table itself unstable.
   *
   * Omit it and every tool is listed, which is the right answer for the other three servers.
   */
  promptTools?: () => ToolDefinition[];
}
