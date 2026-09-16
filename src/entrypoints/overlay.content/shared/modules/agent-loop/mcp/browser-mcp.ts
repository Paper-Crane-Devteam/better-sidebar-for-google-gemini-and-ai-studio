/**
 * Browser MCP Server — "Tabs & Bookmarks".
 *
 * A fourth builtin server, on the same reasoning as the workspace and document ones: it can
 * be turned off, and ten tool schemas in every prompt is real token cost for someone who
 * only wants their chat history organised.
 *
 * ⚠️ **Chrome only, and the check happens at registration.** `chrome.tabGroups` has no Firefox
 * equivalent and `chrome.bookmarks` differs enough to be a separate design, so on other builds
 * this server is never registered — which is also why the Browser agent itself does not appear
 * in the `>` list there. An agent whose only server is absent has nothing to offer.
 *
 * ## `tools` is everything; `promptTools` is what the user permitted
 *
 * The split matters. `tools` has to be complete and stable, because it is what decides whether
 * a tool exists and whose it is — including for a session being reconstructed after a reload,
 * where the calls in the transcript are the only evidence of which agent was running.
 * `promptTools` is the narrower list the model is *told* about, so a capability the user has
 * not granted never gets offered and then refused.
 */

import type { MCPServer } from './types';
import { ALL_BROWSER_TOOLS, availableBrowserTools } from './providers/browser-provider';

export const BROWSER_MCP_ID = 'builtin-browser';

export const BROWSER_MCP: MCPServer = {
  id: BROWSER_MCP_ID,
  type: 'builtin',
  // "Tabs & Bookmarks", not "Browser": it sits inside the Browser agent's section in settings,
  // and repeating the agent's own name there reads as a second thing called the browser.
  name: 'Tabs & Bookmarks',
  description:
    'Read and reorganise Chrome tabs, tab groups and bookmarks. Every change is applied as a ' +
    'batch the user approves, and recorded in a local journal that can undo it.',
  enabled: true,
  tools: ALL_BROWSER_TOOLS,
  promptTools: availableBrowserTools,
};
