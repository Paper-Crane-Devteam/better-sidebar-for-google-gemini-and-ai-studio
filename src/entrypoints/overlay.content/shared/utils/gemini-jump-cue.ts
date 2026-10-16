/**
 * Visual cue after jumping to a Gemini message: an outline pulse on the turn plus
 * a temporary highlight of the searched words.
 *
 * Neither touches Gemini's DOM structure. The pulse is a Web Animation on the
 * turn's own `outline` (no layout shift, removed when it finishes), and the term
 * highlight uses the CSS Custom Highlight API, which paints over existing text
 * nodes instead of wrapping them in spans that Angular would fight with.
 */

import { buildSearchRegex, type SearchMatchOptions } from '@/shared/lib/search-pattern';

export interface HighlightQuery extends SearchMatchOptions {
  query: string;
}

const HIGHLIGHT_NAME = 'bs-jump-match';
const STYLE_ID = 'bs-jump-cue-style';
const HIGHLIGHT_DURATION = 4000;
const PULSE_DURATION = 1600;

/** Gemini's own accent, so the pulse follows light / dark theme. */
const ACCENT = 'var(--gem-sys-color--primary, #1a73e8)';

let clearTimer: ReturnType<typeof setTimeout> | null = null;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: rgba(253, 214, 99, 0.6); color: inherit; }`;
  document.head.appendChild(style);
}

function buildRegex({ query, ...options }: HighlightQuery): RegExp | null {
  // Literal mode trims as it always has; a regex is taken as typed, since
  // leading / trailing whitespace can be part of the pattern.
  return buildSearchRegex(options.useRegex ? query : query.trim(), options, 'g');
}

/**
 * Ranges for every match inside `root`. Matches are per text node, so a term
 * split across formatting (e.g. half bold) is skipped; rare for search terms
 * and not worth stitching nodes together for.
 */
function findMatchRanges(root: HTMLElement, regex: RegExp): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.data;
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
      // Empty match (possible in regex mode, e.g. `a*`): step past it, keep scanning.
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      const range = document.createRange();
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      ranges.push(range);
    }
    node = walker.nextNode() as Text | null;
  }
  return ranges;
}

export function clearJumpCue() {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  try {
    CSS.highlights?.delete(HIGHLIGHT_NAME);
  } catch {
    // Highlight API unavailable; nothing to clear
  }
}

/**
 * Highlight the query's matches inside `scope` and return the first one, so the
 * caller can scroll to the actual hit rather than the top of a long answer.
 */
export function highlightMatches(scope: HTMLElement, query?: HighlightQuery): Range | null {
  clearJumpCue();
  if (!query || typeof Highlight === 'undefined' || !CSS.highlights) return null;

  const regex = buildRegex(query);
  if (!regex) return null;

  const ranges = findMatchRanges(scope, regex);
  if (ranges.length === 0) return null;

  ensureStyle();
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  clearTimer = setTimeout(clearJumpCue, HIGHLIGHT_DURATION);
  return ranges[0];
}

/** Gap between the message and the ring, and between the ring and the viewport edge. */
const RING_GAP = 6;
const EDGE_INSET = 4;

/**
 * Pulse a ring around `el`.
 *
 * Drawn as a fixed overlay on <body> rather than an `outline` on the element:
 * Gemini's containers clipped the outline on three sides, and a model answer is
 * often taller than the viewport, so its own bottom edge is off-screen anyway.
 * The ring is clamped to the visible part of `clipTo` (the chat scroller) so all
 * four sides are always on screen, and it tracks the element every frame in case
 * the smooth scroll is still settling.
 */
export function pulseTurn(el: HTMLElement, clipTo?: HTMLElement | null) {
  const ring = document.createElement('div');
  Object.assign(ring.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '1000',
    boxSizing: 'border-box',
    border: `2px solid ${ACCENT}`,
    borderRadius: '16px',
    boxShadow: `0 0 0 4px color-mix(in srgb, ${ACCENT} 25%, transparent)`,
    left: '0',
    top: '0',
    width: '0',
    height: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ring);

  let frame = 0;
  const place = () => {
    const r = el.getBoundingClientRect();
    const bounds = clipTo?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
    const left = Math.max(r.left - RING_GAP, bounds.left + EDGE_INSET);
    const top = Math.max(r.top - RING_GAP, bounds.top + EDGE_INSET);
    const right = Math.min(r.right + RING_GAP, bounds.right - EDGE_INSET);
    const bottom = Math.min(r.bottom + RING_GAP, bounds.bottom - EDGE_INSET);
    const visible = right > left && bottom > top;
    ring.style.display = visible ? 'block' : 'none';
    if (visible) {
      ring.style.left = `${left}px`;
      ring.style.top = `${top}px`;
      ring.style.width = `${right - left}px`;
      ring.style.height = `${bottom - top}px`;
    }
    frame = requestAnimationFrame(place);
  };
  place();

  const anim = ring.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }],
    { duration: PULSE_DURATION, easing: 'ease-out' },
  );
  const cleanup = () => {
    cancelAnimationFrame(frame);
    ring.remove();
  };
  anim.onfinish = cleanup;
  anim.oncancel = cleanup;
}
