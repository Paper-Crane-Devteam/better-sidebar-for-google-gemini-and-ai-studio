/**
 * The two agents, and how to look one up.
 *
 * A plain array rather than a registration call: both agents ship in the build, the order
 * is the order the `>` list shows them in, and a static list means "which agents exist" is
 * answerable by reading one file.
 */

import i18n from '@/locale/i18n';
import { BUILTIN_MCP_ID } from '../mcp/builtin-mcp';
import { WORKSPACE_MCP_ID } from '../mcp/workspace-mcp';
import { DOCUMENT_MCP_ID } from '../mcp/document-mcp';
import { buildBetterSidebarSoul } from '../prompts/souls/bettersidebar-soul';
import { buildWorkspaceSoul } from '../prompts/souls/workspace-soul';
import type { AgentDefinition, AgentId } from './types';

/**
 * The agent a session runs as when nothing says otherwise.
 *
 * Better Sidebar, because it is what every existing conversation was started with and what
 * the extension is for. A user who wants files picks the other one deliberately.
 */
export const DEFAULT_AGENT_ID: AgentId = 'bettersidebar';

/**
 * Ids that used to mean something else.
 *
 * `__agent_auto__` was the "let the AI pick a skill" sentinel, and it is sitting in the
 * `[#bs-agent:…#]` marker of every message any user has ever sent through the agent. Those
 * conversations still have to render, so the id resolves rather than failing — dropping it
 * would turn every historical agent turn into an unrecognised entry and lose its cards.
 *
 * `builtin-workspace-agent` was the skill this agent used to be, for the same reason.
 */
const LEGACY_AGENT_IDS: Record<string, AgentId> = {
  __agent_auto__: 'bettersidebar',
  'builtin-workspace-agent': 'workspace',
};

export const AGENTS: AgentDefinition[] = [
  {
    id: 'bettersidebar',
    name: 'Better Sidebar',
    description: 'Organize conversations, folders, tags, prompts and snippets',
    icon: 'Bot',
    mcpServerIds: [BUILTIN_MCP_ID],
    tabContent: 'launcher',
    buildSoul: buildBetterSidebarSoul,
  },
  {
    id: 'workspace',
    name: 'Workspace',
    description: 'Read, write and edit files and documents in your workspace',
    icon: 'FolderOpen',
    mcpServerIds: [WORKSPACE_MCP_ID, DOCUMENT_MCP_ID],
    tabContent: 'workspace',
    buildSoul: buildWorkspaceSoul,
  },
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
  return LEGACY_AGENT_IDS[id] ?? DEFAULT_AGENT_ID;
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
