/**
 * Document tool providers.
 *
 * One tool, and that is a decision rather than a starting point. Five formats × "outline /
 * read a part / search" would be fifteen schemas in **every** prompt, for a capability
 * most sessions never use. `manage_files` already set the precedent: fold the variants
 * into a parameter and keep the prompt short.
 *
 * ⚠️ **This description is deliberately terse, and must stay that way.** The assembled
 * system prompt sits at roughly 29k of a ~30k ceiling (`prompts/initial-message.ts`), so
 * every character here is taken from the user's own request. The first draft of this
 * schema was 1249 characters and that alone pushed the message over the limit, which
 * silently dropped the user's task. Guidance that is better placed in a skill — how to
 * work through a document, what to do about tracked changes — belongs there, where it is
 * loaded on demand, not here where it is loaded always.
 */

import type { ToolDefinition } from '../types';
import { editDocumentTool, readDocumentTool } from '../../tools/document-tools';

export const readDocumentProvider: ToolDefinition = {
  schema: {
    name: 'doc_read',
    description:
      'Read .docx, .xlsx, .pptx or .pdf documents. Path alone ' +
      'returns the outline; then read one part. Output is capped, so never ask for all of it.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace path.' },
        mode: { type: 'string', description: 'outline (default) | range | search' },
        range: {
          type: 'string',
          description:
            'docx: "p12-p48", table "t3", cell "t3r2c1", part "hd1"/"fn". xlsx: ' +
            '"Sheet1!A1:F50". PPTX: "1-3". PDF: "1-3", "annotations:1-3", "fields:1-3".',
        },
        query: { type: 'string', description: 'search mode: literal text.' },
      },
      required: ['path'],
    },
  },
  execute: readDocumentTool,
};

/**
 * `doc_edit`.
 *
 * ⚠️ The `ops` description names the verbs and stops. The full parameter list per verb is
 * roughly 900 characters *per format* and lives in the `docx-review` and
 * `spreadsheet-analysis` skills instead — the model gets it by activating one, which is
 * exactly the trade the skill mechanism exists for: two cheap schemas always, thirty-odd
 * operations when they are needed. The cost of adding Excel to this schema was about 150
 * characters; adding its parameters would have been two thousand.
 *
 * `mode` is documented as an escape hatch rather than a choice, because the tool already
 * defaults to `track` and a schema that presents the two evenly is a schema that gets
 * `direct` half the time.
 */
export const editDocumentProvider: ToolDefinition = {
  schema: {
    name: 'doc_edit',
    description:
      'Change a .docx, .xlsx, .pptx or .pdf (PDF: annotations/forms/pages only). Word edits become tracked changes the user accepts or ' +
      'rejects; in Word, locate text by quoting it exactly from doc_read, never by paragraph ' +
      'number. In Excel, cells are addressed as "Sheet1!C2".',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace path.' },
        ops: {
          type: 'array',
          description:
            'Real JSON array of objects, NOT a quoted string. Each uses op (not type). docx: replace_text | set_text | comment | insert_paragraph | ' +
            'delete_paragraph | set_style | insert_table | insert_row | delete_row | ' +
            'delete_table. xlsx: set_cell | set_cells | add_column | clear_cells | ' +
            'add_sheet | rename_sheet. Activate the docx-review or spreadsheet-analysis ' +
            "skill for each one's parameters; PDF: activate builtin-pdf-review; PPTX: activate builtin-pptx-review.",
        },
        mode: {
          type: 'string',
          description: 'docx only. Omit. "direct" overwrites text with no way to review it.',
        },
      },
      required: ['path', 'ops'],
    },
  },
  execute: editDocumentTool,
};

/** Every document tool, in the order the prompt should present them. */
export const DOCUMENT_TOOLS: ToolDefinition[] = [
  readDocumentProvider,
  editDocumentProvider,
];
