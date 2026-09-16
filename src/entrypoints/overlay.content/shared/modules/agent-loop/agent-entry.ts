/**
 * Agent entries — what the `>` popup and the Agent tab launcher offer.
 *
 * ## One row per agent, and nothing else
 *
 * The list has been through three shapes. First two triggers: `>` picked a skill, `!` ran
 * without one. Then one list whose first row was "let the AI decide" and whose rest were
 * skills. Then agents, but with the Browser agent contributing four rows — itself plus
 * "Organize tabs", "Manage tab groups", "Organize bookmarks", each carrying a `focus` string
 * that was quietly appended to the prompt.
 *
 * All of that is gone. Picking a skill up front meant committing to an approach before seeing
 * any data, and the wrong guess cost the whole session. The pre-aimed browser rows had a
 * different problem: they looked like four choices but answered the same question the same
 * way, so the list implied a decision that did not exist — and "Organize tabs" is a sentence
 * the user could simply type.
 *
 * What is left is genuinely a decision only they can make: **which of their things this is
 * about.** Their conversations, their files, or their browser. One row each.
 *
 * ⚠️ It follows that this module is agent-agnostic. Anything an entry has to say about a
 * specific agent — the Browser agent's "not authorized yet", for instance — comes from that
 * agent's own definition (`AgentDefinition.unavailable`), never from a branch here.
 */

import i18n from '@/locale/i18n';
import { AGENTS, getAgent, localizedAgent, normalizeAgentId } from './agents/registry';
import type { AgentDefinition, AgentId } from './agents/types';

/**
 * Legacy sentinel for "run the agent, let it pick a skill itself".
 *
 * Still exported because it is written into the `[#bs-agent:…#]` marker of every message
 * ever sent through the old list, and those conversations still have to render. `getAgent`
 * maps it onto the Better Sidebar agent.
 */
export const AGENT_AUTO_ID = '__agent_auto__';

export interface AgentEntry {
  /** The agent id. Goes into the capsule and the prompt marker. */
  id: string;
  title: string;
  description: string;
  icon: string;
  /**
   * Text the capsule stores, and the text stripped back out to recover what the user typed
   * around it.
   *
   * Equal to the title, which is what makes the round trip exact: the capsule shows
   * `>Workspace`, expands to `Workspace`, and removing that leaves the user's own words. When
   * entries were skills this held the entire skill prompt, so expansion dumped thousands of
   * characters into the composer before they were stripped again.
   */
  capsuleContent: string;
  /** The agent this entry runs. */
  agent: AgentDefinition;
}

/**
 * One agent as a row.
 *
 * The description is where an unavailable agent explains itself, rather than the row being
 * hidden or disabled. Hiding it means the user cannot discover the feature at all; disabling
 * it means the click that would tell them what is missing does nothing. So the row stays
 * clickable and says what is wrong, and picking it runs `unavailable().resolve` — which for
 * the Browser agent opens the permissions window.
 */
function toEntry(agent: AgentDefinition): AgentEntry {
  const localized = localizedAgent(agent);
  return {
    id: localized.id,
    title: localized.name,
    description: localized.unavailable?.()?.reason ?? localized.description,
    icon: localized.icon,
    capsuleContent: localized.name,
    agent: localized,
  };
}

/** Every agent, in display order. */
export function getAgentEntries(): AgentEntry[] {
  return AGENTS.map(toEntry);
}

/**
 * Resolve an entry by id.
 *
 * Never returns undefined for a *known* id shape — `getAgent` falls back to the default agent
 * for anything unrecognised, including the old skill and shortcut ids that historical markers
 * still carry. A conversation from before this change renders as the agent it was.
 */
export function getAgentEntryById(id: string): AgentEntry | undefined {
  return toEntry(getAgent(id));
}

/** The agent id an entry id refers to. */
export function agentIdFromEntry(id: string): AgentId {
  return normalizeAgentId(id);
}

/**
 * Match entries against the popup's query.
 *
 * With three rows there is nothing to page through, so an empty query returns all of them and
 * a query returns whatever matches — including nothing, which correctly closes the popup and
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
