/**
 * Visual cue after jumping to a Gemini message: an outline pulse on the turn plus
 * a temporary highlight of the searched words.
 *
 * Neither touches Gemini's DOM structure. The pulse is a Web Animation on the
 * turn's own `outline` (no layout shift, removed when it finishes), and the term
 * highlight uses the CSS Custom Highlight API, which paints over existing text
 * nodes instead of wrapping them in spans that Angular would fight with.
 */

export interface HighlightQuery {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
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

function buildRegex({ query, caseSensitive, wholeWord }: HighlightQuery): RegExp | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(wholeWord ? `\\b${escaped}\\b` : escaped, caseSensitive ? 'g' : 'gi');
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
      if (m[0].length === 0) break;
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

export function pulseTurn(el: HTMLElement) {
  el.animate(
    [
      { outline: `2px solid ${ACCENT}`, outlineOffset: '6px', borderRadius: '16px' },
      { outline: `2px solid ${ACCENT}`, outlineOffset: '6px', borderRadius: '16px', offset: 0.6 },
      { outline: '2px solid transparent', outlineOffset: '6px', borderRadius: '16px' },
    ],
    { duration: PULSE_DURATION, easing: 'ease-out' },
  );
}
