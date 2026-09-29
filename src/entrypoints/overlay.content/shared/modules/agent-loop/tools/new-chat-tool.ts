/**
 * `open_new_chat` — start a fresh conversation in a new tab, optionally with a prompt
 * waiting in its input box.
 *
 * The use it exists for: a conversation has grown long enough that the model is losing
 * the thread, and the user wants to carry on somewhere clean without retyping the
 * context. The AI writes the hand-over (goal, decisions, open questions) as
 * `initial_prompt`; this opens the new chat and the new tab puts that text in its
 * composer — **unsent**, so the user reads it before anything goes to the model.
 *
 * A new tab rather than navigating this one: the conversation being summarised stays
 * where it is, open, for comparison and for anything the summary missed.
 *
 * Listed in `HANDOFF_TOOLS`: after it the user's attention is in the other tab, and
 * there is no follow-up turn in this one worth waiting for. The session ends on success.
 * Gated behind an approval always, speed mode included (see `requiresApproval`) — it
 * opens a tab and the user asked to be asked.
 *
 * Returns a string and never throws, like every tool.
 */

import { Platform, detectPlatform } from '@/shared/types/platform';
import { ROUND_BUDGET } from '../engine/stages/handoff/budget';

/**
 * The new tab's composer has the same physical ceiling as this one, so the same budget
 * applies. Over it, the tail would be silently cut off in the new tab — refused here
 * instead, where the AI can still shorten it.
 */
const MAX_PROMPT_CHARS = ROUND_BUDGET;

/**
 * The new-chat URL for the platform we're on, in the same Google account.
 *
 * ⚠️ The account has to be carried over explicitly. Someone signed into several accounts
 * is on `/u/1/...` (Gemini) or `?authuser=1` (AI Studio); a bare new-chat URL opens
 * account 0 — a different history, a different library, and the wrong place entirely.
 */
export function buildNewChatUrl(location: Location = window.location): string | null {
  const platform = detectPlatform();

  if (platform === Platform.GEMINI) {
    const account = location.pathname.match(/^\/u\/(\d+)\//)?.[1];
    return `https://gemini.google.com${account ? `/u/${account}` : ''}/app`;
  }

  if (platform === Platform.AI_STUDIO) {
    const url = new URL('https://aistudio.google.com/prompts/new_chat');
    const authuser = new URLSearchParams(location.search).get('authuser');
    if (authuser) url.searchParams.set('authuser', authuser);
    return url.toString();
  }

  return null;
}

export async function openNewChat(params: Record<string, string>): Promise<string> {
  const prompt = (params.initial_prompt ?? '').trim();

  if (prompt.length > MAX_PROMPT_CHARS) {
    return (
      `ERROR: initial_prompt is ${prompt.length} characters, and the chat input holds at most ` +
      `${MAX_PROMPT_CHARS}. Nothing was opened. Shorten it — keep the goal, the decisions and ` +
      `the open questions, drop the narrative — and call open_new_chat again.`
    );
  }

  const url = buildNewChatUrl();
  if (!url) return 'ERROR: open_new_chat only works on Gemini and AI Studio.';

  try {
    const response = await browser.runtime.sendMessage({
      type: 'OPEN_NEW_CHAT_TAB',
      payload: { url, prompt: prompt || undefined },
    });
    if (!response?.success) {
      return `ERROR: Could not open a new tab - ${response?.error ?? 'no response from the extension'}`;
    }
  } catch (err) {
    return `ERROR: Could not open a new tab - ${(err as Error)?.message ?? String(err)}`;
  }

  return prompt
    ? 'Opened a new chat in a new tab and placed initial_prompt in its input box, unsent. ' +
        'The user reviews it and sends it themselves. This session ends here.'
    : 'Opened a new chat in a new tab. This session ends here.';
}
