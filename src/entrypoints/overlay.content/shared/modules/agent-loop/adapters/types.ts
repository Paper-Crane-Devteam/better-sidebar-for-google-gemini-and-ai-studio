/**
 * One tool result, as it will be shown to the user while it waits in the composer.
 *
 * Imported from the formatter rather than redeclared here, even though that points from
 * the adapter layer down into the engine: the formatter owns the result wire format, and
 * a second same-shaped definition is the kind that quietly drifts. Type-only, so nothing
 * links at runtime.
 */
import type { ResultSection } from '../engine/stages/handoff/formatter';

/**
 * What the composer's send control is currently saying.
 *
 * The four values are not four shades of the same thing — `absent` and `unknown`
 * mean opposite things and must not be merged:
 *
 * - `stop` — a turn is in flight. Authoritative.
 * - `send` — there is content and it can go out. Authoritative.
 * - `absent` — the platform is telling us nothing is generating *and* nobody is
 *   typing. Gemini removes the button entirely in that state; AI Studio keeps it but
 *   marks it `aria-disabled`. Different DOM, same authoritative fact, so both map
 *   here — stage ① uses it to tell "went quiet" from "never got sent".
 * - `unknown` — a control was found but none of the fallbacks could classify it,
 *   i.e. our selectors are lost. Nothing about it can be trusted.
 *
 * Collapsing `absent` into `unknown` is what once made a provably idle page look
 * identical to a broken selector, and the loop reported "the AI went silent" for
 * messages that had never left the composer.
 */
export type ComposerState = 'send' | 'stop' | 'absent' | 'unknown';

export type { ResultSection };

/**
 * Platform Adapter Interface.
 * Each supported platform implements this to allow the AgentLoopEngine
 * to interact with platform-specific DOM (editor, send button, AI responses).
 */
export interface AgentPlatformAdapter {
  /** Get the input editor DOM element */
  getEditor(): HTMLElement | null;

  /** Insert text into the editor (replaces current content) */
  insertText(text: string): void;

  /**
   * Programmatically trigger the send button.
   * Resolves false when the click was refused (e.g. the platform is still
   * generating and the button is currently "stop"), so callers can react instead
   * of assuming the message went out.
   */
  triggerSend(options?: { humanDelay?: boolean }): Promise<boolean>;

  /** Get the current text content of the editor */
  getText(): string;

  /** Get cursor position (character offset) */
  getCursorPosition(): number;

  /**
   * Observe AI response completion.
   * Resolves with the AI response DOM container element once the turn has finished.
   *
   * `idleTimeoutMs` is a budget for **silence, not for the whole turn**: every sign
   * that the turn is alive (output growing, the platform reporting it is generating)
   * must reset it. An implementation that treats it as a total timeout will kill long
   * answers mid-generation.
   *
   * Rejects once that silence budget runs out. It has to be able to reject: a
   * platform that errors out never completes a turn, and DOM-based detection can
   * stop recognising its own signals, so "wait forever" would leave the engine stuck
   * with no explanation.
   *
   * Rejects with `ResponseWaitError` so the caller can tell "went quiet" from "the
   * message never got there" — the second one must not wait out the whole budget,
   * and must not be reported as the AI being slow.
   */
  observeAIResponseComplete(idleTimeoutMs: number): Promise<HTMLElement>;

  /**
   * How many user turns the conversation currently holds.
   *
   * The only positive proof that a message was accepted. Everything else about
   * sending is inferred from the composer emptying, which is also what happens when
   * a message is silently dropped — and treating that as success is what left the
   * loop waiting for an answer to something the model never received. A turn in the
   * transcript, by contrast, only ever appears because a message landed, and it
   * stays there.
   */
  countUserTurns(): number;

  /**
   * Extract plain text from an AI response DOM container.
   * Handles Markdown-rendered DOM structures.
   */
  extractResponseText(responseElement: HTMLElement): string;

  /** Get the last AI response DOM container element */
  getLastAIResponseElement(): HTMLElement | null;

  /**
   * Read the composer's send control.
   *
   * On the interface rather than imported from a platform module because two things
   * outside the adapter depend on it and neither knows which platform it is on:
   * stage ① reads it to decide whether a turn is running, and the send watcher reads
   * it as proof of delivery. Both used to import Gemini's `getSendButtonState`
   * directly, which is why AI Studio could never work no matter what the adapter did.
   */
  getComposerState(): ComposerState;

  /**
   * Stage tool results as collapsed chips, one per section, and report whether they
   * landed.
   *
   * Optional, and absence is a normal answer rather than a gap to fill: it needs a
   * rich editor that can hold non-text nodes. AI Studio's composer is a plain
   * `<textarea>`, so there is nothing to implement and the caller falls back to
   * writing the wrapped payload as text.
   */
  stageResultCapsules?(sections: ResultSection[]): Promise<boolean>;

  /** Whether capsules staged by `stageResultCapsules` are still in the composer */
  hasStagedCapsules?(): boolean;
}
