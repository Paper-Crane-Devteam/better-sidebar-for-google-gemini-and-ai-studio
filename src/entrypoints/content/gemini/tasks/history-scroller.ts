/**
 * Drives Gemini's native sidebar conversation history to the very end.
 *
 * Gemini's dedicated history page (`/search`) no longer lazy-loads more
 * conversations when its container is scrolled, so the sidebar's
 * `infinite-scroller` is the only surface that still requests older pages.
 * Scrolling it makes Gemini fire its own list-chat requests, which the API
 * scanner picks up.
 */

import { trace } from '@/shared/lib/trace';

/** Spinner Gemini shows inside the sidebar history while a page is loading. */
const SPINNER_SELECTOR = '.loading-history-spinner-container';

/** Sidebar-scoped selectors, tried in order. */
const SIDEBAR_SCROLLER_SELECTORS = [
  'bard-sidenav infinite-scroller',
  '.sidenav-with-history-container infinite-scroller',
  'conversations-list infinite-scroller',
];

/**
 * Locate the sidebar history scroller.
 *
 * The chat window uses `infinite-scroller` too, so a bare
 * `querySelector('infinite-scroller')` can resolve to the wrong element
 * depending on document order. Always prefer sidebar-scoped selectors.
 */
export function findHistoryScroller(): HTMLElement | null {
  for (const selector of SIDEBAR_SCROLLER_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) {
      trace(`[BS History] matched scroller via "${selector}"`);
      return el as HTMLElement;
    }
  }

  const all = Array.from(
    document.querySelectorAll('infinite-scroller'),
  ) as HTMLElement[];

  const fallback =
    all.find((el) => el.querySelector(SPINNER_SELECTOR)) ??
    all.find((el) => !el.closest('chat-window')) ??
    null;

  console.warn(
    `[BS History] no sidebar-scoped match; ${all.length} infinite-scroller(s) on page, fallback=${
      fallback ? 'found' : 'none'
    }`,
  );
  return fallback;
}

export function waitForHistoryScroller(
  timeout = 10000,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = findHistoryScroller();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = findHistoryScroller();
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

function waitForSpinnerStopLoading(
  scroller: HTMLElement,
  timeout = 20000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const spinner = scroller.querySelector(SPINNER_SELECTOR);
    // No spinner, or spinner already idle → nothing to wait for.
    if (!spinner || !spinner.classList.contains('is-loading')) {
      return resolve(true);
    }

    const finish = (value: boolean) => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    };

    const observer = new MutationObserver(() => {
      const current = scroller.querySelector(SPINNER_SELECTOR);
      if (!current || !current.classList.contains('is-loading')) finish(true);
    });

    observer.observe(spinner, { attributes: true, attributeFilter: ['class'] });
    // Also watch for the spinner being removed entirely.
    observer.observe(spinner.parentElement || scroller, {
      childList: true,
      subtree: true,
    });

    const timer = setTimeout(() => {
      const current = scroller.querySelector(SPINNER_SELECTOR);
      finish(!current || !current.classList.contains('is-loading'));
    }, timeout);
  });
}

/** Compact snapshot of an element, for debugging in the page console. */
export function describeElement(el: HTMLElement): Record<string, unknown> {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    class: String(el.className || '').slice(0, 80),
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    scrollTop: el.scrollTop,
    overflowY: style.overflowY,
    visibility: style.visibility,
    display: style.display,
    position: style.position,
    rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
  };
}

/**
 * The element that actually scrolls is not always the `infinite-scroller`
 * itself, so check it, its ancestors up to the sidenav, and its descendants.
 */
export function pickScrollTarget(scroller: HTMLElement): HTMLElement {
  const candidates: HTMLElement[] = [scroller];

  let parent = scroller.parentElement;
  while (parent && parent.tagName.toLowerCase() !== 'body') {
    candidates.push(parent);
    if (parent.tagName.toLowerCase() === 'bard-sidenav') break;
    parent = parent.parentElement;
  }

  candidates.push(
    ...(Array.from(scroller.querySelectorAll('*')).slice(
      0,
      200,
    ) as HTMLElement[]),
  );

  const scrollable = candidates.find((el) => {
    const overflowY = getComputedStyle(el).overflowY;
    return (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight - el.clientHeight > 4
    );
  });

  if (scrollable && scrollable !== scroller) {
    trace(
      '[BS History] scroll target is not the infinite-scroller:',
      describeElement(scrollable),
    );
  }

  return scrollable ?? scroller;
}

/**
 * The overlay parks the native sidebar offscreen, which can leave the scroller
 * without a viewport of its own. Give it a temporary one so `scrollTop` has
 * somewhere to move, and restore the original inline styles afterwards.
 */
function ensureScrollable(scroller: HTMLElement): () => void {
  if (scroller.clientHeight > 0) return () => {};

  trace(
    '[BS History] scroller has no viewport (clientHeight=0), applying temporary height',
  );
  const prevHeight = scroller.style.height;
  const prevOverflow = scroller.style.overflowY;
  scroller.style.height = '600px';
  scroller.style.overflowY = 'auto';

  return () => {
    scroller.style.height = prevHeight;
    scroller.style.overflowY = prevOverflow;
  };
}

export interface ScrollHistoryOptions {
  /** Called after each batch of newly loaded conversations. */
  onBatchLoaded?: () => Promise<void> | void;
  /** Hard cap on how long to keep scrolling. Defaults to 5 minutes. */
  maxDuration?: number;
  /** Log prefix, so callers can tell scan vs. sync apart in the console. */
  logPrefix?: string;
}

/**
 * Scroll the sidebar history until Gemini stops loading older pages.
 */
export async function scrollHistoryToEnd(
  element: HTMLElement,
  options: ScrollHistoryOptions = {},
): Promise<void> {
  const {
    onBatchLoaded,
    maxDuration = 5 * 60 * 1000,
    logPrefix = 'Gemini History',
  } = options;

  const scroller = pickScrollTarget(element);
  const restoreStyles = ensureScrollable(scroller);
  const deadline = Date.now() + maxDuration;

  trace(`${logPrefix}: scrolling`, describeElement(scroller));

  let previousScrollHeight = 0;
  let noChangeCount = 0;
  let round = 0;

  try {
    while (true) {
      if (Date.now() > deadline) {
        console.warn(`${logPrefix}: scroll timed out, stopping early.`);
        break;
      }

      const before = scroller.scrollTop;
      scroller.scrollTop = scroller.scrollHeight;
      // Some virtual scrollers only react to a real scroll event.
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));

      // Let the spinner state / scroll settle.
      await new Promise((r) => setTimeout(r, 800));

      const spinner = scroller.querySelector(SPINNER_SELECTOR);
      const isLoading = !!spinner && spinner.classList.contains('is-loading');

      trace(
        `${logPrefix}: round ${++round} scrollTop ${before}→${scroller.scrollTop} / ` +
          `scrollHeight ${scroller.scrollHeight} / clientHeight ${scroller.clientHeight} / ` +
          `spinner ${spinner ? (isLoading ? 'loading' : 'idle') : 'missing'}`,
      );

      if (isLoading) {
        trace(`${logPrefix}: loading older page...`);
        await waitForSpinnerStopLoading(scroller, 20000);
        noChangeCount = 0;
        // Small buffer for the DOM to settle.
        await new Promise((r) => setTimeout(r, 500));
        await onBatchLoaded?.();
        previousScrollHeight = scroller.scrollHeight;
        continue;
      }

      const currentScrollHeight = scroller.scrollHeight;

      if (currentScrollHeight === previousScrollHeight) {
        noChangeCount++;
        trace(
          `${logPrefix}: idle with no height change (${noChangeCount})`,
        );

        if (noChangeCount >= 2) {
          // Double check with a longer delay before calling it done.
          await new Promise((r) => setTimeout(r, 1500));
          const finalSpinner = scroller.querySelector(SPINNER_SELECTOR);
          const finalIsLoading =
            !!finalSpinner && finalSpinner.classList.contains('is-loading');
          if (!finalIsLoading && scroller.scrollHeight === currentScrollHeight) {
            console.log(`${logPrefix}: reached end of list.`);
            break;
          }
        }
      } else {
        // Content arrived without us catching the spinner.
        noChangeCount = 0;
        await onBatchLoaded?.();
      }

      previousScrollHeight = currentScrollHeight;
    }
  } finally {
    restoreStyles();
  }
}
