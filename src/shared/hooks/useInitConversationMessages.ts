/**
 * Hook: useInitConversationMessages
 *
 * Drives all side-effects for the shared conversation messages store:
 *  - URL change detection → reset
 *  - DB fetch on conversation change
 *  - Interceptor event listeners → merge
 *  - MutationObserver → inDom refresh
 *
 * Platform-agnostic: uses the registered PlatformDomAdapter for all
 * DOM/URL/event operations. Works for both Gemini and AI Studio.
 *
 * Call this ONCE at the overlay app root. Consumers just read from the store.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useUrl } from '@/shared/hooks/useUrl';
import { useAppStore } from '@/shared/lib/store';
import { browser } from 'wxt/browser';
import {
  useConversationMessagesStore,
  type ConversationMessage,
} from '@/shared/lib/conversation-messages-store';
import { getPlatformDomAdapter } from '@/shared/lib/platform-dom-adapter';
import { dedupModelMessages } from '@/shared/lib/dedup-messages';
import { useShallow } from 'zustand/react/shallow';
import throttle from 'lodash/throttle';

// ── The Hook ─────────────────────────────────────────────────────────

export function useInitConversationMessages() {
  const { url, path } = useUrl();
  const conversations = useAppStore((s) => s.conversations);

  const pathRef = useRef(path);
  const prevUrlRef = useRef(url);

  const {
    mergeMessages,
    reset,
    refreshDomPresence,
    setIsLoading,
    setFetchedForUrl,
    setIsOnConversation,
    setConversationDbId,
    fetchedForUrl,
    messageCount,
  } = useConversationMessagesStore(
    useShallow((s) => ({
      mergeMessages: s.mergeMessages,
      reset: s.reset,
      refreshDomPresence: s.refreshDomPresence,
      setIsLoading: s.setIsLoading,
      setFetchedForUrl: s.setFetchedForUrl,
      setIsOnConversation: s.setIsOnConversation,
      setConversationDbId: s.setConversationDbId,
      fetchedForUrl: s.fetchedForUrl,
      // Only the count: this hook sits at the root of the enhanced-features tree,
      // and subscribing to the array re-rendered all of it on every merge.
      messageCount: s.messages.length,
    })),
  );

  useEffect(() => { pathRef.current = path; }, [path]);

  // ── 1. URL change detection + DB fetch ─────────────────────────────
  useEffect(() => {
    const adapter = getPlatformDomAdapter();
    if (!adapter) return;

    const isUrlChange = url !== prevUrlRef.current;
    if (isUrlChange) {
      prevUrlRef.current = url;
      reset();
    }

    const externalId = adapter.extractExternalId(path);
    setIsOnConversation(!!externalId);

    if (!externalId) {
      reset();
      return;
    }

    // Don't re-fetch if we already loaded for this URL
    if (fetchedForUrl === url) return;

    // Find by external_id (primary) or by id (fallback for AI Studio where id === external_id)
    const convo = conversations.find(
      (c) => c.external_id === externalId || c.id === externalId,
    );
    if (!convo) return;

    setFetchedForUrl(url);
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_MESSAGES_BY_CONVERSATION_ID',
          payload: { conversationId: convo.id },
        });
        if (cancelled || !response?.success || !Array.isArray(response.data)) return;

        // Guard: user may have navigated away while fetching
        if (adapter.extractExternalId(pathRef.current) !== externalId) return;

        const allMessages: any[] = response.data;
        const idsToDelete = await dedupModelMessages(allMessages);

        // Which conversation row these messages belong to. The SmartScrollbar
        // erase button needs it to scope its DELETE.
        setConversationDbId(convo.id);

        const dbMessages: ConversationMessage[] = allMessages
          .filter(
            (msg: any) =>
              (msg.role === 'user' || msg.role === 'model') &&
              msg.content &&
              msg.message_type !== 'thought' &&
              !idsToDelete.includes(msg.id),
          )
          .map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            role: msg.role as 'user' | 'model',
            timestamp: msg.timestamp,
            orderIndex: msg.order_index,
            inDom: !!adapter.findMessageElement(msg.id),
          }));

        if (!cancelled) {
          mergeMessages(dbMessages);
        }
      } catch (e) {
        console.error('ConversationMessages: DB fetch failed', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [url, conversations]);

  // ── 2. Interceptor event listeners ─────────────────────────────────
  const handleInterceptorEvent = useCallback((event: Event) => {
    const adapter = getPlatformDomAdapter();
    if (!adapter) return;

    const detail = (event as CustomEvent).detail;
    const parsed = adapter.parseInterceptorEvent(detail);
    if (!parsed) return;

    const {
      conversationId: eventConvoId,
      messages: parsedMessages,
      replaceAfterMessageId,
    } = parsed;
    const urlConvoId = adapter.extractExternalId(pathRef.current);
    if (!urlConvoId || eventConvoId !== urlConvoId) return;

    // Mark as on-conversation in case this fires before the DB fetch path runs
    useConversationMessagesStore.getState().setIsOnConversation(true);

    // On regeneration, remove stale messages after the anchor before merging new ones
    if (replaceAfterMessageId) {
      useConversationMessagesStore.getState().removeMessagesAfter(replaceAfterMessageId);
    }

    mergeMessages(parsedMessages);

    // Re-check after platform renders new DOM elements
    const delayedRefresh = () => {
      const currentId = adapter.extractExternalId(pathRef.current);
      if (currentId === eventConvoId) {
        const refreshed = parsedMessages.map((m) => ({
          ...m,
          inDom: !!adapter.findMessageElement(m.id),
        }));
        mergeMessages(refreshed);
      }
    };
    setTimeout(delayedRefresh, 2000);
    setTimeout(delayedRefresh, 4000);
  }, [mergeMessages]);

  useEffect(() => {
    const adapter = getPlatformDomAdapter();
    if (!adapter) return;

    for (const eventName of adapter.interceptorEvents) {
      globalThis.addEventListener(eventName, handleInterceptorEvent);
    }
    return () => {
      for (const eventName of adapter.interceptorEvents) {
        globalThis.removeEventListener(eventName, handleInterceptorEvent);
      }
    };
  }, [handleInterceptorEvent]);

  // ── 3. DOM MutationObserver for inDom refresh ──────────────────────
  useEffect(() => {
    const adapter = getPlatformDomAdapter();
    if (!adapter) return;

    // Throttled: `refreshDomPresence` looks up every message in the DOM, and while a
    // reply streams the container mutates on every token.
    const refresh = throttle(refreshDomPresence, 250, { leading: true, trailing: true });
    const observer = new MutationObserver(refresh);
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;

    // The chat view can render after the messages arrive (AI Studio mounts its
    // scroll container late), so keep looking for a while instead of giving up.
    const attach = () => {
      const scrollContainer = adapter.getChatScrollContainer();
      if (!scrollContainer) {
        if (++retries <= 20) retryTimer = setTimeout(attach, 500);
        return;
      }
      observer.observe(scrollContainer, { childList: true, subtree: true });
      refreshDomPresence();
    };
    attach();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      observer.disconnect();
      refresh.cancel();
    };
  }, [messageCount, refreshDomPresence]);
}
