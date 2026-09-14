/**
 * The examples the Agent tab teaches with.
 *
 * The tab used to carry its own textarea, which made the sidebar a second way in
 * alongside `>` in the chat input — two entry points for one action, and the sidebar one
 * had to reimplement staging, clearing and failure reporting around a box the user could
 * type into. There is one entry now (`>` in the chat input), so what the tab owes the
 * user is not another input but an answer to "what do I type".
 *
 * Hence: worked examples, deliberately over-specified. A one-liner like "organize my
 * chats" teaches that the agent takes one-liners; these teach that it takes conditions,
 * exceptions, an order of operations and a "show me before you touch anything" — which is
 * the part nobody guesses. They are kept long on purpose.
 *
 * One per module the agent can reach, so the list doubles as the feature inventory:
 * conversations, search, export, sync, prompts, snippets, workspace files, stats.
 */

export interface AgentExample {
  /** Lucide icon name, resolved by the launcher. */
  icon: string;
  /** i18n key under `agent.launcher.examples`, holding `label` and `text`. */
  key: string;
  /** English fallback for the short scenario name. */
  label: string;
  /** English fallback for the example prompt itself. */
  text: string;
}

export const AGENT_EXAMPLES: AgentExample[] = [
  {
    icon: 'FolderTree',
    key: 'classify',
    label: 'Organize conversations',
    text:
      'Sort out the conversations I never filed. Group them by topic and show me the plan first. ' +
      'Create folders where the ones I have do not fit, then move them in, and tag each one by ' +
      'what it is about — reuse my existing tags instead of making near-duplicates.',
  },
  {
    icon: 'Search',
    key: 'search',
    label: 'Find things by content',
    text:
      'Find everything that mentions Docker deployment — conversations, message bodies and ' +
      'snippets, not just titles. List them newest first with a one-line summary each, and say ' +
      'which folder every one is in.',
  },
  {
    icon: 'Download',
    key: 'export',
    label: 'Export and archive',
    text:
      'Export the conversations in my Work folder from March onwards as Markdown, one file per ' +
      'conversation, zipped. If any of them have no messages recorded yet, tell me which before ' +
      'you export the rest.',
  },
  {
    icon: 'RefreshCw',
    key: 'sync',
    label: 'Fill in missing messages',
    text:
      'Check how many conversations are just a title with no messages saved. Give me the total ' +
      'and the most recent ones first, then sync the latest 20 so search and export can see them.',
  },
  {
    icon: 'Wand2',
    key: 'prompts',
    label: 'Clean up the prompt library',
    text:
      'Go through my prompt library. Rename the ones I could never find by typing / so the word ' +
      'I would search for comes first. Pull the role and output-format block that repeats across ' +
      'several prompts into one shared prompt and import it into the rest. Where a variable only ' +
      'has a few valid values, turn it into a dropdown instead of a blank.',
  },
  {
    icon: 'Bookmark',
    key: 'snippets',
    label: 'Tidy up snippets',
    text:
      'My snippet inbox has piled up. Group it into folders by topic and move them in, shorten ' +
      'the titles that are still my original question into something descriptive, and where the ' +
      'same text was saved twice keep the oldest. Show me the list before deleting anything.',
  },
  {
    icon: 'FileText',
    key: 'workspace',
    label: 'Keep notes and files',
    text:
      'Write up what we settled on in this chat as notes/decisions.md in the workspace — bullet ' +
      'points, with the open questions at the end. If the file is already there, append to it ' +
      'under today\'s date instead of overwriting it.',
  },
  {
    icon: 'BarChart3',
    key: 'stats',
    label: 'Look at the numbers',
    text:
      'Give me a table of how many conversations are in each folder, how many I added in the last ' +
      'month, and which folders have not been touched in three months. Then suggest which ones ' +
      'are worth merging.',
  },
];
