import { useEffect, useCallback } from 'react';
import { useNodeMerger } from './useNodeMerger';
import { useDbSource } from './useDbSource';
import { useInterceptorSource } from './useInterceptorSource';
import { useDomSync } from './useDomSync';
import { useActiveNode } from './useActiveNode';
import { findMessageElement } from './dom-utils';

export type { ConversationNode } from './types';

/**
 * Composition hook that wires together all SmartScrollbar data sources
 * and behaviors:
 *
 * 1. useNodeMerger — merged node list from multiple sources
 * 2. useDbSource — fetches history from local DB
 * 3. useInterceptorSource — listens for HTTP interceptor events
 * 4. useDomSync — MutationObserver to keep inDom flags current
 * 5. useActiveNode — scroll-based active node tracking
 */
export const useConversationNodes = () => {
  const {
    nodes,
    nodesRef,
    syncRef,
    mergeIntoNodes,
    resetNodes,
    refreshDomPresence,
  } = useNodeMerger();

  const { activeNodeId, setActiveNodeId, detectActiveNode } =
    useActiveNode(nodesRef);

  // Keep nodesRef in sync and re-detect active node when nodes/inDom change
  useEffect(() => {
    syncRef(nodes);
    detectActiveNode();
  }, [nodes, syncRef, detectActiveNode]);

  // Wire up data sources
  useDbSource(mergeIntoNodes, resetNodes, setActiveNodeId);
  useInterceptorSource(mergeIntoNodes);

  // Wire up DOM synchronization
  useDomSync(nodes, refreshDomPresence);

  const scrollToNode = useCallback(
    (nodeId: string) => {
      const el = findMessageElement(nodeId);
      if (!el) return;

      const container = el.closest('.conversation-container') || el;
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveNodeId(nodeId);
    },
    [setActiveNodeId],
  );

  return { nodes, activeNodeId, scrollToNode };
};
