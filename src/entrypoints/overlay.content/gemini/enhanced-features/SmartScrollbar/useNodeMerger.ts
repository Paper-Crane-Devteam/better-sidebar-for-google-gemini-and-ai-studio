import { useCallback, useState, useRef } from 'react';
import type { ConversationNode } from './types';
import { looksLikeGeminiId, findMessageElement } from './dom-utils';

/**
 * Manages the merged node list from multiple data sources (DB + interceptor).
 *
 * De-dups by id. When the same logical message has both a Gemini native
 * id (e.g. "r_xxx") and a DB-generated hex id, we merge by matching
 * orderIndex + content, preferring the Gemini native id for DOM lookups.
 */
export function useNodeMerger() {
  const [nodes, setNodes] = useState<ConversationNode[]>([]);
  const nodesRef = useRef<ConversationNode[]>([]);

  // Keep ref in sync for non-reactive reads (scroll handler etc.)
  const syncRef = useCallback((n: ConversationNode[]) => {
    nodesRef.current = n;
  }, []);

  const mergeIntoNodes = useCallback((incoming: ConversationNode[]) => {
    if (incoming.length === 0) return;

    setNodes((prev) => {
      const byId = new Map<string, ConversationNode>();

      for (const n of prev) byId.set(n.id, n);

      for (const n of incoming) {
        const existing = byId.get(n.id);
        if (!existing) {
          // Try to find a node with different id but same orderIndex+content
          // (DB hex id vs interceptor Gemini id for the same message).
          let mergeTarget: ConversationNode | undefined;
          if (n.orderIndex != null) {
            for (const e of byId.values()) {
              if (
                e.orderIndex === n.orderIndex &&
                e.content.trim() === n.content.trim()
              ) {
                mergeTarget = e;
                break;
              }
            }
          }

          if (mergeTarget) {
            const pickId = looksLikeGeminiId(n.id)
              ? n.id
              : looksLikeGeminiId(mergeTarget.id)
                ? mergeTarget.id
                : n.id;
            byId.delete(mergeTarget.id);
            byId.set(pickId, {
              ...mergeTarget,
              id: pickId,
              inDom: mergeTarget.inDom || n.inDom,
              orderIndex: mergeTarget.orderIndex ?? n.orderIndex,
              timestamp: mergeTarget.timestamp ?? n.timestamp,
            });
          } else {
            byId.set(n.id, n);
          }
        } else {
          byId.set(n.id, {
            ...existing,
            inDom: existing.inDom || n.inDom,
            orderIndex: existing.orderIndex ?? n.orderIndex,
            timestamp: existing.timestamp ?? n.timestamp,
          });
        }
      }

      const merged = Array.from(byId.values());
      merged.sort((a, b) => {
        const aHas = a.orderIndex != null;
        const bHas = b.orderIndex != null;
        if (aHas && bHas) return a.orderIndex! - b.orderIndex!;
        if (aHas) return -1;
        if (bHas) return 1;
        return (a.timestamp ?? 0) - (b.timestamp ?? 0);
      });

      // Shallow equality check to avoid unnecessary re-renders
      if (
        merged.length === prev.length &&
        merged.every((n, i) => n.id === prev[i].id && n.inDom === prev[i].inDom)
      ) {
        return prev;
      }

      return merged;
    });
  }, []);

  const resetNodes = useCallback(() => {
    setNodes([]);
  }, []);

  /**
   * Refresh inDom status for all nodes by checking the DOM.
   * Also attempts to fix nodes with non-Gemini IDs by matching them
   * positionally to actual DOM elements (fixes the generate.ts randomUUID issue).
   */
  const refreshDomPresence = useCallback(() => {
    setNodes((prev) => {
      let changed = false;
      const updated = prev.map((node) => {
        const nowInDom = !!findMessageElement(node.id);
        if (nowInDom !== node.inDom) {
          changed = true;
          return { ...node, inDom: nowInDom };
        }
        return node;
      });
      return changed ? updated : prev;
    });
  }, []);

  return {
    nodes,
    nodesRef,
    setNodes,
    syncRef,
    mergeIntoNodes,
    resetNodes,
    refreshDomPresence,
  };
}
