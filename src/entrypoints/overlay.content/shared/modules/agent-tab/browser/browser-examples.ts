/**
 * What to ask the Browser agent for.
 *
 * The panel used to open on a permission summary and an empty record list, which answered
 * questions nobody had yet. A user who has just switched to this agent needs one thing:
 * a sentence they could plausibly type. So the panel now teaches the same way the Better
 * Sidebar one does — worked examples in a carousel, then the short requests underneath.
 *
 * ## Two lists, because they teach different things
 *
 * {@link BROWSER_EXAMPLES} are long on purpose, and the length is the lesson: conditions,
 * exclusions, and "show me before you touch anything" are what a first-time user does not
 * think to ask for. One per thing the agent can reach, so the set doubles as an inventory —
 * tabs, groups, bookmarks, opening, closing.
 *
 * {@link BROWSER_PHRASES} are the opposite: six words, no conditions, the thing you type on
 * the fifth day. They exist because the examples are intimidating as a *first* impression of
 * how much you have to write, and a row of short ones says "or just ask".
 *
 * ⚠️ **Nothing here asks for a deletion without saying so.** "Tidy up my tabs" must not be
 * offered as shorthand for closing them — that reading is exactly what `browser-soul.ts`
 * spends a block overruling, and an example that relied on it would teach the habit back.
 * Where an example does involve removal it says the word, and the batch is still approved on
 * its own.
 */

import type { AgentExample } from '../components/agent-examples';

export const BROWSER_EXAMPLES: AgentExample[] = [
  {
    icon: 'Layers',
    key: 'group',
    label: 'Group tabs by topic',
    text:
      'Look at the tabs in this window and group them by what they are about. Name each group ' +
      'for the topic and give it a colour, leave the pinned ones alone, and show me the plan ' +
      'before you move anything. Do not close anything.',
  },
  {
    icon: 'Search',
    key: 'duplicates',
    label: 'Find duplicates',
    text:
      'Find the tabs I have open more than once. Treat two addresses as the same page only if ' +
      'the query and fragment match too. List them grouped by page, oldest first, and tell me ' +
      'how many I would get back — do not close them yet.',
  },
  {
    icon: 'Bookmark',
    key: 'stash',
    label: 'Park tabs as bookmarks',
    text:
      'I want this window down to the handful I am actually working in. Bookmark everything ' +
      'else into a new folder named for today, keep the pinned tabs and anything from my ' +
      'company domain open, then show me the list before you close a single tab.',
  },
  {
    icon: 'ListTree',
    key: 'bookmarks',
    label: 'Sort the bookmarks',
    text:
      'Go through my bookmarks bar. Group the loose ones into folders by topic and move them ' +
      'in, rename the ones whose title is still the page title into something I would ' +
      'recognise, and tell me which ones look like duplicates instead of deleting them.',
  },
  {
    icon: 'Pin',
    key: 'open',
    label: 'Set up a workspace',
    text:
      'Open the tabs I need for a review session: our repo, the issue tracker and the design ' +
      'doc. Put them in one group called Review, pin the repo, and leave everything I already ' +
      'have open where it is.',
  },
  {
    icon: 'Trash2',
    key: 'prune',
    label: 'Clear out the dead ends',
    text:
      'Show me the bookmarks that look stale — untitled ones, search result pages, anything ' +
      'saved twice. List them with the folder each one is in, and let me pick which to delete ' +
      'rather than deciding for me.',
  },
];

/** A short request, and the i18n key holding it. Staged into the composer as-is. */
export interface BrowserPhrase {
  key: string;
  text: string;
}

export const BROWSER_PHRASES: BrowserPhrase[] = [
  { key: 'listTabs', text: 'What have I got open in this window?' },
  { key: 'groupThis', text: 'Group these tabs by topic' },
  { key: 'findDupes', text: 'Find my duplicate tabs' },
  { key: 'bookmarkAll', text: 'Bookmark this window into a new folder' },
  { key: 'sortBar', text: 'Tidy up my bookmarks bar' },
  { key: 'pinFew', text: 'Pin the tabs I keep switching back to' },
];
