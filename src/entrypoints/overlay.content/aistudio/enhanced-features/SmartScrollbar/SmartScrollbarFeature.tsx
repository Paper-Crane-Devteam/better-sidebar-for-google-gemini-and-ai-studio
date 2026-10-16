import { useEffect, useState } from 'react';
import { usePegasusStore } from '@/shared/lib/pegasus-store';
import { useAgentLoopStore } from '@/entrypoints/overlay.content/shared/modules/agent-loop';
import { SmartScrollbarView } from '@/entrypoints/overlay.content/shared/components/smart-scrollbar/SmartScrollbarView';
import {
  useAIStudioTurnNodes,
  AISTUDIO_CHAT_COLUMN_SELECTOR,
} from './useAIStudioTurnNodes';

/** Same threshold as Gemini: a two-question chat does not need a navigator. */
const MIN_USER_TURNS = 3;
/**
 * Right padding given to `.chat-view-container` while the bar is shown (AI Studio's
 * own is 20px). Turns keep ~13px of inner padding on top of this, so the text ends
 * ~57px from the column edge: room for the 32px bar with ~12px either side.
 */
const GUTTER_PADDING = 44;
/** Gap between the bar and the chat column's right edge, inside the gutter */
const EDGE_GAP = 12;

const GUTTER_STYLE_ID = 'better-sidebar-aistudio-scrollbar-gutter';

/**
 * AI Studio SmartScrollbar: same dot bar / outline as Gemini, fed from the DOM.
 *
 * While it is shown, the chat column gets a wider right gutter and the bar sits in
 * it. Pinning to the column (not the viewport) keeps it clear of the run settings
 * panel when that is open, and the gutter keeps it off the text and off the window
 * edge when it is closed. AI Studio's own turn scrollbar is hidden so the two do
 * not stack.
 */
export const SmartScrollbarFeature = () => {
  const enabled = usePegasusStore(
    (s) => s.enhancedFeatures.aistudio?.showSmartScrollbar ?? true,
  );
  // Dots point into the native chat; the agent view covers it
  const isAgentViewActive = useAgentLoopStore((s) => s.isAgentViewActive);

  if (!enabled || isAgentViewActive) return null;
  return <AIStudioSmartScrollbar />;
};

const AIStudioSmartScrollbar = () => {
  const { items, activeId, scrollToNode, scroller } = useAIStudioTurnNodes();
  const visible = items.length >= MIN_USER_TURNS;
  const anchor = useChatColumnAnchor(scroller, visible);

  useReserveGutter(visible);

  if (!visible || !anchor) return null;

  return (
    <SmartScrollbarView
      items={items}
      activeId={activeId}
      onSelect={scrollToNode}
      variant="aistudio"
      anchor={anchor}
      showErase={false}
    />
  );
};

/**
 * Pin to the chat column rather than the viewport: the run settings panel opens
 * on the right and would otherwise sit on top of the bar.
 */
function useChatColumnAnchor(scroller: HTMLElement | null, active: boolean) {
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null);

  useEffect(() => {
    if (!active || !scroller) {
      setAnchor(null);
      return;
    }
    const column =
      (scroller.closest(AISTUDIO_CHAT_COLUMN_SELECTOR) as HTMLElement | null) ?? scroller;

    const update = () => {
      const rect = column.getBoundingClientRect();
      const next = {
        right: Math.round(window.innerWidth - rect.right + EDGE_GAP),
        top: Math.round(rect.top + rect.height / 2),
      };
      setAnchor((prev) =>
        prev && prev.right === next.right && prev.top === next.top ? prev : next,
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(column);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [scroller, active]);

  return anchor;
}

/** Widen the chat column's right gutter and hide the native scrollbar */
function useReserveGutter(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const style = document.createElement('style');
    style.id = GUTTER_STYLE_ID;
    style.textContent = `
      ${AISTUDIO_CHAT_COLUMN_SELECTOR} .chat-view-container { padding-right: ${GUTTER_PADDING}px !important; }
      ms-items-scrollbar { display: none !important; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, [active]);
}
