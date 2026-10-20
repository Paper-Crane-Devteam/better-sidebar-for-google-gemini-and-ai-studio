/**
 * Web MCP Server — "Web Pages". Chrome only: it needs `chrome.debugger`.
 *
 * Owned by the Web agent alone (see `agents/registry.ts`), so its tools never appear in
 * another agent's prompt.
 */

import type { MCPServer } from './types';
import { ALL_WEB_TOOLS } from './providers/web-provider';

export const WEB_MCP_ID = 'builtin-web';

export const WEB_MCP: MCPServer = {
  id: WEB_MCP_ID,
  type: 'builtin',
  name: 'Web Pages',
  description:
    'Read and operate web pages in tabs the user has handed to the agent: snapshot, click, ' +
    'type, open and run JavaScript. Every action that changes a page is approved by the user.',
  enabled: true,
  tools: ALL_WEB_TOOLS,
};
