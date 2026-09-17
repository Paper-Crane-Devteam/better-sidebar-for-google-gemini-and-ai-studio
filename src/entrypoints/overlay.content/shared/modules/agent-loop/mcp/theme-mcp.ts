/**
 * Theme MCP Server — how the extension looks.
 *
 * Its own server rather than three more tools on `builtin-bettersidebar`, for two reasons
 * that both come down to the user: appearance is a different subject from their data, and
 * having it separate means the switch in Settings → Agent can be turned off on its own by
 * someone who wants the agent nowhere near their theme.
 *
 * Owned by the Better Sidebar agent (see `agents/registry.ts`), because the theme *is* the
 * extension's own surface — the same thing that agent already operates on.
 */

import type { MCPServer } from './types';
import {
  applyThemeProvider,
  createThemeProvider,
  listThemesProvider,
} from './providers/theme-provider';

export const THEME_MCP_ID = 'builtin-theme';

export const THEME_MCP: MCPServer = {
  id: THEME_MCP_ID,
  type: 'builtin',
  name: 'Themes',
  description: 'Design, save and switch the appearance of Gemini and the sidebar',
  enabled: true,
  tools: [listThemesProvider, createThemeProvider, applyThemeProvider],
};
