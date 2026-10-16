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
 * Gap between the bar and the chat column's right edge. The native scrollbar
 * occupies the column's last 32px (the gutter right of the text), which is
 * exactly the collapsed bar's width, so sit flush in that slot.
 */
const EDGE_GAP = 0;

const NATIVE_SCROLLBAR_STYLE_ID = 'better-sidebar-aistudio-hide-native-scrollbar';

/**
 * AI Studio SmartScrollbar: same dot bar / outline as Gemini, fed from the DOM.
 * While it is shown, AI Studio's own turn scrollbar is hidden so the two do not
 * stack on the same edge.
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

  useHideNativeScrollbar(visible);

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

function useHideNativeScrollbar(hide: boolean) {
  useEffect(() => {
    if (!hide) return;
    const style = document.createElement('style');
    style.id = NATIVE_SCROLLBAR_STYLE_ID;
    style.textContent = `ms-items-scrollbar { display: none !important; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [hide]);
}
