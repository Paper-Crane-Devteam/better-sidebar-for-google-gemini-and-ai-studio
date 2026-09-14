/**
 * AI Studio composer operations — the single entry point, mirroring `quill-editor.ts`.
 *
 * AI Studio's composer is a plain Angular-controlled `<textarea>`, which makes some
 * things much easier than Quill (no document model to keep in sync, no capsules) and
 * two things harder:
 *
 * 1. **Angular owns the value.** A direct `textarea.value = x` is overwritten on the
 *    next change-detection pass, because the `ControlValueAccessor` still holds the old
 *    string. Writes must go through the *native* setter and then announce themselves
 *    with an `input` event, which is what `setValue` does.
 * 2. **Content changes are invisible to MutationObserver.** The text lives in a
 *    property, not in child nodes, so anything watching for "the composer emptied" has
 *    to poll. See `send-watcher.ts`.
 */

import { isImeComposing } from './ime';

/** The prompt textarea, with a looser fallback for markup churn */
const TEXTAREA_SELECTOR = 'ms-chunk-editor ms-prompt-box .prompt-box-container textarea';
const TEXTAREA_SELECTOR_FALLBACK = 'ms-chunk-editor textarea';

/**
 * The Run / Stop button.
 *
 * Scoped through `footer` on purpose: `ms-run-button` also appears on individual chat
 * turns (the per-turn rerun control), and picking one of those up would mean "send"
 * silently re-runs an old turn instead.
 */
const RUN_BUTTON_SELECTOR = 'ms-chunk-editor footer ms-prompt-box ms-run-button button';
const RUN_BUTTON_SELECTOR_FALLBACK = 'ms-prompt-box ms-run-button button';

/** Minimum pause before clicking send (ms) */
const SEND_DELAY_MIN_MS = 800;
/** Maximum pause before clicking send (ms) */
const SEND_DELAY_MAX_MS = 2000;
/** How long to wait for the button to leave its "stop" state */
const STOP_STATE_TIMEOUT_MS = 120000;
/** Poll interval while waiting for the button to become sendable */
const STOP_STATE_POLL_MS = 300;
/** How long to wait for the button to become enabled after content is staged */
const SEND_READY_WAIT_MS = 3000;
/** Poll interval while waiting for the button to become enabled */
const SEND_READY_POLL_MS = 100;

export type AIStudioRunState = 'send' | 'stop' | 'absent' | 'unknown';

// ─── Textarea ────────────────────────────────────────────────────────────────

export function getTextarea(): HTMLTextAreaElement | null {
  return (
    document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR) ||
    document.querySelector<HTMLTextAreaElement>(TEXTAREA_SELECTOR_FALLBACK)
  );
}

export function getText(): string {
  return getTextarea()?.value ?? '';
}

export function getCursorPosition(): number {
  return getTextarea()?.selectionStart ?? 0;
}

/**
 * Write `value` into the textarea in a way Angular actually notices.
 *
 * The native setter is required: Angular defines its own `value` on the element, so
 * assigning through the property writes into the wrong place and the model never
 * updates — the visible symptom is a composer that looks full but a Run button that
 * stays disabled.
 */
export function setValue(textarea: HTMLTextAreaElement, value: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(textarea, value);

  const end = value.length;
  textarea.selectionStart = end;
  textarea.selectionEnd = end;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Replace the whole composer content */
export function replaceAllContent(text: string): void {
  const textarea = getTextarea();
  if (!textarea) return;
  setValue(textarea, text);
}

/** Replace the half-open range `[start, end)` of the composer content */
export function replaceRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  content: string,
): void {
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const next = before + content + after;

  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(textarea, next);

  const cursor = start + content.length;
  textarea.selectionStart = cursor;
  textarea.selectionEnd = cursor;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Append `text` at the end of whatever is already in the composer */
export function insertTextAtEnd(text: string): void {
  const textarea = getTextarea();
  if (!textarea) return;
  setValue(textarea, textarea.value + text);
}

// ─── Run button ──────────────────────────────────────────────────────────────

export function findRunButton(): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(RUN_BUTTON_SELECTOR) ||
    document.querySelector<HTMLButtonElement>(RUN_BUTTON_SELECTOR_FALLBACK)
  );
}

/**
 * Read what the Run button would currently do.
 *
 * Unlike Gemini, AI Studio keeps the button in the DOM at all times and swaps its
 * innards. Two structural tells, both language-independent, in order of reliability:
 *
 * 1. `type` — `submit` while it means "Run", `button` while it means "Stop". Angular
 *    rebinds it per state, and it survives label and icon changes.
 * 2. The spinner (`span.spin`, the `progress_activity` symbol) only exists while a turn
 *    is in flight; the `.run-button-label` span only exists while it does not.
 *
 * `aria-disabled="true"` maps to `absent` rather than to a state of its own, and that is
 * the point of the mapping: AI Studio disables the button when the composer is empty,
 * exactly where Gemini removes it. Both mean "nothing is generating and nobody has
 * typed anything", which is the authoritative idle reading stage ① needs in order to
 * tell "the answer went quiet" from "the message never got sent".
 *
 * ⚠️ It is `aria-disabled`, not the `disabled` property — `button.disabled` is always
 * false here, so a check against it silently passes and we click a dead button.
 */
export function getRunState(button?: HTMLButtonElement | null): AIStudioRunState {
  const btn = button ?? findRunButton();
  if (!btn) return 'absent';

  // Generating: check before the disabled test, since "Stop" is enabled and the two
  // questions are independent.
  if (btn.querySelector('.spin')) return 'stop';
  if (btn.getAttribute('type') === 'button') return 'stop';

  if (btn.getAttribute('aria-disabled') === 'true') return 'absent';

  if (btn.querySelector('.run-button-label')) return 'send';
  if (btn.getAttribute('type') === 'submit') return 'send';

  return 'unknown';
}

/** Human-ish pause: a fixed cadence looks automated and risks rate limiting. */
function randomSendDelay(): number {
  return SEND_DELAY_MIN_MS + Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS);
}

/**
 * Wait for the button to accept a click.
 *
 * Angular needs a few frames to notice a programmatic write, so a single synchronous
 * read right after staging can catch a button that is still `aria-disabled` from when
 * the composer was empty.
 */
async function waitForSendable(timeoutMs = SEND_READY_WAIT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (getRunState() === 'send') return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, SEND_READY_POLL_MS));
  }
}

/** Wait until the button is no longer a stop button. False if it never left. */
async function waitForNotGenerating(timeoutMs = STOP_STATE_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getRunState() !== 'stop') return true;
    await new Promise((r) => setTimeout(r, STOP_STATE_POLL_MS));
  }
  return false;
}

export interface TriggerRunOptions {
  /**
   * Pause a random 0.8–2s before clicking. On for automated sends (gives the DOM time
   * to settle and avoids a robotic cadence); off for sends the user just initiated,
   * where the extra lag would only feel broken.
   */
  humanDelay?: boolean;
}

/**
 * Click Run, with the same three guards as the Gemini path.
 *
 * The button is Run *and* Stop, so clicking during generation aborts the answer instead
 * of sending — that loses a whole round of the agent loop.
 *
 * Returns whether a click actually happened.
 */
export async function triggerRun(options: TriggerRunOptions = {}): Promise<boolean> {
  const { humanDelay = true } = options;

  // Let Angular's change detection catch up with the staged content
  await new Promise((r) => setTimeout(r, 150));

  if (!(await waitForNotGenerating())) {
    console.warn('[AIStudioEditor] Run button stuck in stop state, not clicking');
    return false;
  }

  if (!(await waitForSendable())) {
    const textarea = getTextarea();
    if (textarea && textarea.value.trim()) {
      // Content is there but Angular never reacted to it: nudge it and retry.
      console.warn('[AIStudioEditor] Run button still disabled while composer has content, nudging');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      if (!(await waitForSendable(1000))) {
        console.warn('[AIStudioEditor] Run button never became sendable', describeComposer());
        return false;
      }
    } else {
      console.warn('[AIStudioEditor] Nothing to send', describeComposer());
      return false;
    }
  }

  if (humanDelay) {
    await new Promise((r) => setTimeout(r, randomSendDelay()));
  }

  // Re-resolve and re-check: the delay above is long enough for the state to flip (e.g.
  // the user sent something meanwhile).
  const btn = findRunButton();
  if (!btn?.isConnected) {
    console.warn('[AIStudioEditor] Run button detached before click', describeComposer());
    return false;
  }
  if (getRunState(btn) !== 'send') {
    console.warn('[AIStudioEditor] Run button no longer sendable, not clicking', {
      state: getRunState(btn),
    });
    return false;
  }

  btn.click();
  return true;
}

/**
 * Snapshot of the composer, logged when a send can't go through.
 *
 * The button's enabled state follows the composer's content, so "not sendable" is
 * usually a staging failure rather than a selector problem. This tells the two apart.
 */
export function describeComposer(): Record<string, unknown> {
  const textarea = getTextarea();
  const btn = findRunButton();
  return {
    textareaFound: !!textarea,
    textLength: textarea?.value.length ?? -1,
    runButtonFound: !!btn,
    runState: getRunState(btn),
    runButtonType: btn?.getAttribute('type') ?? null,
    runButtonAriaDisabled: btn?.getAttribute('aria-disabled') ?? null,
    runButtonHTML: btn?.outerHTML.slice(0, 300) ?? null,
  };
}

// ─── Send Interceptor ────────────────────────────────────────────────────────

let interceptorInstalled = false;

/**
 * Module-level registered onBeforeSend callback.
 *
 * Single-slot, like the Gemini one: both the Run-button click and the Enter keydown path
 * route through here so they can't disagree about what a send means.
 */
let registeredBeforeSendHandler: (() => boolean) | null = null;

/**
 * Register a beforeSend handler. Returns true from the handler to claim the send.
 * Returns an unregister function.
 */
export function registerBeforeRunHandler(handler: () => boolean): () => void {
  registeredBeforeSendHandler = handler;
  return () => {
    if (registeredBeforeSendHandler === handler) {
      registeredBeforeSendHandler = null;
    }
  };
}

/**
 * Intercept both ways a user can send, so a staged agent entry can be swapped for the
 * assembled prompt before it goes out.
 *
 * ⚠️ Capture phase, on `document`. Angular replaces the button node wholesale, so the
 * listener has to be delegated; and it has to run before AI Studio's own handler,
 * because by the time that has run the message is already on its way.
 *
 * ⚠️ The keyboard half is not optional even though the button is the documented path.
 * AI Studio lets the user choose between Enter and Ctrl/Cmd+Enter for sending, and we
 * cannot read that preference — so an uncaught keypress would send the raw `>Skill name`
 * text as an ordinary chat message. That failure is invisible to the user and looks
 * exactly like a broken skill, so both Enter shapes are claimed while a send is pending.
 * Shift+Enter is left alone: it is a newline under every setting.
 *
 * ⚠️ And it must ignore Enter while an IME is composing — see `isImeComposing`. Claiming
 * it there is what made the feature look broken for anyone typing Chinese.
 */
export function installRunInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('ms-run-button')) return;
      // Per-turn rerun buttons live in the transcript, not the composer
      if (!target.closest('footer')) return;
      if (!registeredBeforeSendHandler) return;

      if (registeredBeforeSendHandler()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (isImeComposing(e)) return;
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (!registeredBeforeSendHandler) return;

      const textarea = getTextarea();
      if (!textarea || e.target !== textarea) return;

      if (registeredBeforeSendHandler()) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}
