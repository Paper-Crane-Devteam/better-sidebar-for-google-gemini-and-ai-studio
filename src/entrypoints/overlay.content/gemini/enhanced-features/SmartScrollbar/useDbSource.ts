import { useEffect, useRef, useCallback } from 'react';
import { useUrl } from '@/shared/hooks/useUrl';
import { useAppStore } from '@/shared/lib/store';
import { browser } from 'wxt/browser';
import { dedupModelMessages } from './dedup-messages';
import { findMessageElement } from './dom-utils';
import type { ConversationNode } from './types';

/**
 * Source 1: Fetches conversation nodes from the local DB.
 * Provides the full conversation history including old messages
 * that may not be in the DOM yet (Gemini lazy-loads on scroll-up).
 */
export function useDbSource(
  mergeIntoNodes: (nodes: ConversationNode[]) => void,
  resetNodes: () => void,
  setActiveNodeId: (id: string | null) => void,
) {
  const { url } = useUrl();
  const prevUrlRef = useRef<string>(url);
  const dbFetchedForUrlRef = useRef<string | null>(null);
  const conversations = useAppStore((s) => s.conversations);

  const getExternalIdFromUrl = useCallback((): string | null => {
    const match = /\/app\/([a-zA-Z0-9_-]+)/.exec(
      globalThis.location?.pathname || '',
    );
    return match?.[1] || null;
  }, []);

  useEffect(() => {
    const isUrlChange = url !== prevUrlRef.current;
    if (isUrlChange) {
      prevUrlRef.current = url;
      resetNodes();
      setActiveNodeId(null);
      dbFetchedForUrlRef.current = null;
    }

    if (dbFetchedForUrlRef.current === url) return;

    const externalId = getExternalIdFromUrl();
    if (!externalId) return;

    const convo = conversations.find((c) => c.external_id === externalId);
    if (!convo) return;

    dbFetchedForUrlRef.current = url;
    let cancelled = false;

    (async () => {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_MESSAGES_BY_CONVERSATION_ID',
          payload: { conversationId: convo.id },
        });

        if (cancelled || !response?.success || !Array.isArray(response.data))
          return;

        const allMessages: any[] = response.data;
        const idsToDelete = await dedupModelMessages(allMessages);

        const dbNodes: ConversationNode[] = allMessages
          .filter(
            (msg: any) =>
              msg.role === 'user' &&
              msg.content &&
              msg.message_type !== 'thought' &&
              !idsToDelete.includes(msg.id),
          )
          .map((msg: any) => ({
            id: msg.id,
            conversationId: convo.id,
            content: msg.content,
            role: 'user' as const,
            timestamp: msg.timestamp,
            orderIndex: msg.order_index,
            inDom: !!findMessageElement(msg.id),
          }));

        mergeIntoNodes(dbNodes);
      } catch (e) {
        console.error('SmartScrollbar: DB fetch failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    url,
    conversations,
    getExternalIdFromUrl,
    mergeIntoNodes,
    resetNodes,
    setActiveNodeId,
  ]);
}
