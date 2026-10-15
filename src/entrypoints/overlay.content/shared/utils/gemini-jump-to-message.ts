/**
 * Gemini: open a chat and scroll to one message in it.
 *
 * DOM facts this relies on (checked against the live page):
 * - Each turn is a `.conversation-container` whose `id` is the *user* message id
 *   without its `r_` prefix (`r_6e95…` → `#6e95…`).
 * - Inside it sit `<user-query>` and `<model-response>`. The response carries
 *   `message-content-id-r_<same id>`, i.e. it is keyed by the user id too. Model
 *   messages' own `rc_…` ids appear nowhere in the DOM, so a model hit has to be
 *   mapped to the user message before it.
 * - Gemini only renders the newest page of a long chat and fetches older turns
 *   as `chat-window infinite-scroller` is scrolled to the top. Same mechanism the
 *   agent-loop sync uses (`scrollConversationToTop`), so we drive it the same way
 *   and stop as soon as the target turn shows up.
 */

import i18n from '@/locale/i18n';
import { browser } from 'wxt/browser';
import { toast } from '@/shared/lib/toast';
import { navigateToConversation } from '@/shared/lib/navigation';
import { findConversationScroller } from '../modules/agent-loop/tools/sync/conversation-scroller';

interface JumpTarget {
  id: string;
  conversation_id: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Upper bound for loading older pages before handing over to the user. */
const MAX_LOAD_DURATION = 45_000;
/** Pause after each scroll-to-top, giving Gemini time to fetch the next page. */
const STEP_DELAY = 700;

const isUserId = (id: string) => /^r_/.test(id);
const isModelId = (id: string) => /^rc_/.test(id);

const onConversation = (conversationId: string) =>
  location.pathname.includes(conversationId);

/** Resolve the user message id that keys the DOM turn holding `target`. */
async function resolveTurnId(target: JumpTarget): Promise<string | null> {
  if (isUserId(target.id)) return target.id;
  if (!isModelId(target.id)) return null; // Not a native id, nothing in the DOM to match

  try {
    const res = await browser.runtime.sendMessage({
      type: 'GET_ADJACENT_MESSAGE',
      payload: {
        messageId: target.id,
        conversationId: target.conversation_id,
        currentRole: 'model',
      },
    });
    const prevId: string | undefined = res?.success ? res.data?.id : undefined;
    return prevId && isUserId(prevId) ? prevId : null;
  } catch (e) {
    console.error('[JumpToMessage] failed to resolve turn', e);
    return null;
  }
}

function findTurn(turnId: string): HTMLElement | null {
  const bare = turnId.replace(/^r_/, '');
  const byContainer = document.getElementById(bare);
  if (byContainer?.classList.contains('conversation-container')) return byContainer;

  const content = document.querySelector(`[id="message-content-id-${CSS.escape(turnId)}"]`);
  return (content?.closest('.conversation-container') as HTMLElement | null) ?? null;
}

/**
 * Wait for the chat to finish its own load: URL switched, turns rendered, and the
 * turn list stopped changing. Without the last part we'd race Gemini's own
 * scroll-to-bottom, or start scrolling the previous chat's leftover DOM.
 */
async function waitForConversationReady(conversationId: string): Promise<boolean> {
  const deadline = Date.now() + 10_000;
  let lastSignature = '';
  let stableSince = 0;

  while (Date.now() < deadline) {
    if (onConversation(conversationId)) {
      const turns = document.querySelectorAll('chat-window .conversation-container');
      const signature = `${turns.length}:${turns[0]?.id ?? ''}:${turns[turns.length - 1]?.id ?? ''}`;
      if (turns.length > 0) {
        if (signature !== lastSignature) {
          lastSignature = signature;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= 600) {
          return true;
        }
      }
    }
    await wait(100);
  }
  return onConversation(conversationId);
}

type LoadOutcome = HTMLElement | 'reached-top' | 'timed-out' | 'cancelled' | 'no-scroller';

/** Scroll up page by page until the turn is rendered or there's nothing older. */
async function loadUntilFound(
  turnId: string,
  conversationId: string,
  shouldCancel: () => boolean,
): Promise<LoadOutcome> {
  const scroller = findConversationScroller();
  if (!scroller) return 'no-scroller';

  const deadline = Date.now() + MAX_LOAD_DURATION;
  let previousHeight = -1;
  let settledRounds = 0;

  while (Date.now() < deadline) {
    // The user left the chat or hit Stop
    if (shouldCancel() || !onConversation(conversationId)) return 'cancelled';

    const el = findTurn(turnId);
    if (el) return el;

    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    await wait(STEP_DELAY);

    const grew = scroller.scrollHeight !== previousHeight;
    previousHeight = scroller.scrollHeight;
    if (grew || scroller.scrollTop > 4) {
      settledRounds = 0;
      continue;
    }
    // Three quiet rounds at the top: nothing older left to fetch
    if (++settledRounds >= 3) return findTurn(turnId) ?? 'reached-top';
  }
  return findTurn(turnId) ?? 'timed-out';
}

/**
 * Turns use `content-visibility: auto`, so heights above the target are estimates
 * until rendered and the first scroll can land a little off. Jump, let layout
 * settle, then correct.
 */
async function scrollToTurn(turn: HTMLElement, preferModel: boolean) {
  const anchor =
    (preferModel ? (turn.querySelector('model-response') as HTMLElement | null) : null) ?? turn;
  anchor.scrollIntoView({ block: 'start', behavior: 'auto' });
  await wait(300);
  anchor.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

export async function jumpToGeminiMessage(target: JumpTarget): Promise<void> {
  const t = (key: string) => i18n.t(key);

  navigateToConversation(target.conversation_id);

  const [turnId, ready] = await Promise.all([
    resolveTurnId(target),
    waitForConversationReady(target.conversation_id),
  ]);
  if (!turnId || !ready) return;

  const preferModel = isModelId(target.id);

  const visible = findTurn(turnId);
  if (visible) {
    await scrollToTurn(visible, preferModel);
    return;
  }

  // Not rendered yet: older history needs loading first
  let cancelled = false;
  const toastId = toast.withAction(t('search.jumpLoadingEarlier'), 'info', {
    label: t('search.jumpStop'),
    onClick: () => {
      cancelled = true;
    },
  });

  let outcome: LoadOutcome;
  try {
    outcome = await loadUntilFound(turnId, target.conversation_id, () => cancelled);
  } finally {
    toast.dismiss(toastId);
  }

  if (outcome instanceof HTMLElement) {
    await scrollToTurn(outcome, preferModel);
    return;
  }
  if (outcome !== 'cancelled') {
    toast.warning(t('search.jumpNotFound'), 6000);
  }
}
