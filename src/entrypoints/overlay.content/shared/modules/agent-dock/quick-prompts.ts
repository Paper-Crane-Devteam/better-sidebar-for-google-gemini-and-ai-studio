/**
 * Starter sentences for the quick-prompt row above the composer.
 *
 * ⚠️ Deliberately **not** the Agent tab's examples. Those are long on purpose — they show how
 * much you *may* say, with conditions and "show me first" spelled out. These do the opposite
 * job: they land in the chat input next to the agent capsule, and the user keeps typing after
 * them. So each one is a single short sentence with no requirements attached, and many end
 * on an open slot ("about ", "for ") so the natural next keystroke finishes the thought.
 * A starter that already says "group by topic, reuse my tags, show me the plan" is a
 * starter the user has to edit before they can extend it.
 *
 * `label` is what the button shows; `text` is what goes in. A trailing space means "the
 * sentence continues here" — the cursor ends up right after it.
 */

import type { AgentId } from '../agent-loop/agents/types';

export interface QuickPrompt {
  /** i18n key under `agent.quickPrompts.<agentId>`, holding `label` and `text`. */
  key: string;
  /** English fallback for the button. A few words. */
  label: string;
  /** English fallback for the starter sentence. */
  text: string;
}

const QUICK_PROMPTS: Record<AgentId, QuickPrompt[]> = {
  bettersidebar: [
    { key: 'organize', label: 'Organize chats', text: 'Sort my unfiled conversations into folders' },
    { key: 'search', label: 'Find chats', text: 'Find conversations about ' },
    { key: 'tag', label: 'Tag chats', text: 'Tag my recent conversations by topic' },
    { key: 'export', label: 'Export chats', text: 'Export as Markdown the conversations about ' },
    { key: 'prompts', label: 'Tidy prompts', text: 'Clean up my prompt library' },
    { key: 'snippets', label: 'Tidy snippets', text: 'Sort my snippets into folders' },
    { key: 'theme', label: 'Design a theme', text: 'Make me a theme that feels ' },
    { key: 'handover', label: 'Continue in a new chat', text: 'Summarize this chat and continue it in a new chat' },
    { key: 'stats', label: 'Show stats', text: 'How many conversations are in each folder?' },
  ],
  workspace: [
    { key: 'list', label: 'List files', text: 'What files are in my workspace?' },
    { key: 'summarize', label: 'Summarize a file', text: 'Summarize the file ' },
    { key: 'review', label: 'Review a document', text: 'Review the document ' },
    { key: 'analyze', label: 'Analyze a spreadsheet', text: 'Analyze the spreadsheet ' },
    { key: 'search', label: 'Search files', text: 'Search my files for ' },
    { key: 'notes', label: 'Save chat as notes', text: 'Save the key points of this chat as a note' },
    { key: 'create', label: 'Create a file', text: 'Create a file that ' },
    { key: 'translate', label: 'Translate subtitles', text: 'Translate the subtitles into ' },
  ],
  browser: [
    { key: 'listTabs', label: 'List open tabs', text: 'What have I got open in this window?' },
    { key: 'group', label: 'Group tabs', text: 'Group my tabs by topic' },
    { key: 'duplicates', label: 'Find duplicates', text: 'Find my duplicate tabs' },
    { key: 'bookmarkWindow', label: 'Bookmark this window', text: 'Bookmark this window into a new folder' },
    { key: 'sortBookmarks', label: 'Sort bookmarks', text: 'Sort my bookmarks bar into folders' },
    { key: 'findBookmark', label: 'Find bookmarks', text: 'Find my bookmarks about ' },
    { key: 'open', label: 'Open tabs', text: 'Open tabs for ' },
  ],
  web: [
    { key: 'summarize', label: 'Summarize this page', text: 'Summarize the page I have open' },
    { key: 'extract', label: 'Extract a table', text: 'Extract the table on this page as Markdown' },
    { key: 'fill', label: 'Fill a form', text: 'Fill in the form on this page with ' },
    { key: 'open', label: 'Open a site', text: 'Open ' },
  ],
};

export function getQuickPrompts(agentId: AgentId): QuickPrompt[] {
  return QUICK_PROMPTS[agentId] ?? [];
}
