/**
 * open_new_chat MCP Tool Provider.
 */

import type { ToolDefinition } from '../types';
import { openNewChat } from '../../tools/new-chat-tool';
import { OPEN_NEW_CHAT_TOOL } from '../../engine/parser/tool-schema';

export const newChatProvider: ToolDefinition = {
  schema: {
    name: OPEN_NEW_CHAT_TOOL,
    description:
      'Open a new, empty chat in a new browser tab, optionally with a prompt waiting in its input ' +
      'box (not sent — the user reviews and sends it). This conversation stays open in its own tab. ' +
      'Use it when the user wants to continue elsewhere with a clean context, e.g. "summarize this and ' +
      'start a new chat". You already have this conversation in context — write the summary yourself, ' +
      'no need to query the database for it. TERMINAL: the session ends after it, so make it the last ' +
      'call in your response, do not add complete_task, and tell the user in prose beforehand what ' +
      'the new chat will contain. The user must approve it.',
    parameters: {
      type: 'object',
      properties: {
        initial_prompt: {
          type: 'string',
          description:
            'Optional. The text to place in the new chat\'s input box, written to the model that will ' +
            'read it, in the language the user writes in. For a hand-over: the goal, what was decided, ' +
            'key facts and constraints, open questions, and what to do next — self-contained, because ' +
            'the new chat sees none of this conversation. Markdown is fine. Leave it out for an empty chat.',
        },
      },
      required: [],
    },
  },
  execute: async (params) => openNewChat(params),
};
