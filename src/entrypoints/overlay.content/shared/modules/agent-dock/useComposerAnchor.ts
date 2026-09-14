/**
 * Where the chat composer is on screen, so the dock can sit on its top-right corner.
 *
 * Polled, not observed. Three different things move this box — the window resizing,
 * the composer growing as text is typed, and Angular replacing the whole node on SPA
 * navigation — and the last one is the reason: an observer bound to the old element
 * goes deaf without ever firing, so a clock is needed anyway. Once there's a clock,
 * reading a rect in it costs nothing.
 *
 * `null` means there is no composer to anchor to (no chat open yet), and the dock
 * renders nothing rather than floating somewhere arbitrary.
 */

import { useEffect, useState } from 'react';

/** How often the composer's position is re-read */
const SAMPLE_MS = 250;

/** Position of the dock, expressed as CSS offsets from the viewport edges */
export interface ComposerAnchor {
  /** Distance from the viewport bottom to the dock's bottom edge */
  bottom: number;
  /** Distance from the viewport right to the dock's right edge */
  right: number;
  /** How wide the composer is, so the dock never overhangs it */
  width: number;
}

/** Gap between the dock and the top edge of the composer */
const GAP_PX = 8;

/**
 * The composer's outer box, not the editable area.
 *
 * Per platform, the wrapper that also holds the send button and the model picker — its
 * right edge is the one the user reads as "the corner of the input box". Anchoring to the
 * editable area instead would put the dock over the text on Gemini and inside the button
 * row on AI Studio.
 *
 * ⚠️ Tried in order, one query at a time. A comma-separated list resolves in *document*
 * order, which says nothing about which platform we are on.
 */
const COMPOSER_BOX_SELECTORS = [
  '.text-input-field', // Gemini
  'rich-textarea', // Gemini fallback
  'ms-chunk-editor footer ms-prompt-box .prompt-box-container', // AI Studio
  'ms-prompt-box .prompt-box-container', // AI Studio fallback
] as const;

function findComposerBox(): HTMLElement | null {
  for (const selector of COMPOSER_BOX_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  return null;
}

function measure(): ComposerAnchor | null {
  const box = findComposerBox();
  if (!box) return null;

  const rect = box.getBoundingClientRect();
  // A detached or collapsed node measures as all zeros; anchoring to that would park
  // the dock in the corner of the screen.
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    bottom: Math.max(window.innerHeight - rect.top + GAP_PX, GAP_PX),
    right: Math.max(window.innerWidth - rect.right, GAP_PX),
    width: rect.width,
  };
}

function isSame(a: ComposerAnchor | null, b: ComposerAnchor | null): boolean {
  if (a === null || b === null) return a === b;
  return a.bottom === b.bottom && a.right === b.right && a.width === b.width;
}

export function useComposerAnchor(enabled: boolean): ComposerAnchor | null {
  const [anchor, setAnchor] = useState<ComposerAnchor | null>(null);

  useEffect(() => {
    if (!enabled) {
      setAnchor(null);
      return;
    }

    // Same object identity when nothing moved, so the dock doesn't re-render 4x/second
    const sample = () => {
      const next = measure();
      setAnchor((prev) => (isSame(prev, next) ? prev : next));
    };

    sample();
    const interval = setInterval(sample, SAMPLE_MS);
    window.addEventListener('resize', sample);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', sample);
    };
  }, [enabled]);

  return anchor;
}
