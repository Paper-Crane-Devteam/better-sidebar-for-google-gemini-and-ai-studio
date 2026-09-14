/**
 * Assembling the message that starts a session — and deciding what gets cut.
 *
 * ## The bug this exists to prevent
 *
 * Both platform features used to do this:
 *
 * ```ts
 * let full = `${marker}\n${basePrompt}`;
 * if (userInput) full += `\n\n## User Request\n\n${userInput}`;
 * if (full.length > MAX) full = full.substring(0, MAX);   // ⚠️
 * ```
 *
 * The user's request is appended **last**, so a truncation from the end removes exactly
 * the one part of the message that cannot be reconstructed. And it did: the system prompt
 * grew to ~28.7k of a 30k budget, one extra tool schema pushed it over, and from then on
 * every task started with the instructions intact and the actual request silently gone.
 * The user saw the agent begin working on nothing, with a `console.warn` as the only
 * trace.
 *
 * This is the same failure mode `budget.ts` documents for tool results — over-budget text
 * is dropped where nothing downstream can tell — and it gets the same treatment: cut in
 * code, protect the irreplaceable part, and leave a notice the model can read.
 *
 * ## The policy
 *
 * 1. **The request is never cut to make room for instructions.** If the total is over
 *    budget, the *instructions* give way, because a truncated prompt still describes most
 *    of the tools while a truncated request is a task nobody asked for.
 * 2. **Instructions give up at most `USER_RESERVE` characters.** Past that the request is
 *    not a task description any more, it is pasted content, and cutting the prompt further
 *    would take away the part that explains how to end the loop.
 * 3. **Both cuts announce themselves in-band**, so the model knows its context is
 *    incomplete instead of inferring that a tool does not exist.
 *
 * ⚠️ If a truncation notice ever shows up in normal use, the fix is not a bigger budget —
 * it is a smaller prompt. `## Database Schema` alone is a quarter of it.
 */

import { ROUND_BUDGET } from '../engine/stages/handoff/budget';

/**
 * Ceiling for the opening message.
 *
 * Deliberately the same number the loop's own results are held to, imported rather than
 * re-declared: it is the same composer, measured once
 * (`COMPOSER_CHAR_LIMIT - SAFETY_MARGIN`), and the two hardcoded `30000`s this replaces
 * were a second and third source of truth for it. `insertText` on both platforms goes
 * through the same paragraph-per-line rewrite the margin accounts for.
 */
export const INITIAL_MESSAGE_LIMIT = ROUND_BUDGET;

/**
 * Characters the instructions will surrender to fit the user's request.
 *
 * A task longer than this is almost always pasted material that belongs in a workspace
 * file. The number matters less than the fact that there is one: without a floor, a long
 * paste would eat the prompt entirely and the agent would arrive with no tools and no way
 * to finish.
 */
const USER_RESERVE = 8000;

export interface InitialMessageInput {
  /** `[#bs-agent:<entryId>#]`, the line that marks this turn as the agent's. */
  marker: string;
  /** The assembled system prompt. */
  basePrompt: string;
  /** What the user typed around the capsule/marker. May be empty. */
  userInput: string;
}

export interface InitialMessage {
  /** What to put in the composer. */
  text: string;
  /** Characters of `basePrompt` that were dropped. 0 in the normal case. */
  promptCut: number;
  /** Characters of `userInput` that were dropped. 0 in the normal case. */
  userCut: number;
}

export function buildInitialMessage({
  marker,
  basePrompt,
  userInput,
}: InitialMessageInput): InitialMessage {
  const head = `${marker}\n`;
  const request = userInput.trim();

  if (request === '') {
    // Nothing to protect: clamp the prompt and say so if it had to happen.
    const room = INITIAL_MESSAGE_LIMIT - head.length;
    if (basePrompt.length <= room) {
      return { text: head + basePrompt, promptCut: 0, userCut: 0 };
    }
    // Sized with the whole length first: the omitted count can never have more digits
    // than the total, so one pass is enough to reserve room for the notice. Same trick as
    // `budget.ts`'s `truncateSection`.
    const reserve = promptNotice(basePrompt.length).length;
    const kept = basePrompt.slice(0, Math.max(0, room - reserve));
    return {
      text: head + kept + promptNotice(basePrompt.length - kept.length),
      promptCut: basePrompt.length - kept.length,
      userCut: 0,
    };
  }

  const openBlock = '\n\n## User Request\n\n';
  const fixed = head.length + openBlock.length;

  // How much the request may occupy: whatever is free after the prompt, and if that is
  // not enough, up to `USER_RESERVE` taken back from the prompt.
  const freeAfterPrompt = INITIAL_MESSAGE_LIMIT - fixed - basePrompt.length;
  const requestAllowance = Math.max(
    0,
    Math.min(
      request.length,
      Math.max(freeAfterPrompt, Math.min(USER_RESERVE, INITIAL_MESSAGE_LIMIT - fixed)),
    ),
  );

  let keptRequest = request;
  let userCut = 0;
  if (request.length > requestAllowance) {
    const reserve = userNotice(request.length).length;
    const body = request.slice(0, Math.max(0, requestAllowance - reserve));
    userCut = request.length - body.length;
    keptRequest = body + userNotice(userCut);
    console.warn(
      `[AgentLoop] The user's request is ${request.length} characters and had to be cut ` +
        `by ${userCut} to fit one message.`,
    );
  }

  const promptRoom = INITIAL_MESSAGE_LIMIT - fixed - keptRequest.length;

  if (basePrompt.length <= promptRoom) {
    return {
      text: head + basePrompt + openBlock + keptRequest,
      promptCut: 0,
      userCut,
    };
  }

  const reserve = promptNotice(basePrompt.length).length;
  const keptPrompt = basePrompt.slice(0, Math.max(0, promptRoom - reserve));
  console.warn(
    `[AgentLoop] The system prompt is ${basePrompt.length} characters and does not fit ` +
      `alongside the user's request; ${basePrompt.length - keptPrompt.length} characters ` +
      'of instructions were cut. The prompt needs to get smaller.',
  );

  return {
    text:
      head +
      keptPrompt +
      promptNotice(basePrompt.length - keptPrompt.length) +
      openBlock +
      keptRequest,
    promptCut: basePrompt.length - keptPrompt.length,
    userCut,
  };
}

/**
 * What the model reads where the instructions stop.
 *
 * Names the consequence rather than the event: a model told "text was removed" carries on
 * as if nothing happened, while one told "a tool you need may not be described above"
 * asks instead of inventing a tool call.
 */
function promptNotice(omitted: number): string {
  return (
    `\n\n[TRUNCATED by Better Sidebar: ${omitted} characters of the instructions above ` +
    'were removed so the user\'s request would fit in this message. If something you need ' +
    'is not described above — a tool, a rule, an id — say so and ask, rather than ' +
    'guessing at it. The user\'s request follows and is complete.]'
  );
}

function userNotice(omitted: number): string {
  return (
    `\n\n[TRUNCATED by Better Sidebar: the request was ${omitted} characters longer than ` +
    'one message can carry. Work with what is above, and tell the user that the rest was ' +
    'cut — suggest they put long material in a workspace file instead.]'
  );
}
