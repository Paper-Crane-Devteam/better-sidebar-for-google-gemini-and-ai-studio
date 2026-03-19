import { useEffect, useRef } from 'react';
import type { ConversationNode } from './types';
import { getChatScrollContainer } from './dom-utils';

/**
 * Observes DOM mutations in the chat scroll container and keeps
 * the `inDom` flag of each node in sync via refreshDomPresence.
 */
export function useDomSync(
  nodes: ConversationNode[],
  refreshDomPresence: () => void,
) {
  const nodesLenRef = useRef(nodes.length);
  nodesLenRef.current = nodes.length;

  useEffect(() => {
    const scrollContainer = getChatScrollContainer();
    if (!scrollContainer) return;

    const observer = new MutationObserver(() => {
      refreshDomPresence();
    });

    observer.observe(scrollContainer, { childList: true, subtree: true });

    // Initial sync
    refreshDomPresence();

    return () => observer.disconnect();
  }, [nodes.length, refreshDomPresence]);
}
