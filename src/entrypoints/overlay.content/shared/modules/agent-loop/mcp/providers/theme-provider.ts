/**
 * Theme MCP tool providers — list, create, apply.
 *
 * The schemas are deliberately thin on the theme format itself: the full variable list runs
 * to a couple of hundred lines and belongs in the skill (`builtin-theme-design`), which is
 * loaded only once a session is actually about themes. Carrying it in every prompt would
 * cost every unrelated task the same tokens.
 *
 * What the schemas do carry is the one thing the model gets wrong without being told: the
 * theme goes in as a real JSON object, not a JSON string. See `asParamValue` in the parser.
 */

import type { ToolDefinition } from '../types';
import { applyThemeById, createTheme, listThemes } from '../../tools/theme-tools';

export const listThemesProvider: ToolDefinition = {
  schema: {
    name: 'list_themes',
    description:
      'List every theme available — built-in presets and the user\'s own saved themes — and ' +
      'say which one is active right now. Call it before creating or applying a theme: it is ' +
      'how you learn the current theme (needed for "make it warmer than this one") and the ' +
      'exact ids apply_theme accepts.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  execute: async () => listThemes(),
};

export const createThemeProvider: ToolDefinition = {
  schema: {
    name: 'create_theme',
    description:
      'Save a theme you designed as one of the user\'s own custom themes. It is validated ' +
      'first and rejected with specific errors if incomplete, so read the result. This only ' +
      'saves it — it does not switch to it. Activate the "Design a Theme" skill before ' +
      'writing one: the required variables are in there, and a theme missing them is refused.',
    parameters: {
      type: 'object',
      properties: {
        theme: {
          type: 'object',
          description:
            'The theme itself, as a real JSON object inside params — {"theme": {"id": ' +
            '"warm-sunset", "name": "...", "variables": [...]}}. Do not wrap it in quotes or ' +
            'a code fence: a JSON string holding JSON has to be escaped twice and the whole ' +
            'call is discarded when that goes wrong. An id that is already one of the user\'s ' +
            'themes replaces it; an id belonging to a built-in theme is refused.',
        },
      },
      required: ['theme'],
    },
  },
  execute: async (params) => createTheme({ theme: params.theme }),
};

export const applyThemeProvider: ToolDefinition = {
  schema: {
    name: 'apply_theme',
    description:
      'Switch the page and the sidebar to a theme. Takes effect immediately and is visible ' +
      'to the user, so ask before using it on a theme they did not ask for. Without a ' +
      'Support Pack this runs as a timed preview instead — the result says which happened, ' +
      'so report what it tells you rather than assuming.',
    parameters: {
      type: 'object',
      properties: {
        theme_id: {
          type: 'string',
          description:
            'The id from list_themes, e.g. "tokyo-night" or a custom theme\'s id. Pass ' +
            '"default" to remove the custom theme and go back to the platform\'s own look.',
        },
      },
      required: ['theme_id'],
    },
  },
  execute: async (params) => applyThemeById({ theme_id: params.theme_id }),
};
