/**
 * What to ask the Web Agent for.
 *
 * ⚠️ Placeholder set — rough first pass, to be rewritten once the agent's real strengths are
 * clearer. Same shape as `browser-examples.ts`: long, with the "show me first" conditions a
 * first-time user does not think to add.
 */

import type { AgentExample } from '../components/agent-examples';

export const WEB_EXAMPLES: AgentExample[] = [
  {
    icon: 'FileText',
    key: 'summarize',
    label: 'Summarize a page',
    text:
      'Read the article in my current tab and give me the key points in five bullets, ' +
      'plus anything it claims that I should double-check.',
  },
  {
    icon: 'ListTree',
    key: 'extract',
    label: 'Pull data out of a page',
    text:
      'Extract the main table on the page I have open as Markdown. Keep the column names ' +
      'as they are and tell me if any rows look cut off or paginated.',
  },
  {
    icon: 'Search',
    key: 'compare',
    label: 'Compare a few pages',
    text:
      'Open the product pages for the three options I list below, compare price, specs and ' +
      'return policy side by side, and tell me which one you would pick and why.',
  },
  {
    icon: 'Wand2',
    key: 'fill',
    label: 'Fill in a form',
    text:
      'Fill in the form on this page with the details below. Stop before the submit button ' +
      'and show me what you entered so I can check it.',
  },
];
