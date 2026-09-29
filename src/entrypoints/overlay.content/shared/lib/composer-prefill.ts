/**
 * Text handed to a freshly opened chat tab — written into its composer, never sent.
 *
 * The producer is the agent's `open_new_chat` tool: the old tab asks the background to
 * open a new chat and parks the text under the new tab's id (`OPEN_NEW_CHAT_TAB`). This
 * side runs on every page load, asks once whether anything is waiting for it, and if so
 * gets it into the composer.
 *
 * Keyed by tab id in the background rather than carried in the URL: both platforms
 * rewrite their new-chat URLs (AI Studio turns `/prompts/new_chat` into `/prompts/<id>`,
 * Gemini bounces through account paths), and a hash or query flag would not reliably
 * survive either — nor should a whole summary sit in the address bar and history.
 *
 * ## Why the write is checked more than once
 *
 * "The composer exists" is not "the composer is final". Both platforms build the page in
 * stages: Gemini can swap the Quill editor out once the app finishes booting, and AI
 * Studio's Angular form can reset the textarea when the prompt model initialises. A single
 * write at first sight is lost to either, silently. So the text is written, then looked
 * at again a few times over the next seconds and rewritten if — and only if — the
 * composer came back **empty**. Anything else in there is the user's, and is never
 * overwritten.
 */

import i18n from '@/locale/i18n';
import { toast } from '@/shared/lib/toast';
import { Platform } from '@/shared/types/platform';
import {
  getEditor as getQuillEditor,
  moveCursorToEnd,
  replaceAllContent as replaceQuillContent,
} from './quill-editor';
import { getTextarea, setValue as setTextareaValue } from './aistudio-editor';

/** How long to wait for the composer to appear at all. Covers a slow first load. */
const FIND_TIMEOUT_MS = 30_000;
const FIND_POLL_MS = 200;
/** Grace after the composer first appears, before the first write. */
const SETTLE_MS = 400;
/**
 * Gaps between re-checks after writing. Adds up to ~5s, which is past the point where
 * either platform has been seen to rebuild its composer on a fresh load.
 */
const RECHECK_GAPS_MS = [600, 1500, 3000];
/** How much of the text has to be found in the composer to count as landed. */
const PROBE_LENGTH = 80;

interface ComposerOps {
  find: () => HTMLElement | null;
  read: (el: HTMLElement) => string;
  write: (el: HTMLElement, text: string) => void;
}

const OPS: Partial<Record<Platform, ComposerOps>> = {
  [Platform.GEMINI]: {
    find: getQuillEditor,
    read: (el) => el.innerText,
    write: (el, text) => {
      el.focus();
      // Paragraph-per-line + input event: the same write the agent uses for its 30k
      // system prompt, so Quill's mutation sync is known to take it.
      replaceQuillContent(el, text);
      moveCursorToEnd(el);
    },
  },
  [Platform.AI_STUDIO]: {
    find: getTextarea,
    read: (el) => (el as HTMLTextAreaElement).value,
    write: (el, text) => {
      // Native setter + input event, or Angular's model never sees it and Run stays
      // disabled — see `setValue`.
      setTextareaValue(el as HTMLTextAreaElement, text);
      el.focus();
    },
  },
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whitespace and the `\u200B` Quill blank-line placeholder carry no meaning here. */
const normalize = (text: string) => text.replace(/[\s\u200B]+/g, '');

/**
 * `setTimeout` polling, not rAF: Chrome stops servicing animation frames in a hidden tab,
 * and a tab the user switched away from during load must still get its text.
 */
async function waitForComposer(ops: ComposerOps): Promise<HTMLElement | null> {
  const deadline = Date.now() + FIND_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const el = ops.find();
    if (el) return el;
    await sleep(FIND_POLL_MS);
  }
  return null;
}

type FillOutcome = 'filled' | 'occupied' | 'no-composer';

async function fillComposer(ops: ComposerOps, text: string): Promise<FillOutcome> {
  if (!(await waitForComposer(ops))) return 'no-composer';
  await sleep(SETTLE_MS);

  const probe = normalize(text).slice(0, PROBE_LENGTH);
  let wrote = false;

  for (const gap of [0, ...RECHECK_GAPS_MS]) {
    if (gap) await sleep(gap);
    const el = ops.find();
    if (!el) continue; // Mid-rebuild; the next check will see the new one.
    const current = normalize(ops.read(el));
    if (current.includes(probe)) continue;
    // Not ours and not empty: the user is typing. Their text wins, always.
    if (current.length > 0) return wrote ? 'filled' : 'occupied';
    ops.write(el, text);
    wrote = true;
  }

  const el = ops.find();
  return el && normalize(ops.read(el)).includes(probe) ? 'filled' : 'no-composer';
}

/** Ask the background for text parked for this tab. Null on anything but a clean answer. */
async function claim(): Promise<string | null> {
  try {
    const response = await browser.runtime.sendMessage({ type: 'CLAIM_COMPOSER_PREFILL' });
    const prompt = response?.success ? response.data?.prompt : null;
    return typeof prompt === 'string' && prompt.trim() ? prompt : null;
  } catch (err) {
    console.warn('[ComposerPrefill] Claim failed:', err);
    return null;
  }
}

/**
 * Run once per page load. Cheap when nothing is waiting — one message round trip.
 *
 * On failure the text is not lost: it was claimed (consumed) already, so the toast offers
 * it on the clipboard behind a click. The click matters — a content script cannot write
 * the clipboard without a user gesture.
 */
export async function applyPendingComposerPrefill(platform: Platform): Promise<void> {
  const ops = OPS[platform];
  if (!ops) return;

  const text = await claim();
  if (!text) return;

  const outcome = await fillComposer(ops, text);
  console.log('[ComposerPrefill] Outcome:', outcome);

  if (outcome === 'filled') {
    toast.info(
      i18n.t('agent.newChat.prefilled', {
        defaultValue: 'Your prompt from the previous chat is in the input box. Review it, then send.',
      }),
      5000,
    );
    return;
  }

  toast.withAction(
    outcome === 'occupied'
      ? i18n.t('agent.newChat.occupied', {
          defaultValue:
            'The input box already had text, so the prompt from the previous chat was not put in. Copy it instead?',
        })
      : i18n.t('agent.newChat.noComposer', {
          defaultValue: 'Could not find the input box for the prompt from the previous chat. Copy it instead?',
        }),
    'warning',
    {
      label: i18n.t('agent.newChat.copy', { defaultValue: 'Copy prompt' }),
      onClick: () => {
        void navigator.clipboard.writeText(text).then(
          () => toast.success(i18n.t('common.copied', { defaultValue: 'Copied' })),
          () => toast.error(i18n.t('agent.newChat.copyFailed', { defaultValue: 'Could not copy' })),
        );
      },
    },
  );
}
