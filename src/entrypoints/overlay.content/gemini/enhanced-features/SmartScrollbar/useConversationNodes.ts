import { useEffect, useRef, useState, useCallback } from 'react';
import { useUrl } from '@/shared/hooks/useUrl';
import { useAppStore } from '@/shared/lib/store';
import { browser } from 'wxt/browser';
import { dedupModelMessages } from './dedup-messages';
import { mergeNodes } from './merge-nodes';
import {
  findMessageElement,
  getChatScrollContainer,
} from './dom-utils';
import type { ConversationNode } from './types';
import { extractHeadings } from './types';

export type { ConversationNode } from './types';

// ── Constants ────────────────────────────────────────────────────────
const SCROLL_DEBOUNCE_MS = 80;
const INITIAL_DETECT_DELAY_MS = 500;

// ── URL helpers ──────────────────────────────────────────────────────
const EXTERNAL_ID_RE = /\/app\/([a-zA-Z0-9_-]+)/;
const GEM_CONVO_ID_RE = /\/gem\/[^/]+\/([a-zA-Z0-9_-]+)/;

function extractExternalId(path: string): string | null {
  return EXTERNAL_ID_RE.exec(path)?.[1] || GEM_CONVO_ID_RE.exec(path)?.[1] || null;
}

// ── Message → Node mappers ───────────────────────────────────────────
function dbMessageToNode(msg: any, convoId: string): ConversationNode {
  return {
    id: msg.id,
    conversationId: convoId,
    content: msg.content,
    role: msg.role as 'user' | 'model',
    timestamp: msg.timestamp,
    orderIndex: msg.order_index,
    inDom: !!findMessageElement(msg.id),
    headings: msg.role === 'model' ? extractHeadings(msg.content) : undefined,
  };
}

function interceptorMessageToNode(msg: any): ConversationNode {
  return {
    id: msg.id,
    conversationId: msg.conversation_id,
    content: msg.content,
    role: msg.role as 'user' | 'model',
    timestamp: msg.created_at,
    inDom: !!findMessageElement(msg.id),
    headings: msg.role === 'model' ? extractHeadings(msg.content) : undefined,
  };
}

// ── The hook ─────────────────────────────────────────────────────────

/**
 * Single hook that owns all SmartScrollbar state and side-effects:
 *
 *  • nodes[]        — merged from DB + HTTP interceptor, sorted by order/time
 *  • activeNodeId   — scroll-position-based "current" node
 *  • scrollToNode() — programmatic scroll + activate
 *
 * Internally it:
 *  1. Fetches history from the local DB when the URL changes
 *  2. Listens for interceptor CustomEvents for live updates
 *  3. Observes DOM mutations to keep inDom flags current
 *  4. Tracks scroll position to detect the active node
 */
export function useConversationNodes() {
  const { url, path } = useUrl();
  const conversations = useAppStore((s) => s.conversations);

  // ── Core state ───────────────────────────────────────────────────
  const [nodes, setNodes] = useState<ConversationNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  // Refs for non-reactive access inside event handlers / timers
  const nodesRef = useRef<ConversationNode[]>([]);
  const activeRef = useRef<string | null>(null);
  const pathRef = useRef(path);
  const prevUrlRef = useRef(url);
  const dbFetchedForRef = useRef<string | null>(null);

  // Keep refs in sync
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { activeRef.current = activeNodeId; }, [activeNodeId]);
  useEffect(() => { pathRef.current = path; }, [path]);

  // ── Helpers (stable — no deps on state) ──────────────────────────
  const merge = useCallback((incoming: ConversationNode[]) => {
    setNodes((prev) => mergeNodes(prev, incoming));
  }, []);

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

  const detectActiveNode = useCallback(() => {
    const current = nodesRef.current;
    if (!current.length) return;

    const scrollContainer = getChatScrollContainer();
    if (!scrollContainer) return;

    const center = window.innerHeight / 2;
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const node of current) {
      if (!node.inDom) continue;
      const el = findMessageElement(node.id);
      if (!el) continue;

      const top = el.getBoundingClientRect().top;
      const dist = Math.abs(top - center);

      if (top <= center) {
        if (dist < bestDist) { bestDist = dist; bestId = node.id; }
      } else if (!bestId && dist < bestDist) {
        bestDist = dist; bestId = node.id;
      }
    }

    if (bestId && bestId !== activeRef.current) setActiveNodeId(bestId);
  }, []);

  // ── 1. DB source ─────────────────────────────────────────────────
  useEffect(() => {
    const isUrlChange = url !== prevUrlRef.current;
    if (isUrlChange) {
      prevUrlRef.current = url;
      setNodes([]);
      setActiveNodeId(null);
      dbFetchedForRef.current = null;
    }

    if (dbFetchedForRef.current === url) return;

    const externalId = extractExternalId(path);
    if (!externalId) return;

    const convo = conversations.find((c) => c.external_id === externalId);
    if (!convo) return;

    dbFetchedForRef.current = url;
    let cancelled = false;

    (async () => {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_MESSAGES_BY_CONVERSATION_ID',
          payload: { conversationId: convo.id },
        });
        if (cancelled || !response?.success || !Array.isArray(response.data))
          return;

        // Double-check: user may have navigated away while we were fetching
        if (extractExternalId(pathRef.current) !== externalId) return;

        const allMessages: any[] = response.data;
        const idsToDelete = await dedupModelMessages(allMessages);

        const dbNodes = allMessages
          .filter(
            (msg: any) =>
              (msg.role === 'user' || msg.role === 'model') &&
              msg.content &&
              msg.message_type !== 'thought' &&
              !idsToDelete.includes(msg.id),
          )
          .map((msg: any) => dbMessageToNode(msg, convo.id));

        merge(dbNodes);
      } catch (e) {
        console.error('SmartScrollbar: DB fetch failed', e);
      }
    })();

    return () => { cancelled = true; };
  }, [url, conversations, merge]);

  // ── 2. Interceptor source ────────────────────────────────────────
  useEffect(() => {
    const handleEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const messages = detail?.messages;
      if (!messages || !Array.isArray(messages)) return;

      // Validate: event must carry a conversation ID that matches the current URL.
      // If either side is missing we discard — data without a known conversation
      // ID is not trustworthy, and if we don't know the current conversation
      // (e.g. on the home page) there's nothing to merge into.
      const eventConvoId = detail?.conversationId ?? detail?.id;
      const urlConvoId = extractExternalId(pathRef.current);
      if (!urlConvoId || !eventConvoId || eventConvoId !== urlConvoId) return;

      const filtered = [...messages]
        .reverse()
        .filter(
          (msg: any) =>
            (msg.role === 'user' || msg.role === 'model') && msg.content,
        );

      const toNodes = () => filtered.map(interceptorMessageToNode);

      merge(toNodes());

      // Re-check after Gemini renders the new DOM elements.
      // Guard each delayed merge — the user may have navigated away by then.
      const delayedMerge = () => {
        const currentId = extractExternalId(pathRef.current);
        if (currentId === eventConvoId) merge(toNodes());
      };
      setTimeout(delayedMerge, 2000);
      setTimeout(delayedMerge, 4000);
    };

    globalThis.addEventListener('GEMINI_CHAT_CONTENT_RESPONSE', handleEvent);
    globalThis.addEventListener('BETTER_SIDEBAR_PROMPT_CREATE', handleEvent);
    return () => {
      globalThis.removeEventListener('GEMINI_CHAT_CONTENT_RESPONSE', handleEvent);
      globalThis.removeEventListener('BETTER_SIDEBAR_PROMPT_CREATE', handleEvent);
    };
  }, [merge]);

  // ── 3. DOM sync (MutationObserver) ───────────────────────────────
  useEffect(() => {
    const scrollContainer = getChatScrollContainer();
    if (!scrollContainer) return;

    const observer = new MutationObserver(refreshDomPresence);
    observer.observe(scrollContainer, { childList: true, subtree: true });
    refreshDomPresence();

    return () => observer.disconnect();
  }, [nodes.length, refreshDomPresence]);

  // ── 4. Active-node detection (scroll listener) ───────────────────
  useEffect(() => {
    // Re-detect whenever nodes/inDom change
    detectActiveNode();
  }, [nodes, detectActiveNode]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(detectActiveNode, SCROLL_DEBOUNCE_MS);
    };

    const target = getChatScrollContainer() || window;
    target.addEventListener('scroll', onScroll, { passive: true });

    const initTimer = setTimeout(detectActiveNode, INITIAL_DETECT_DELAY_MS);

    return () => {
      target.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
      clearTimeout(initTimer);
    };
  }, [detectActiveNode]);

  // ── Public API ───────────────────────────────────────────────────
  const scrollToNode = useCallback((nodeId: string) => {
    const el = findMessageElement(nodeId);
    if (!el) return;
    const container = el.closest('.conversation-container') || el;
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveNodeId(nodeId);
  }, []);

  return { nodes, activeNodeId, scrollToNode };
}
