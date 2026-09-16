/**
 * execute_sql MCP Tool Provider.
 */

import type { ToolDefinition } from '../types';
import { executeSql } from '../../tools/execute-sql';

export const sqlProvider: ToolDefinition = {
  schema: {
    name: 'execute_sql',
    description:
      'Execute SQL queries against the local conversation database. Supports SELECT, INSERT, UPDATE, DELETE.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The SQL statement to execute',
        },
        // ⚠️ No format, no example, no "the user decides from this". It used to carry all
        // three, and the model answered with defensive paragraphs that nobody read. What is
        // useful is knowing *what* changed without reading SQL; how to say that is its call.
        change_summary: {
          type: 'string',
          description:
            'For INSERT/UPDATE/DELETE, a short note naming what changes. Omit for SELECT.',
        },
      },
      required: ['query'],
    },
  },
  // `change_summary` is deliberately not passed on: it exists for the approval UI, and
  // the tool has no use for it. See NON_IDENTITY_PARAMS.
  execute: async (params) => executeSql({ query: params.query }),
};
