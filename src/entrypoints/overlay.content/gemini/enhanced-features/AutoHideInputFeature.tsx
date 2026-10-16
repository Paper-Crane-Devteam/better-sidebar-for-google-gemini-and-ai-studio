import { useEffect, useRef } from 'react';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useCurrentConversationId } from '@/entrypoints/overlay.content/shared/hooks/useCurrentConversationId';

/**
 * Auto-hide input feature for Gemini conversation pages.
 *
 * CSS only animates; visibility is decided by a small JS state machine that
 * writes `body[data-bs-aih="shown|hidden"]`.
 *
 * - The input wrapper is taken out of flow (`position: absolute`) and slid
 *   down. The slide distance is measured (`--bs-aih-gap` = space between
 *   input-container's bottom and the viewport bottom), so extra rows Gemini
 *   adds below the input (disclaimers, banners) don't leave it half visible.
 * - Shown when any of: pointer in the bottom hot zone (or over the shown
 *   input), focused with non-empty text, a cdk popup opened while shown,
 *   files being dragged, or a temporary reveal after switching conversations.
 * - Show/hide are debounced to avoid flicker when the pointer skims the edge.
 */

const STYLE_ID = 'better-sidebar-auto-hide-input';
const STATE_ATTR = 'data-bs-aih';
const GAP_VAR = '--bs-aih-gap';

const PEEK_PX = 12; // visible strip when hidden
const LIFT_PX = 12; // lift above input-container bottom when shown
const HOT_ZONE_PX = 40; // bottom zone that triggers reveal while hidden
const SIDE_SLOP_PX = 24;
const TOP_SLOP_PX = 16;
const SHOW_DELAY_MS = 80;
const HIDE_DELAY_MS = 400;
const REVEAL_MS = 1500;

type State = 'shown' | 'hidden';

// DOM (2026-10): input-container > div.input-area-container > input-area-v2
//   > div.input-area > fieldset. Older builds had fieldset as a direct child.
const targets = (prefix: string) =>
  `${prefix} input-container > .input-area-container, ${prefix} input-container > fieldset`;

const STYLE_TEXT = `
  body[${STATE_ATTR}] input-container {
    position: relative;
  }

  ${targets(`body[${STATE_ATTR}]`)} {
    position: absolute !important;
    /* inset by input-container's horizontal padding so max-width % matches in-flow width */
    left: 16px;
    right: 16px;
    bottom: 0;
    margin-inline: auto !important;
    z-index: 1;
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease !important;
  }

  ${targets(`body[${STATE_ATTR}="hidden"]`)} {
    transform: translateY(calc(100% + var(${GAP_VAR}, 0px) - ${PEEK_PX}px)) !important;
    opacity: 0.3 !important;
  }

  ${targets(`body[${STATE_ATTR}="shown"]`)} {
    transform: translateY(-${LIFT_PX}px) !important;
    opacity: 1 !important;
  }

  /* The disclaimer sits where the peek strip lands; fade it out while hidden */
  body[${STATE_ATTR}] input-container > hallucination-disclaimer {
    transition: opacity 0.2s ease;
  }
  body[${STATE_ATTR}="hidden"] input-container > hallucination-disclaimer {
    opacity: 0;
    pointer-events: none;
  }
`;

const isConversationPage = () => {
  const path = window.location.pathname;
  return (
    /\/app\/[a-zA-Z0-9_-]+/.test(path) ||
    /\/gem\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/.test(path)
  );
};

export const AutoHideInputFeature = () => {
  const autoHideInput = usePegasusStore(
    (s) => s.enhancedFeatures.gemini.autoHideInput,
  );
  const conversationId = useCurrentConversationId();
  const prevConversationIdRef = useRef<string | null | undefined>(undefined);
  const revealRef = useRef<(() => void) | null>(null);

  // Temporarily reveal + focus input when switching between conversations
  useEffect(() => {
    const prev = prevConversationIdRef.current;
    prevConversationIdRef.current = conversationId;
    if (prev === undefined) return; // initial mount
    if (autoHideInput && conversationId && prev && conversationId !== prev) {
      revealRef.current?.();
    }
  }, [conversationId, autoHideInput]);

  useEffect(() => {
    if (!autoHideInput) {
      document.getElementById(STYLE_ID)?.remove();
      document.body.removeAttribute(STATE_ATTR);
      document.body.style.removeProperty(GAP_VAR);
      return;
    }

    let styleEl: HTMLStyleElement | null = null;
    let active = false;
    let state: State = 'hidden';

    let container: Element | null = null;
    let resizeObs: ResizeObserver | null = null;
    let overlayEl: Element | null = null;
    let overlayObs: MutationObserver | null = null;

    let pointerInZone = false;
    let dragging = false;
    let overlayHold = false;
    let revealUntil = 0;
    let lastX = -1;
    let lastY = -1;

    let pendingTimer = 0;
    let pendingTarget: State | null = null;
    let rafId = 0;
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    // ---- DOM queries ----
    const getInput = () =>
      container?.querySelector(
        ':scope > .input-area-container, :scope > fieldset',
      ) ?? null;

    const getEditor = () =>
      container?.querySelector<HTMLElement>(
        'rich-textarea [contenteditable]',
      ) ?? null;

    const hasText = () => {
      const editor = getEditor();
      if (!editor) return false;
      if (editor.classList.contains('ql-blank')) return false;
      return (editor.textContent ?? '').trim().length > 0;
    };

    const isFocused = () =>
      !!container && container.contains(document.activeElement);

    const isOverlayOpen = () =>
      !!overlayEl &&
      Array.from(overlayEl.querySelectorAll('.cdk-overlay-pane')).some(
        (p) => p.childElementCount > 0,
      );

    const pointerHitsZone = () => {
      if (lastX < 0) return false;
      const input = getInput();
      if (!input) return false;
      const r = input.getBoundingClientRect();
      if (lastX < r.left - SIDE_SLOP_PX || lastX > r.right + SIDE_SLOP_PX)
        return false;
      const top =
        state === 'shown'
          ? r.top - TOP_SLOP_PX
          : window.innerHeight - HOT_ZONE_PX;
      return lastY >= top;
    };

    // ---- state machine ----
    const setState = (next: State) => {
      state = next;
      if (active) document.body.setAttribute(STATE_ATTR, next);
    };

    const cancelPending = () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = 0;
      pendingTarget = null;
    };

    const evaluate = () => {
      if (!active) return;
      const typing = isFocused() && hasText();
      const forced =
        dragging || overlayHold || typing || Date.now() < revealUntil;
      const want: State = forced || pointerInZone ? 'shown' : 'hidden';

      if (want === state) {
        cancelPending();
        return;
      }
      if (pendingTimer && pendingTarget === want) return;

      cancelPending();
      const delay =
        want === 'hidden' ? HIDE_DELAY_MS : forced ? 0 : SHOW_DELAY_MS;
      if (delay === 0) {
        setState(want);
        return;
      }
      pendingTarget = want;
      pendingTimer = window.setTimeout(() => {
        pendingTimer = 0;
        pendingTarget = null;
        setState(want);
      }, delay);
    };

    // ---- measurement ----
    const measureGap = () => {
      if (!container) return;
      const gap = Math.max(
        0,
        Math.round(window.innerHeight - container.getBoundingClientRect().bottom),
      );
      document.body.style.setProperty(GAP_VAR, `${gap}px`);
    };

    // ---- attachment (re-run on navigation / DOM swaps) ----
    const attachContainer = () => {
      const c = document.querySelector('input-container');
      if (c === container) return;
      resizeObs?.disconnect();
      container = c;
      if (!c) return;
      resizeObs = new ResizeObserver(measureGap);
      resizeObs.observe(c);
      measureGap();
    };

    const onOverlayMutation = () => {
      const open = isOverlayOpen();
      if (open && state === 'shown') overlayHold = true;
      else if (!open) overlayHold = false;
      evaluate();
    };

    const attachOverlay = () => {
      if (overlayEl?.isConnected) return;
      overlayObs?.disconnect();
      overlayEl = document.querySelector('.cdk-overlay-container');
      if (!overlayEl) return;
      overlayObs = new MutationObserver(onOverlayMutation);
      overlayObs.observe(overlayEl, { childList: true, subtree: true });
    };

    const activate = () => {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        document.head.appendChild(styleEl);
      }
      if (styleEl.textContent !== STYLE_TEXT) styleEl.textContent = STYLE_TEXT;
      if (!active) {
        active = true;
        state = 'hidden';
        document.body.setAttribute(STATE_ATTR, state);
      }
      attachContainer();
      attachOverlay();
      evaluate();
    };

    const deactivate = () => {
      if (!active) return;
      active = false;
      cancelPending();
      document.body.removeAttribute(STATE_ATTR);
      if (styleEl) styleEl.textContent = '';
      // Gemini's layout may keep stale calculations once our absolute
      // positioning goes away (e.g. back to new chat) — nudge it.
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    };

    const sync = () => {
      if (isConversationPage()) activate();
      else deactivate();
    };

    // ---- event handlers ----
    const onPointerMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        pointerInZone = pointerHitsZone();
        evaluate();
      });
    };

    const onPointerGone = () => {
      lastX = lastY = -1;
      pointerInZone = false;
      evaluate();
    };

    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragging = true;
      evaluate();
    };

    const onDragLeave = (e: DragEvent) => {
      const outside =
        e.relatedTarget === null &&
        (e.clientX <= 0 ||
          e.clientY <= 0 ||
          e.clientX >= window.innerWidth ||
          e.clientY >= window.innerHeight);
      if (!outside) return;
      dragging = false;
      evaluate();
    };

    const onDragEnd = () => {
      if (!dragging) return;
      dragging = false;
      evaluate();
    };

    // Typing, sending (editor cleared) and focus moves all change the
    // "focused with text" condition.
    const onEditorActivity = () => requestAnimationFrame(evaluate);

    const onResize = () => {
      measureGap();
      pointerInZone = pointerHitsZone();
      evaluate();
    };

    revealRef.current = () => {
      if (!active) return;
      revealUntil = Date.now() + REVEAL_MS;
      cancelPending();
      setState('shown');
      later(evaluate, REVEAL_MS + 20);
      later(() => getEditor()?.focus(), 300);
    };

    sync();

    // SPA navigation: title changes + popstate, plus a cheap poll to catch
    // input-container / overlay container being re-rendered.
    const navObserver = new MutationObserver(() => requestAnimationFrame(sync));
    navObserver.observe(document.querySelector('title') || document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const pollId = window.setInterval(sync, 1000);

    const root = document.documentElement;
    window.addEventListener('popstate', sync);
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onPointerGone);
    document.addEventListener('mousemove', onPointerMove, { passive: true });
    root.addEventListener('mouseleave', onPointerGone);
    window.addEventListener('dragenter', onDragEnter, true);
    window.addEventListener('dragleave', onDragLeave, true);
    window.addEventListener('drop', onDragEnd, true);
    window.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('focusin', onEditorActivity);
    document.addEventListener('focusout', onEditorActivity);
    document.addEventListener('input', onEditorActivity, true);
    document.addEventListener('keyup', onEditorActivity, true);

    return () => {
      revealRef.current = null;
      navObserver.disconnect();
      clearInterval(pollId);
      resizeObs?.disconnect();
      overlayObs?.disconnect();
      cancelPending();
      if (rafId) cancelAnimationFrame(rafId);
      timers.forEach((id) => clearTimeout(id));
      timers.clear();

      window.removeEventListener('popstate', sync);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onPointerGone);
      document.removeEventListener('mousemove', onPointerMove);
      root.removeEventListener('mouseleave', onPointerGone);
      window.removeEventListener('dragenter', onDragEnter, true);
      window.removeEventListener('dragleave', onDragLeave, true);
      window.removeEventListener('drop', onDragEnd, true);
      window.removeEventListener('dragend', onDragEnd, true);
      document.removeEventListener('focusin', onEditorActivity);
      document.removeEventListener('focusout', onEditorActivity);
      document.removeEventListener('input', onEditorActivity, true);
      document.removeEventListener('keyup', onEditorActivity, true);

      document.body.removeAttribute(STATE_ATTR);
      document.body.style.removeProperty(GAP_VAR);
      styleEl?.remove();
    };
  }, [autoHideInput]);

  return null;
};
