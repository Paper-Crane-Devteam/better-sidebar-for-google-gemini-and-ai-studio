/**
 * Confirming that the staged results actually reached the model.
 *
 * There is no callback for "the platform accepted my message", so this is done in two
 * steps, and both are needed:
 *
 * 1. **The payload leaves the composer.** Works whoever pressed send — our own click,
 *    Enter, the button — which is why it's observed rather than assumed.
 * 2. **Something proves it landed.** A composer that empties is *also* what a dropped
 *    message looks like: staging racing with itself, the editor being rebuilt on SPA
 *    navigation, the platform clearing the input on an error. Step 1 alone called all
 *    of those a success, the round advanced, and stage ① then waited 30s for an answer
 *    to a message that was never sent — reported to the user as "the AI went silent",
 *    with a Retry that re-entered the same wait. Twice quiet is not the same as sent.
 *
 * Proof is either the composer reading "stop generating" (a turn is in flight) or a new
 * user turn in the transcript. The second one is the sturdier of the two: it can only
 * appear because a message landed, and it doesn't go away.
 */

import type { AgentPlatformAdapter } from '../../../adapters/types';
import { AbortError } from '../../guards/abort';
import { isStaged, type StagedShape } from './staging';

/** Upper bound on how long the loop will sit waiting for a send */
const SEND_WAIT_TIMEOUT_MS = 300000; // 5 min
/** Grace period after the payload vanishes, letting the platform process it */
const POST_SEND_SETTLE_MS = 500;

/**
 * How often the composer is re-checked while waiting for the payload to leave.
 *
 * ⚠️ A clock is not redundant next to the observer, it is the only thing that works on
 * a `<textarea>`: AI Studio's composer holds its content in the `value` *property*, and
 * property writes produce no mutation records at all. Observer-only, the wait sat there
 * for the full five minutes after a perfectly successful send, then reported the
 * results as never delivered.
 */
const PAYLOAD_POLL_MS = 200;

/**
 * How long to look for proof of delivery once the composer is empty.
 *
 * Short on purpose: an accepted send starts a turn within a few hundred ms (the control
 * flips to "stop" straight away, even on a slow connection), and the user-turn check is
 * permanent once it's true. Waiting longer would only postpone reporting a message that
 * is already gone.
 */
const DELIVERY_PROOF_TIMEOUT_MS = 4000;
/** Poll interval while looking for proof */
const DELIVERY_PROOF_POLL_MS = 200;

/**
 * - `sent` — confirmed delivered.
 * - `still-staged` — the payload never left the composer; nothing was sent.
 * - `unconfirmed` — the composer emptied but nothing shows the message arrived. The
 *   payload is gone from the input, so the way forward is a re-send, not a "send it
 *   again from the chat box".
 */
export type SendOutcome = 'sent' | 'still-staged' | 'unconfirmed';

export interface WaitForSendOptions {
  adapter: AgentPlatformAdapter;
  shape: StagedShape;
  /** Cancels the wait immediately; rejects with AbortError */
  signal?: AbortSignal;
}

/**
 * Wait for the staged payload to leave the composer and then for proof it arrived.
 *
 * Rejects with `AbortError` if the run is cancelled while waiting.
 *
 * Observers are armed synchronously, before the first await, so callers can safely kick
 * off the send after calling this — a fast send can't slip through the gap.
 */
export async function waitForSend(options: WaitForSendOptions): Promise<SendOutcome> {
  const turnsBefore = options.adapter.countUserTurns();

  if (!(await waitForPayloadToLeave(options))) return 'still-staged';

  await sleep(POST_SEND_SETTLE_MS);

  return (await waitForDeliveryProof(options, turnsBefore)) ? 'sent' : 'unconfirmed';
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resolve true once the payload is gone from the composer, false on timeout */
function waitForPayloadToLeave({
  adapter,
  shape,
  signal,
}: WaitForSendOptions): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const editor = adapter.getEditor();
    if (!editor) {
      resolve(false);
      return;
    }

    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      clearInterval(poll);
      observer.disconnect();
      parentObserver.disconnect();
      signal?.removeEventListener('abort', onAbort);
    };

    const finish = (left: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(left);
    };

    // Abort must interrupt immediately. When this only reacted to DOM mutations,
    // stopping the loop while idle left it hanging here forever.
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new AbortError());
    };

    // Report the miss rather than rejecting, so the caller can pause with a reason
    const timeout = setTimeout(() => finish(false), SEND_WAIT_TIMEOUT_MS);

    const check = () => {
      // Asked of the adapter rather than of a captured element: on SPA navigation the
      // composer node is replaced, and the stale one keeps answering "still staged"
      // forever.
      if (adapter.getEditor() && !isStaged(adapter, shape)) finish(true);
    };

    const observer = new MutationObserver(check);
    observer.observe(editor, { childList: true, subtree: true, characterData: true });

    // The editor element itself can be replaced on SPA navigation, so watch the parent
    // too and re-resolve the editor when it fires.
    const parentObserver = new MutationObserver(check);
    if (editor.parentElement) {
      parentObserver.observe(editor.parentElement, { childList: true, subtree: true });
    }

    // See PAYLOAD_POLL_MS — a `<textarea>` emits no mutations for its own content.
    const poll = setInterval(check, PAYLOAD_POLL_MS);

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Look for evidence the message actually reached the model.
 *
 * Polled rather than observed: one of the two signals is a class on a control that
 * Angular replaces wholesale, and the other is a node count — neither is a mutation
 * worth binding an observer to.
 */
async function waitForDeliveryProof(
  { adapter, signal }: WaitForSendOptions,
  turnsBefore: number,
): Promise<boolean> {
  const deadline = Date.now() + DELIVERY_PROOF_TIMEOUT_MS;

  for (;;) {
    if (signal?.aborted) throw new AbortError();

    // A turn is in flight — only a delivered message starts one
    if (adapter.getComposerState() === 'stop') return true;

    // Our message is in the transcript. Sturdier than the control state: it stays true,
    // so it still holds for an answer that finished before we looked.
    if (adapter.countUserTurns() > turnsBefore) return true;

    if (Date.now() >= deadline) {
      console.warn('[AgentLoop] Composer emptied but nothing confirms the message was sent', {
        turnsBefore,
        turnsNow: adapter.countUserTurns(),
        composerState: adapter.getComposerState(),
      });
      return false;
    }

    await sleep(DELIVERY_PROOF_POLL_MS);
  }
}
