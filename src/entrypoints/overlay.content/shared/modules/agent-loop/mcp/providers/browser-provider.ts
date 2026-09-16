/**
 * Browser tool providers — tabs, tab groups and bookmarks.
 *
 * Descriptions are written for the model, not for a docs page. Two things are said in every
 * write tool's description rather than once at the top of the soul, because the soul is
 * skimmable and a schema sitting next to the call is not: **this needs approval**, and
 * **whether anything can be got back afterwards**.
 *
 * ## `operations` is a JSON array *string*
 *
 * ⚠️ Against the protocol's own advice, which tells the model to write real JSON arrays for
 * list params. The exception is deliberate: an operation is a heterogeneous object with a
 * `type` discriminant, the background validates it field by field (`parseOperations`), and a
 * malformed one has to be rejectable with a message the model can act on. A string arrives
 * intact and is parsed once, in the one place that knows the rules.
 *
 * ## Two lists, not one
 *
 * Unlike `workspace-provider.ts`, this exports both a constant array and a function.
 * `ALL_BROWSER_TOOLS` is what exists; `availableBrowserTools()` is what the user has permitted
 * and therefore the only part worth putting in a prompt. A tool the user has not granted is
 * not a tool that fails — it is one the model should never have been told about, because being
 * shown `browser_close_tabs` and then refused reads as a bug and gets retried.
 */

import type { ToolDefinition } from '../types';
import {
  BROWSER_TOOLS,
  dependencies,
  isBrowserWrite,
  isWriteCapability,
  toolCapability,
} from '@/shared/browser-agent/contracts';
import { browserExecutor } from '../../tools/browser-tools';
import { useBrowserAgent } from '../../browser/browser-store';

/** Paging params, on every read. The background caps `limit` at 100. */
const PAGING = {
  limit: { type: 'string', description: 'Optional page size, 1–100. Defaults to 50.' },
  offset: { type: 'string', description: 'Optional 0-based start. Page with next_offset from the previous result.' },
} as const;

/**
 * `change_summary` — asked for, not specified.
 *
 * ⚠️ No shape and no length. The version that dictated both got mechanically complete bullet
 * lists nobody read. The extension shows its own object-level preview beside this, so what the
 * note adds is the *intent* behind the batch — and that is not something a format helps with.
 */
const CHANGE_SUMMARY = {
  type: 'string',
  description: 'A short note on what this batch does.',
} as const;

const OPERATIONS = (types: string) => ({
  type: 'string',
  description: `A JSON array, encoded as a string, of 1–30 operations. ${types}`,
});

/** Schemas by tool name. Executors are attached below, so this stays declarative. */
const SCHEMAS: Record<string, ToolDefinition['schema']> = {
  browser_list_tabs: {
    name: 'browser_list_tabs',
    description:
      'List open tabs. Defaults to the window this conversation is in. Returns id, ' +
      'window_id, index, title, url, group_id, pinned, active and protected — the tab ' +
      'hosting this conversation is protected and cannot be moved or closed. Incognito ' +
      'windows are never listed. Read this before planning any change to tabs.',
    parameters: {
      type: 'object',
      properties: {
        window_id: { type: 'string', description: 'Optional window to list. Defaults to the host window.' },
        ...PAGING,
      },
      required: [],
    },
  },
  browser_list_tab_groups: {
    name: 'browser_list_tab_groups',
    description:
      'List tab groups with their id, title, color and collapsed state. Group membership ' +
      'is on the tabs themselves (group_id from browser_list_tabs), not here.',
    parameters: {
      type: 'object',
      properties: {
        window_id: { type: 'string', description: 'Optional window to list. Defaults to the host window.' },
        ...PAGING,
      },
      required: [],
    },
  },
  browser_list_bookmarks: {
    name: 'browser_list_bookmarks',
    description:
      'List one bookmark folder, or search across all of them. Returns id, parent_id, ' +
      'index, title, url, folder and managed — a managed bookmark cannot be changed. ' +
      'Bookmark ids are strings, and the root folder is "0". This reads one level: to walk ' +
      'a tree, call it again with a child folder id.',
    parameters: {
      type: 'object',
      properties: {
        parent_id: { type: 'string', description: 'Folder to list. Defaults to "0" (the root).' },
        query: { type: 'string', description: 'Optional text search over titles and URLs. Ignores parent_id.' },
        ...PAGING,
      },
      required: [],
    },
  },
  browser_query_changes: {
    name: 'browser_query_changes',
    description:
      'Read the local audit journal — every batch this extension applied, what it did and ' +
      'whether it can still be undone. Call it with no batch_id for the list, with a ' +
      'batch_id for that batch\'s steps, and add step_index for the objects one step ' +
      'changed. This is how you find out what happened after a result came back "unknown": ' +
      'inspect it, never blindly retry. Only batches you have read permission for appear.',
    parameters: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Optional batch to expand into its steps.' },
        step_index: { type: 'string', description: 'Optional 0-based step whose changed objects to page through. Needs batch_id.' },
        ...PAGING,
      },
      required: [],
    },
  },
  browser_arrange_tabs: {
    name: 'browser_arrange_tabs',
    description:
      'Rearrange tabs: open, focus, move and pin. Cannot close anything — that is ' +
      'browser_close_tabs, and it needs its own permission. Reversible, but still needs ' +
      'the user to approve this exact batch.',
    parameters: {
      type: 'object',
      properties: {
        operations: OPERATIONS(
          'Types: create {url, window_id?, index?}; activate {tab_id}; ' +
            'move {tab_id, window_id?, index}; pin {tab_id, pinned}.',
        ),
        change_summary: CHANGE_SUMMARY,
      },
      required: ['operations'],
    },
  },
  browser_close_tabs: {
    name: 'browser_close_tabs',
    description:
      'Close tabs. Approved on its own every time, and no setting can waive that. A closed ' +
      'tab can only be brought back by reopening its URL — form input, scroll position and ' +
      'page state are gone. Tidying up does not mean throwing away: unless the user asked ' +
      'for removal in this task, gather what should go into one collapsed group or one ' +
      'bookmark folder and tell them, instead of closing it.',
    parameters: {
      type: 'object',
      properties: {
        operations: OPERATIONS('Only close {tab_id}.'),
        change_summary: CHANGE_SUMMARY,
      },
      required: ['operations'],
    },
  },
  browser_manage_tab_groups: {
    name: 'browser_manage_tab_groups',
    description:
      'Create, rename, recolor, collapse, move and dissolve tab groups. Creating a group ' +
      'returns its real id — use that in a later, separately approved batch rather than ' +
      'guessing. Reversible; still needs approval of this exact batch.',
    parameters: {
      type: 'object',
      properties: {
        operations: OPERATIONS(
          'Types: create {tab_ids:number[], title?, color?}; ' +
            'update {group_id, title?, color?, collapsed?}; move {group_id, window_id?, index}; ' +
            'ungroup {tab_ids:number[]}. Colors: grey, blue, red, yellow, green, pink, purple, cyan, orange.',
        ),
        change_summary: CHANGE_SUMMARY,
      },
      required: ['operations'],
    },
  },
  browser_arrange_bookmarks: {
    name: 'browser_arrange_bookmarks',
    description:
      'Create folders and bookmarks, rename them, and move them between folders. Omit url ' +
      'on a create to make a folder. Cannot delete — that is browser_delete_bookmarks. IDs ' +
      'are strings, and a folder you create here returns a new id you can only use in a ' +
      'later, separately approved batch.',
    parameters: {
      type: 'object',
      properties: {
        operations: OPERATIONS(
          'Types: create {parent_id, title, url?, index?}; update {id, title}; ' +
            'move {id, parent_id, index?}.',
        ),
        change_summary: CHANGE_SUMMARY,
      },
      required: ['operations'],
    },
  },
  browser_delete_bookmarks: {
    name: 'browser_delete_bookmarks',
    description:
      'Delete bookmarks. Approved on its own every time, and no setting can waive that. ' +
      'Deleting a folder deletes everything inside it, and restoring bookmarks later ' +
      'creates new ids. Prefer moving what the user probably does not want into one folder ' +
      'for them to review, and say so.',
    parameters: {
      type: 'object',
      properties: {
        operations: OPERATIONS('Only delete {id}.'),
        change_summary: CHANGE_SUMMARY,
      },
      required: ['operations'],
    },
  },
  browser_undo_changes: {
    name: 'browser_undo_changes',
    description:
      'Reverse a batch this extension applied, found through browser_query_changes. Needs ' +
      'fresh approval like any other write, and stops as soon as it finds that something ' +
      'changed outside the extension since. Tab batches cannot be undone after a browser ' +
      'restart, because tab ids do not survive one.',
    parameters: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'The batch to reverse, from browser_query_changes.' },
        change_summary: CHANGE_SUMMARY,
      },
      required: ['batch_id'],
    },
  },
};

/**
 * Every browser tool, in the order the prompt should present them.
 *
 * Registered in full, permissions or not — this is what decides whether a tool *exists* and
 * whose it is, and a session being reconstructed after a reload identifies its own agent from
 * the calls in the transcript (`agentForTools`). A list that shrank with the permissions would
 * make yesterday's session unrecognisable.
 */
export const ALL_BROWSER_TOOLS: ToolDefinition[] = BROWSER_TOOLS.map((name) => ({
  schema: SCHEMAS[name],
  execute: browserExecutor(name),
}));

/**
 * The tools the user has actually permitted.
 *
 * A tool needs every capability its own implies — moving a tab reads group membership too,
 * or the change could not be described afterwards, let alone undone (`dependencies`).
 * `browser_undo_changes` has no capability of its own: it is offered as soon as anything at
 * all may be written, because until then there is nothing that could need undoing.
 */
export function availableBrowserTools(): ToolDefinition[] {
  const { capabilities } = useBrowserAgent.getState().settings;
  return ALL_BROWSER_TOOLS.filter(({ schema }) => {
    const capability = toolCapability(schema.name);
    if (capability) return dependencies(capability).every((c) => capabilities.includes(c));
    return isBrowserWrite(schema.name) ? capabilities.some(isWriteCapability) : true;
  });
}
