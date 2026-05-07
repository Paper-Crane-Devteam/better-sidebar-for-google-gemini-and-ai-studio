import type { ConversationNode } from './types';
import { looksLikeGeminiId } from './dom-utils';

/**
 * Pure function: merge incoming nodes into an existing list.
 * De-dups by id. When the same logical message has both a Gemini native
 * id (e.g. "r_xxx") and a DB-generated hex id, merges by matching
 * orderIndex + content, preferring the Gemini native id for DOM lookups.
 *
 * Returns a new sorted array, or the original `prev` reference if nothing changed.
 */
export function mergeNodes(
  prev: ConversationNode[],
  incoming: ConversationNode[],
): ConversationNode[] {
  if (incoming.length === 0) return prev;

  const byId = new Map<string, ConversationNode>();
  for (const n of prev) byId.set(n.id, n);

  for (const n of incoming) {
    const existing = byId.get(n.id);
    if (!existing) {
      // Try to find a node with a different id but the same logical message.
      // Two cases to reconcile:
      //  (a) DB hex id vs interceptor Gemini id — match by orderIndex+content
      //      when both sides carry an orderIndex.
      //  (b) Interceptor node (no orderIndex) arriving alongside a DB node
      //      with the same role+content — match on role+trimmed content.
      let mergeTarget: ConversationNode | undefined;
      const trimmed = n.content.trim();
      if (n.orderIndex != null) {
        for (const e of byId.values()) {
          if (
            e.orderIndex === n.orderIndex &&
            e.content.trim() === trimmed
          ) {
            mergeTarget = e;
            break;
          }
        }
      }
      if (!mergeTarget) {
        for (const e of byId.values()) {
          if (
            e.role === n.role &&
            e.content.trim() === trimmed &&
            (looksLikeGeminiId(e.id) !== looksLikeGeminiId(n.id))
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
          headings: n.headings ?? mergeTarget.headings,
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
        headings: n.headings ?? existing.headings,
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
}
