import { useEffect, useRef, useCallback, useState } from 'react';
import type { ConversationNode } from './types';
import { findMessageElement, getChatScrollContainer } from './dom-utils';

const SCROLL_DEBOUNCE_MS = 80;
const INITIAL_DETECT_DELAY_MS = 500;

/**
 * Tracks which conversation node is currently "active" based on
 * the page scroll position.
 *
 * Strategy: find the inDom user-turn whose top edge is closest to
 * (and above) the viewport center. If none is above center, pick
 * the closest one below.
 */
export function useActiveNode(nodesRef: React.RefObject<ConversationNode[]>) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const activeNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeNodeIdRef.current = activeNodeId;
  }, [activeNodeId]);

  const detectActiveNode = useCallback(() => {
    const currentNodes = nodesRef.current;
    if (!currentNodes || currentNodes.length === 0) return;

    const scrollContainer = getChatScrollContainer();
    if (!scrollContainer) return;

    const viewportCenter = window.innerHeight / 2;
    let bestNode: string | null = null;
    let bestDistance = Infinity;

    for (const node of currentNodes) {
      if (!node.inDom) continue;
      const el = findMessageElement(node.id);
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - viewportCenter);

      // Prefer nodes whose top is above or at the viewport center
      if (rect.top <= viewportCenter) {
        if (distance < bestDistance) {
          bestDistance = distance;
          bestNode = node.id;
        }
      } else if (bestNode === null && distance < bestDistance) {
        // Fallback: closest node below center if nothing above
        bestDistance = distance;
        bestNode = node.id;
      }
    }

    if (bestNode && bestNode !== activeNodeIdRef.current) {
      setActiveNodeId(bestNode);
    }
  }, [nodesRef]);

  // Attach scroll listener to chat-history (or window as fallback)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(detectActiveNode, SCROLL_DEBOUNCE_MS);
    };

    const scrollContainer = getChatScrollContainer();
    const scrollTarget = scrollContainer || window;
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });

    // Initial detection after a short delay to let the DOM settle
    const initTimeout = setTimeout(detectActiveNode, INITIAL_DETECT_DELAY_MS);

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
      clearTimeout(initTimeout);
    };
  }, [detectActiveNode]);

  return { activeNodeId, setActiveNodeId, detectActiveNode };
}
