import { useEffect } from 'react';
import { findMessageElement } from './dom-utils';
import type { ConversationNode } from './types';

/**
 * Source 2: Listens for HTTP interceptor events from the main-world script.
 * Provides the freshest data for the current view as Gemini fetches from network.
 *
 * When the interceptor fires, the DOM element for the new message may not
 * exist yet (Gemini hasn't rendered it). We merge immediately with
 * inDom=false, then schedule a delayed re-merge so the MutationObserver
 * in useDomSync can pick it up once Gemini renders.
 */
export function useInterceptorSource(
  mergeIntoNodes: (nodes: ConversationNode[]) => void,
) {
  useEffect(() => {
    const handleEvent = (event: Event) => {
      const messages = (event as CustomEvent).detail?.messages;
      if (!messages || !Array.isArray(messages)) return;

      const reversed = [...messages].reverse();

      const toNodes = (): ConversationNode[] =>
        reversed
          .filter((msg: any) => msg.role === 'user' && msg.content)
          .map((msg: any) => ({
            id: msg.id,
            conversationId: msg.conversation_id,
            content: msg.content,
            role: 'user' as const,
            timestamp: msg.created_at,
            inDom: !!findMessageElement(msg.id),
          }));

      // Merge immediately (inDom may be false for brand-new messages)
      mergeIntoNodes(toNodes());

      // Re-check after Gemini has had time to render the new message
      setTimeout(() => mergeIntoNodes(toNodes()), 2000);
      setTimeout(() => mergeIntoNodes(toNodes()), 4000);
    };

    globalThis.addEventListener('GEMINI_CHAT_CONTENT_RESPONSE', handleEvent);
    globalThis.addEventListener('BETTER_SIDEBAR_PROMPT_CREATE', handleEvent);

    return () => {
      globalThis.removeEventListener(
        'GEMINI_CHAT_CONTENT_RESPONSE',
        handleEvent,
      );
      globalThis.removeEventListener(
        'BETTER_SIDEBAR_PROMPT_CREATE',
        handleEvent,
      );
    };
  }, [mergeIntoNodes]);
}
