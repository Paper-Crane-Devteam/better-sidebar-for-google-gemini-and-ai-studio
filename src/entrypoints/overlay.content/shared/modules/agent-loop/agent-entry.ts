/**
 * Agent entries — what the `>` popup and the Agent tab launcher offer.
 *
 * ## It used to be skills, and now it is agents
 *
 * The list has been through two shapes. First there were two triggers: `>` picked a skill,
 * `!` ran without one. Then one list whose first row was "let the AI decide" and whose rest
 * were skills. Now it is **one row per agent**, and skills are gone from it entirely.
 *
 * Why: picking a skill up front meant committing to an approach before seeing any data, and
 * the wrong guess cost the whole session — a run started from "Export Conversations" that
 * turned out to need a sync had to be abandoned. The running agent calls `activate_skill`
 * itself now, once it knows what the task actually is.
 *
 * What the user chooses instead is genuinely a decision only they can make: **which of
 * their things this is about.** Their conversations, or their files.
 */

import i18n from '@/locale/i18n';
import { AGENTS, getAgent, localizedAgent, normalizeAgentId } from './agents/registry';
import type { AgentDefinition, AgentId } from './agents/types';
import { isChromeBuild } from '@/shared/browser-agent/contracts';
import { useBrowserAgent } from '../browser-agent/client';

/**
 * Legacy sentinel for "run the agent, let it pick a skill itself".
 *
 * Still exported because it is written into the `[#bs-agent:…#]` marker of every message
 * ever sent through the old list, and those conversations still have to render. `getAgent`
 * maps it onto the Better Sidebar agent.
 */
export const AGENT_AUTO_ID = '__agent_auto__';
export const BROWSER_AUTO_ID = '__browser_agent__';
const BROWSER_SHORTCUTS = [
  ['__browser_tabs__', '整理标签页', 'Organize tabs in the current window.'],
  ['__browser_groups__', '管理标签组', 'Organize tab groups in the current window.'],
  ['__browser_bookmarks__', '整理收藏夹', 'Organize bookmarks using titles and URLs.'],
] as const;

export function browserEntryNeedsPermission(id: string) {
  const caps = useBrowserAgent.getState().settings.capabilities;
  if (id === '__browser_tabs__') return !caps.includes('tabs.read');
  if (id === '__browser_groups__') return !caps.includes('tabGroups.read');
  if (id === '__browser_bookmarks__') return !caps.includes('bookmarks.read');
  return (id === 'browser' || id === BROWSER_AUTO_ID) && !caps.some(c => c.endsWith('.read'));
}

export interface AgentEntry {
  focus?: string;
  /** The agent id. Goes into the capsule and the prompt marker. */
  id: string;
  title: string;
  description: string;
  icon: string;
  /**
   * Text the capsule stores, and the text stripped back out to recover what the user typed
   * around it.
   *
   * Equal to the title for an agent, which is what makes the round trip exact: the capsule
   * shows `>Workspace`, expands to `Workspace`, and removing that leaves the user's own
   * words. When entries were skills this held the entire skill prompt, so expansion dumped
   * thousands of characters into the composer before they were stripped again.
   */
  capsuleContent: string;
  /** The agent this entry runs. */
  agent: AgentDefinition;
}

function toEntry(agent: AgentDefinition): AgentEntry {
  const localized = localizedAgent(agent);
  return {
    id: localized.id,
    title: localized.name,
    description: browserEntryNeedsPermission(localized.id) ? '🔒 尚未授权 · 点击打开权限设置' : localized.description,
    icon: localized.icon,
    capsuleContent: localized.name,
    agent: localized,
  };
}

/** Every agent, in display order. */
export function getAgentEntries(): AgentEntry[] {
  return AGENTS.flatMap(agent => [toEntry(agent), ...(agent.id === 'browser' ? BROWSER_SHORTCUTS.map(([id]) => getAgentEntryById(id)!) : [])]);
}

/**
 * Resolve an entry by id.
 *
 * Never returns undefined for a *known* id shape — `getAgent` falls back to the default
 * agent for anything unrecognised, including the old skill ids that historical markers
 * still carry. A conversation from before this change renders as a Better Sidebar session,
 * which is what it was.
 */
export function getAgentEntryById(id: string): AgentEntry | undefined {
  const shortcut = isChromeBuild() ? BROWSER_SHORTCUTS.find(([key]) => key === id) : undefined;
  if (shortcut) {
    const [, title, focus] = shortcut;
    return { ...toEntry(getAgent('browser')), id, title, focus, capsuleContent: title,
      description: browserEntryNeedsPermission(id) ? '🔒 尚未授权 · 点击打开权限设置' : focus };
  }
  return toEntry(getAgent(id));
}

/** The agent id an entry id refers to. */
export function agentIdFromEntry(id: string): AgentId {
  return normalizeAgentId(id);
}

/**
 * Match entries against the popup's query.
 *
 * With two rows there is nothing to page through, so an empty query returns both and a
 * query returns whatever matches — including nothing, which correctly closes the popup and
 * lets the user type a message that happens to start with `>`.
 */
export function searchAgentEntries(query: string): AgentEntry[] {
  const entries = getAgentEntries();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;

  return entries.filter((e) => {
    const haystack = `${e.title} ${e.description} ${e.id}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Where an entry marker was found in plain composer text */
export interface AgentEntryMatch {
  entry: AgentEntry;
  /** Index of the `>` */
  start: number;
  /** Index just past the title */
  end: number;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find a `>Agent name` marker in plain text.
 *
 * This is how the marker works on composers that cannot hold a capsule — AI Studio's
 * `<textarea>`. The marker is **self-describing**: the entry is recovered from the text
 * itself rather than from state held alongside it. That matters more than it sounds:
 *
 * - It survives the feature component remounting. React state would not, and losing it is
 *   the worst possible failure — the marker is still sitting in the composer, so the next
 *   send posts the raw `>Name` line as an ordinary message and the agent looks broken.
 * - It makes typing the marker by hand work, which users do once they've seen it.
 *
 * Longest title first, so a short name cannot claim a longer one's marker.
 */
export function matchAgentEntryInText(text: string): AgentEntryMatch | null {
  const entries = [...getAgentEntries()].sort((a, b) => b.title.length - a.title.length);

  for (const entry of entries) {
    // `(^|\s)` mirrors the popup's own rule for what counts as a trigger
    // (`useTriggerPopup`: position 0, or preceded by whitespace), so a marker the popup was
    // willing to create is always a marker this can find again.
    const pattern = new RegExp(`(^|\\s)>${escapeRegExp(entry.title)}`);
    const match = pattern.exec(text);
    if (!match) continue;

    const start = match.index + match[1].length;
    return { entry, start, end: start + entry.title.length + 1 };
  }

  return null;
}

/** The default agent's display name, for empty states and placeholder copy. */
export function defaultAgentTitle(): string {
  return i18n.t('agent.agents.bettersidebar.name', { defaultValue: 'Better Sidebar' });
}
