/**
 * Workspace file tool providers.
 *
 * Descriptions are written for the model, not for a docs page: each one says when to
 * reach for the tool and what the common mistake is, because that is what changes
 * behaviour. `write_file` carries a `change_summary` for the same reason
 * `execute_sql` does — it is what the user reads in the approval card, and they
 * cannot be expected to review a file body.
 */

import type { ToolDefinition } from '../types';
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  listFilesTool,
  globFilesTool,
  grepFilesTool,
  manageFilesTool,
} from '../../tools/workspace-tools';

export const readFileProvider: ToolDefinition = {
  schema: {
    name: 'read_file',
    description:
      'Read a text file from the workspace. Returns the content with 1-based line ' +
      'numbers. Read a file before editing it — edit_file requires text that matches ' +
      'exactly.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to the workspace root, e.g. "notes/plan.md".',
        },
        offset: {
          type: 'string',
          description: 'Optional 1-based first line to return. Use for large files.',
        },
        limit: {
          type: 'string',
          description: 'Optional maximum number of lines to return.',
        },
      },
      required: ['path'],
    },
  },
  execute: readFileTool,
};

export const writeFileProvider: ToolDefinition = {
  schema: {
    name: 'write_file',
    description:
      'Create a file, or completely replace an existing one. Parent directories are ' +
      'created automatically. This overwrites the whole file — to change part of an ' +
      'existing file, use edit_file instead.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path relative to the workspace root.',
        },
        content: {
          type: 'string',
          description: 'The full text content of the file.',
        },
        change_summary: {
          type: 'string',
          description:
            'One plain-language sentence describing what this file is and whether it ' +
            'replaces existing content. This is what the user reads when deciding ' +
            'whether to allow the write, so do not paste the content here. ' +
            'Example: "Creates notes/plan.md with the 5-step migration outline."',
        },
      },
      required: ['path', 'content'],
    },
  },
  execute: writeFileTool,
};

export const editFileProvider: ToolDefinition = {
  schema: {
    name: 'edit_file',
    description:
      'Replace literal text in an existing file. old_string must appear exactly once ' +
      'unless replace_all is true — if it appears more than once the edit is refused, ' +
      'so include enough surrounding lines to identify one location. Read the file ' +
      'first so old_string matches character for character, including indentation.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root.' },
        old_string: {
          type: 'string',
          description: 'The exact text to replace, including whitespace and newlines.',
        },
        new_string: {
          type: 'string',
          description: 'The replacement text. Use an empty string to delete the match.',
        },
        replace_all: {
          type: 'string',
          description: 'Set to "true" to replace every occurrence. Defaults to false.',
        },
        change_summary: {
          type: 'string',
          description:
            'One plain-language sentence describing what this edit changes, for the ' +
            'user\'s approval card. Example: "Renames the getUser function to fetchUser ' +
            'in api.ts."',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  execute: editFileTool,
};

export const listFilesProvider: ToolDefinition = {
  schema: {
    name: 'list_files',
    description:
      'List the contents of a workspace directory. Call it with no path to see the ' +
      'workspace root. Use this to find out what exists before guessing at paths.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory to list. Omit for the workspace root.',
        },
        recursive: {
          type: 'string',
          description: 'Set to "true" to list the whole subtree. Defaults to false.',
        },
      },
      required: [],
    },
  },
  execute: listFilesTool,
};

export const globFilesProvider: ToolDefinition = {
  schema: {
    name: 'glob_files',
    description:
      'Find files by path pattern. Supports *, ** (crosses directories), ? and ' +
      '{a,b} alternation. A pattern with no "/" matches the filename at any depth, so ' +
      '"*.md" finds every markdown file in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern, e.g. "**/*.ts" or "notes/*.md".',
        },
        path: {
          type: 'string',
          description: 'Optional directory to search under. Defaults to the root.',
        },
      },
      required: ['pattern'],
    },
  },
  execute: globFilesTool,
};

export const grepFilesProvider: ToolDefinition = {
  schema: {
    name: 'grep_files',
    description:
      'Search file contents with a regular expression. Returns matching lines with ' +
      'their line numbers, grouped by file. Case-insensitive by default. Use this to ' +
      'locate something across the workspace, then read_file for context.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'JavaScript regular expression to search for.',
        },
        path: {
          type: 'string',
          description: 'Optional directory to search under. Defaults to the root.',
        },
        include: {
          type: 'string',
          description: 'Optional glob filter for which files to search, e.g. "*.ts".',
        },
        case_sensitive: {
          type: 'string',
          description: 'Set to "true" for a case-sensitive search.',
        },
      },
      required: ['pattern'],
    },
  },
  execute: grepFilesTool,
};

export const manageFilesProvider: ToolDefinition = {
  schema: {
    name: 'manage_files',
    description:
      'Delete, move/rename, or create a directory in the workspace. Deleting a ' +
      'non-empty directory needs recursive set to "true".',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'One of: delete, move, mkdir.',
        },
        path: {
          type: 'string',
          description: 'Target path, for delete and mkdir.',
        },
        from: { type: 'string', description: 'Source path, for move.' },
        to: { type: 'string', description: 'Destination path, for move.' },
        recursive: {
          type: 'string',
          description: 'Set to "true" to delete a directory and everything in it.',
        },
        change_summary: {
          type: 'string',
          description:
            'One plain-language sentence naming what will be removed or moved, and ' +
            'how much, for the user\'s approval card. Deletion cannot be undone. ' +
            'Example: "Deletes the drafts/ folder and the 3 files in it."',
        },
      },
      required: ['action'],
    },
  },
  execute: manageFilesTool,
};

/** Every workspace tool, in the order the prompt should present them. */
export const WORKSPACE_TOOLS: ToolDefinition[] = [
  readFileProvider,
  writeFileProvider,
  editFileProvider,
  listFilesProvider,
  globFilesProvider,
  grepFilesProvider,
  manageFilesProvider,
];
