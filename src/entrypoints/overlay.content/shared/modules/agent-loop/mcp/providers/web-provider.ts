/**
 * Web Agent tools — reading and operating pages through `chrome.debugger`.
 *
 * Every tool runs in the background (`background/handlers/web-agent.ts`); these are schemas
 * plus a forwarder. Descriptions are written for the model and say, next to each write,
 * that it needs approval — the soul is skimmable, a schema beside the call is not.
 *
 * Params are strings, like every other tool here: the parser hands everything over as text.
 */

import type { ToolDefinition } from '../types';
import { WEB_TOOLS } from '@/shared/web-agent/contracts';
import { runWebTool } from '../../web/web-store';

const TAB_ID = {
  type: 'string',
  description: 'Optional when exactly one tab is in scope. Otherwise a tab_id from page_list.',
} as const;

const REF = {
  type: 'string',
  description: 'An element ref like "e12" from the most recent page_snapshot of this tab.',
} as const;

const CHANGE_SUMMARY = { type: 'string', description: 'A short note on what this action does.' } as const;

const SCHEMAS: Record<string, ToolDefinition['schema']> = {
  page_list: {
    name: 'page_list',
    description:
      'List the tabs you may work on: tab_id, title, url, and whether you are currently attached ' +
      '(Chrome shows a debugging bar on attached tabs). Tabs outside this list are invisible to you — ' +
      'when none here fits the task, open the site you need with page_open rather than giving up.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  page_snapshot: {
    name: 'page_snapshot',
    description:
      'Read the page as text: title, URL, scroll position, then the visible content in document ' +
      'order. Interactive elements appear as `[e12] button "Save"`, `[e7] input[email] ' +
      'label="Email" value="…"` — the ref is what page_click and page_type take. Refs only live ' +
      'until the next snapshot: after anything changes the page, snapshot again. Long pages are ' +
      'cut off at max_chars; scroll with page_run_js or read a specific part with it.',
    parameters: {
      type: 'object',
      properties: {
        tab_id: TAB_ID,
        max_chars: { type: 'string', description: 'Optional, 2000–20000. Defaults to 12000.' },
      },
      required: [],
    },
  },
  page_open: {
    name: 'page_open',
    description:
      'Open an http(s) URL — in a new tab that joins your scope, or in an existing tab of your ' +
      'scope when tab_id is given. Waits for the page to load. Needs the user\'s approval.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full http(s) URL.' },
        tab_id: { type: 'string', description: 'Optional: navigate this tab instead of opening a new one.' },
        change_summary: CHANGE_SUMMARY,
      },
      required: ['url'],
    },
  },
  page_click: {
    name: 'page_click',
    description:
      'Click an element by ref with a real mouse event (scrolls it into view first). Reports the ' +
      'page title and URL afterwards, and warns when something else was covering the element. ' +
      'Needs the user\'s approval.',
    parameters: { type: 'object', properties: { ref: REF, tab_id: TAB_ID, change_summary: CHANGE_SUMMARY }, required: ['ref'] },
  },
  page_type: {
    name: 'page_type',
    description:
      'Type text into an input, textarea or editable element by ref, as real keystrokes. By ' +
      'default replaces what is there. Needs the user\'s approval.',
    parameters: {
      type: 'object',
      properties: {
        ref: REF,
        text: { type: 'string', description: 'What to type.' },
        clear: { type: 'string', description: '"false" to append instead of replacing. Defaults to "true".' },
        submit: { type: 'string', description: '"true" to press Enter afterwards.' },
        tab_id: TAB_ID,
        change_summary: CHANGE_SUMMARY,
      },
      required: ['ref', 'text'],
    },
  },
  page_run_js: {
    name: 'page_run_js',
    description:
      'Run JavaScript in the page, like the DevTools console. `code` is the body of an async ' +
      'function: use `await` freely and `return` the value you want back (JSON-serialisable; ' +
      'large results are truncated). `__bsRef("e12")` returns the element behind a ref from the ' +
      'last snapshot. Best for reading tables, lists or anything the snapshot cut off, and for ' +
      'scrolling (`scrollBy(0, innerHeight)`). Set read_only to "true" when the script only ' +
      'reads or scrolls — it then runs without asking. Otherwise the user sees and approves the ' +
      'exact code. Prefer page_click / page_type for interacting when they work — synthetic ' +
      'events from scripts are often ignored by pages.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Function body. End with `return …` to get a value.' },
        read_only: {
          type: 'string',
          description:
            '"true" only when the script changes nothing: reading the DOM, location, storage, ' +
            'computed styles; scrolling. Anything that clicks, types, submits, navigates, sends ' +
            'a request with side effects (fetch POST etc.), or edits the page/storage must leave ' +
            'this out — it needs approval.',
        },
        tab_id: TAB_ID,
        change_summary: CHANGE_SUMMARY,
      },
      required: ['code'],
    },
  },
};

export const ALL_WEB_TOOLS: ToolDefinition[] = WEB_TOOLS.map((name) => ({
  schema: SCHEMAS[name],
  execute: (params) => runWebTool(name, params),
}));
