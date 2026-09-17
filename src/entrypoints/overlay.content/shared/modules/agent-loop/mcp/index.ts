/**
 * MCP Layer — Public API.
 */

export type { MCPServer, ToolSchema, ToolDefinition, ToolParameterSchema } from './types';
export { mcpRegistry } from './registry';
export { CORE_MCP, CORE_MCP_ID } from './core-mcp';
export { BUILTIN_MCP, BUILTIN_MCP_ID } from './builtin-mcp';
export { THEME_MCP, THEME_MCP_ID } from './theme-mcp';
export { WORKSPACE_MCP, WORKSPACE_MCP_ID } from './workspace-mcp';
export { DOCUMENT_MCP, DOCUMENT_MCP_ID } from './document-mcp';
export { BROWSER_MCP, BROWSER_MCP_ID } from './browser-mcp';
export { generateToolSchemaPrompt } from './schema-generator';
