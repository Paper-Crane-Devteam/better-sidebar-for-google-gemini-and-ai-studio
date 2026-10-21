/**
 * The agents, and how to look one up.
 *
 * A plain array rather than a registration call: they all ship in the build, the order is the
 * order the `>` list shows them in, and a static list means "which agents exist" is answerable
 * by reading one file.
 *
 * ⚠️ One conditional entry: the Browser agent is Chrome-only, because `chrome.tabGroups` has
 * no Firefox equivalent. It drops out of the array entirely rather than appearing greyed out —
 * a row that can never be picked is worse than no row.
 */

import i18n from '@/locale/i18n';
import { BUILTIN_MCP_ID } from '../mcp/builtin-mcp';
import { THEME_MCP_ID } from '../mcp/theme-mcp';
import { WORKSPACE_MCP_ID } from '../mcp/workspace-mcp';
import { DOCUMENT_MCP_ID } from '../mcp/document-mcp';
import { BROWSER_MCP_ID } from '../mcp/browser-mcp';
import { buildBetterSidebarSoul } from '../prompts/souls/bettersidebar-soul';
import { buildWorkspaceSoul } from '../prompts/souls/workspace-soul';
import { buildBrowserSoul } from '../prompts/souls/browser-soul';
import { buildWebSoul } from '../prompts/souls/web-soul';
import { WEB_MCP_ID } from '../mcp/web-mcp';
import { webAgentBlocker } from '../web/web-store';
import type { AgentDefinition, AgentId } from './types';
import { isChromeBuild } from '@/shared/browser-agent/contracts';
import {
  browserAgentNeedsPermission,
  openBrowserAgentSettings,
} from '../browser/browser-store';

/**
 * The agent a session runs as when nothing says otherwise.
 *
 * Better Sidebar, because it is what every existing conversation was started with and what
 * the extension is for. A user who wants files picks the other one deliberately.
 */
export const DEFAULT_AGENT_ID: AgentId = 'bettersidebar';

/**
 * Temporary kill switch for the Web Agent.
 *
 * ⚠️ Off until the Web Agent Connector companion extension passes Chrome Web Store review —
 * without it the agent can't operate pages, so offering it would only lead to a dead end.
 * With this off the agent drops out of both the Agent tab dropdown and the `>` list, and any
 * stored `web` id falls back to the default agent via `normalizeAgentId`. Flip to `true` once
 * the Connector is live.
 */
const WEB_AGENT_ENABLED = false;

/**
 * Ids that used to mean something else.
 *
 * `__agent_auto__` was the "let the AI pick a skill" sentinel, and it is sitting in the
 * `[#bs-agent:…#]` marker of every message any user has ever sent through the agent. Those
 * conversations still have to render, so the id resolves rather than failing — dropping it
 * would turn every historical agent turn into an unrecognised entry and lose its cards.
 *
 * `builtin-workspace-agent` was the skill this agent used to be, for the same reason.
 *
 * The four `__browser_*__` ids were the Browser agent's pre-aimed shortcut rows — "Organize
 * tabs", "Manage tab groups", "Organize bookmarks" — which the `>` list no longer offers,
 * because the only choice worth making there is *which of your things this is about* and all
 * four answered that identically. They resolve to the one Browser agent.
 */
const LEGACY_AGENT_IDS: Record<string, AgentId> = {
  __agent_auto__: 'bettersidebar',
  'builtin-workspace-agent': 'workspace',
  __browser_agent__: 'browser',
  __browser_tabs__: 'browser',
  __browser_groups__: 'browser',
  __browser_bookmarks__: 'browser',
};

export const AGENTS: AgentDefinition[] = [
  {
    id: 'bettersidebar',
    name: 'Better Sidebar',
    shortName: 'Sidebar',
    description: 'Organize conversations, folders, tags, prompts, snippets and themes',
    icon: 'Bot',
    // The theme server is second because it is the smaller subject: the prompt should read
    // as "your data, and also how it looks", not the other way round.
    mcpServerIds: [BUILTIN_MCP_ID, THEME_MCP_ID],
    tabContent: 'launcher',
    buildSoul: buildBetterSidebarSoul,
  },
  {
    id: 'workspace',
    name: 'Workspace',
    shortName: 'Workspace',
    description: 'Read, write and edit files and documents in your workspace',
    icon: 'FolderOpen',
    mcpServerIds: [WORKSPACE_MCP_ID, DOCUMENT_MCP_ID],
    tabContent: 'workspace',
    buildSoul: buildWorkspaceSoul,
  },
  // Chrome only — see the file header.
  ...(isChromeBuild()
    ? [
        {
          id: 'browser' as const,
          name: 'Browser Agent',
          shortName: 'Browser',
          description: 'Organize Chrome tabs, tab groups and bookmarks',
          icon: 'Globe',
          mcpServerIds: [BROWSER_MCP_ID],
          tabContent: 'browser' as const,
          buildSoul: buildBrowserSoul,
          /**
           * Permission, and only permission.
           *
           * ⚠️ Deliberately **not** a licence check, even though applying a change needs Power
           * Pack. Reading tabs and bookmarks is free and stays free, so a free plan has a
           * whole agent it can genuinely use — and the licence is charged at the one moment it
           * can be explained without a sales pitch: the user has the actual batch of changes
           * in front of them and presses Approve. See the approval branch in
           * `engine/stages/execute-tools.ts`.
           */
          unavailable: () =>
            browserAgentNeedsPermission()
              ? {
                  reason: i18n.t('agent.browser.needsPermission', {
                    defaultValue: '🔒 Not authorized yet · click to open permissions',
                  }),
                  resolve: () => void openBrowserAgentSettings(),
                }
              : null,
        },
      ]
    : []),
  // Chrome only — it drives pages through `chrome.debugger`. Runs in the side panel: picked
  // from a normal tab, the send hands the task over instead of starting here (see
  // `web/web-store.ts` and `.kiro/docs/web-agent-technical-design.md`).
  ...(isChromeBuild() && WEB_AGENT_ENABLED
    ? [
        {
          id: 'web' as const,
          name: 'Web Agent',
          shortName: 'Web',
          description: 'Read and operate web pages for you in the side panel',
          icon: 'MousePointerClick',
          mcpServerIds: [WEB_MCP_ID],
          tabContent: 'web' as const,
          buildSoul: buildWebSoul,
          /** Power Pack, then the risk notice + debugger permission. Reads are paid too. */
          unavailable: webAgentBlocker,
        },
      ]
    : []),
];

/** Resolve an id, tolerating the ids that used to mean something else. Never throws. */
export function getAgent(id: string | null | undefined): AgentDefinition {
  const resolved = normalizeAgentId(id);
  // `!` is safe: `normalizeAgentId` only ever returns an id that is in the list.
  return AGENTS.find((a) => a.id === resolved)!;
}

/** Map any id — current, legacy or unknown — onto a real agent id. */
export function normalizeAgentId(id: string | null | undefined): AgentId {
  if (!id) return DEFAULT_AGENT_ID;
  if (AGENTS.some((a) => a.id === id)) return id as AgentId;
  const legacy = LEGACY_AGENT_IDS[id];
  return legacy && AGENTS.some(a => a.id === legacy) ? legacy : DEFAULT_AGENT_ID;
}

/** Whether this id names an agent we know, before falling back. For diagnostics. */
export function isKnownAgentId(id: string | null | undefined): boolean {
  return !!id && (AGENTS.some((a) => a.id === id) || id in LEGACY_AGENT_IDS);
}

/**
 * An agent with its name and description localized.
 *
 * Kept out of the definitions themselves so `AGENTS` stays a constant that can be imported
 * anywhere, including before i18n has initialised. The English fields are the fallback.
 */
export function localizedAgent(agent: AgentDefinition): AgentDefinition {
  return {
    ...agent,
    name: i18n.t(`agent.agents.${agent.id}.name`, { defaultValue: agent.name }),
    shortName: i18n.t(`agent.agents.${agent.id}.shortName`, {
      defaultValue: agent.shortName ?? agent.name,
    }),
    description: i18n.t(`agent.agents.${agent.id}.description`, {
      defaultValue: agent.description,
    }),
  };
}

/** Every agent, localized, in display order. */
export function listAgents(): AgentDefinition[] {
  return AGENTS.map(localizedAgent);
}

export type { AgentDefinition, AgentId } from './types';
