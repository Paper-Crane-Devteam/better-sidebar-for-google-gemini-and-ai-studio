/**
 * Agent entries — what the `>` popup and the Agent tab launcher offer.
 *
 * There used to be two triggers: `>` picked a skill, `!` activated the agent
 * without preselecting one. They produced nearly the same message, needed two
 * editor-integration instances, and only one of them could own the shared
 * send-button handler. Now there is a single list whose first item is the
 * "let the AI decide" entry.
 */

import type { Skill } from './skills/types';
import { getSkillsForPopup, getSkillById } from './skills/skill-registry';
import i18n from '@/locale/i18n';
import { isChromeBuild, type AgentKind } from '@/shared/browser-agent/contracts';
import { useBrowserAgent } from '../browser-agent/client';

/** Sentinel id for "run the agent, let it pick a skill itself" */
export const AGENT_AUTO_ID = '__agent_auto__';
export const BROWSER_AUTO_ID = '__browser_agent__';
export function browserEntryNeedsPermission(id: string) {
  const caps = useBrowserAgent.getState().settings.capabilities;
  if (id === '__browser_tabs__') return !caps.includes('tabs.read');
  if (id === '__browser_groups__') return !caps.includes('tabGroups.read');
  if (id === '__browser_bookmarks__') return !caps.includes('bookmarks.read');
  return id === BROWSER_AUTO_ID && !caps.some(c => c.endsWith('.read'));
}

export interface AgentEntry {
  agentKind?: AgentKind;
  focus?: string;
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Text stored on the capsule; stripped from the editor before assembling */
  capsuleContent: string;
  /** The skill to preload, or undefined for the auto entry */
  skill?: Skill;
}

function browserEntries(): AgentEntry[] {
  if (!isChromeBuild()) return [];
  return [
    [BROWSER_AUTO_ID, 'Browser Agent', '整理 Chrome 标签页、标签组和收藏夹'],
    ['__browser_tabs__', '整理标签页', 'Organize tabs in the current window.'],
    ['__browser_groups__', '管理标签组', 'Organize tab groups in the current window.'],
    ['__browser_bookmarks__', '整理收藏夹', 'Organize bookmarks using titles and URLs.'],
  ].map(([id, title, focus]) => ({ id, title, focus, description: browserEntryNeedsPermission(id) ? '🔒 尚未授权 · 点击打开权限设置' : focus, icon: 'Globe', capsuleContent: title, agentKind: 'browser' }));
}

function getAutoEntry(): AgentEntry {
  return {
    id: AGENT_AUTO_ID,
    title: i18n.t('agent.entry.autoTitle', { defaultValue: 'Better Sidebar Agent' }),
    description: i18n.t('agent.entry.autoDescription', { defaultValue: 'Describe a task and let the agent pick the right tools' }),
    icon: 'Bot',
    capsuleContent: 'Better Sidebar Agent',
  };
}

function toEntry(skill: Skill): AgentEntry {
  return {
    id: skill.id,
    title: skill.title,
    description: skill.description,
    icon: skill.icon,
    capsuleContent: skill.promptContent,
    skill,
  };
}

/** All entries: auto first, then enabled skills. */
export function getAgentEntries(): AgentEntry[] {
  return [getAutoEntry(), ...browserEntries(), ...getSkillsForPopup().map(toEntry)];
}

/** Resolve an entry by id (works for both the auto sentinel and skill ids). */
export function getAgentEntryById(id: string): AgentEntry | undefined {
  const browser = browserEntries().find(e => e.id === id);
  if (browser) return browser;
  if (id === AGENT_AUTO_ID) return getAutoEntry();
  const skill = getSkillById(id);
  return skill ? toEntry(skill) : undefined;
}

/** Match entries against a query (multi-word AND over title + description).
 *
 * The auto entry ("Better Sidebar Agent") is always kept at the top as a group
 * header/anchor so the tree structure stays visible even when filtering.
 */
export function searchAgentEntries(query: string): AgentEntry[] {
  const entries = getAgentEntries();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (words.length === 0) return entries.slice(0, 9); // auto + up to 8 skills

  const matched = entries.filter((e) => {
    const haystack = `${e.title} ${e.description}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });

  // Always keep auto entry at position 0 if there are any matches
  const hasAuto = matched.some((e) => e.id === AGENT_AUTO_ID);
  if (!hasAuto && matched.length > 0) {
    matched.unshift(getAutoEntry());
  }

  return matched.slice(0, 9);
}
