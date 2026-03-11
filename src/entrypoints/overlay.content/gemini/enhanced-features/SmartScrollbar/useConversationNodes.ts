import { useState, useEffect, useCallback, useRef } from 'react';

export interface ConversationNode {
  id: string; // user message id (e.g. r_xxx)
  conversationId: string;
  content: string; // user message text
  role: 'user' | 'model';
  timestamp?: number;
  isActive?: boolean;
}

/**
 * Hook that listens to intercepted Gemini events and builds
 * a list of conversation nodes for the smart scrollbar.
 */
export const useConversationNodes = () => {
  const [nodes, setNodes] = useState<ConversationNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const nodesRef = useRef<ConversationNode[]>([]);

  // Keep ref in sync
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Listen for GEMINI_CHAT_CONTENT_RESPONSE (bulk chat history load)
  useEffect(() => {
    const handleChatContent = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { messages } = customEvent.detail || {};

      if (!messages || !Array.isArray(messages)) return;

      const userNodes: ConversationNode[] = messages
        .filter((msg: any) => msg.role === 'user' && msg.content)
        .map((msg: any) => ({
          id: msg.id,
          conversationId: msg.conversation_id,
          content: msg.content,
          role: 'user' as const,
          timestamp: msg.created_at,
        }));

      if (userNodes.length > 0) {
        setNodes((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newNodes = userNodes.filter((n) => !existingIds.has(n.id));
          if (newNodes.length === 0) return prev;
          return [...prev, ...newNodes];
        });
      }
    };

    // Listen for BETTER_SIDEBAR_PROMPT_CREATE (new real-time message)
    const handlePromptCreate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { messages } = customEvent.detail || {};

      if (!messages || !Array.isArray(messages)) return;

      const userNodes: ConversationNode[] = messages
        .filter((msg: any) => msg.role === 'user' && msg.content)
        .map((msg: any) => ({
          id: msg.id,
          conversationId: msg.conversation_id,
          content: msg.content,
          role: 'user' as const,
          timestamp: msg.created_at,
        }));

      if (userNodes.length > 0) {
        setNodes((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const newNodes = userNodes.filter((n) => !existingIds.has(n.id));
          if (newNodes.length === 0) return prev;
          return [...prev, ...newNodes];
        });
      }
    };

    globalThis.addEventListener(
      'GEMINI_CHAT_CONTENT_RESPONSE',
      handleChatContent,
    );
    globalThis.addEventListener(
      'BETTER_SIDEBAR_PROMPT_CREATE',
      handlePromptCreate,
    );

    return () => {
      globalThis.removeEventListener(
        'GEMINI_CHAT_CONTENT_RESPONSE',
        handleChatContent,
      );
      globalThis.removeEventListener(
        'BETTER_SIDEBAR_PROMPT_CREATE',
        handlePromptCreate,
      );
    };
  }, []);

  // Track which node is currently visible by observing scroll position
  useEffect(() => {
    const detectActiveNode = () => {
      const currentNodes = nodesRef.current;
      if (currentNodes.length === 0) return;

      // Find the scrollable container
      const chatHistory = document.getElementById('chat-history');
      if (!chatHistory) return;

      // Check which conversation-container is most visible
      let closestNode: string | null = null;
      let closestDistance = Infinity;
      const viewportCenter = window.innerHeight / 2;

      for (const node of currentNodes) {
        // Try to find the DOM element for this user message
        const el = findMessageElement(node.id);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(elementCenter - viewportCenter);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestNode = node.id;
        }
      }

      if (closestNode && closestNode !== activeNodeId) {
        setActiveNodeId(closestNode);
      }
    };

    // Debounce scroll detection
    let rafId: number;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(detectActiveNode);
    };

    // Listen to scroll on the chat-history element or its parent
    const chatHistory = document.getElementById('chat-history');
    const scrollTarget = chatHistory || window;
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });

    // Initial detection
    setTimeout(detectActiveNode, 500);

    return () => {
      scrollTarget.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [activeNodeId]);

  // Clear nodes on URL change (new conversation)
  useEffect(() => {
    const handleUrlChange = () => {
      setNodes([]);
      setActiveNodeId(null);
    };

    // Use popstate for SPA navigation detection
    window.addEventListener('popstate', handleUrlChange);

    // Also observe pushState / replaceState via a custom approach
    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      originalPushState(...args);
      handleUrlChange();
    };

    history.replaceState = (
      ...args: Parameters<typeof history.replaceState>
    ) => {
      originalReplaceState(...args);
      handleUrlChange();
    };

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  const scrollToNode = useCallback((nodeId: string) => {
    const el = findMessageElement(nodeId);
    if (!el) return;

    // Find the parent conversation-container
    const container = el.closest('.conversation-container') || el;
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveNodeId(nodeId);
  }, []);

  return {
    nodes,
    activeNodeId,
    scrollToNode,
  };
};

/**
 * Find a message element in the DOM by its ID.
 * The ID pattern is: message-content-id-r_xxx
 * where r_xxx is the message ID.
 */
function findMessageElement(messageId: string): HTMLElement | null {
  // Try direct ID lookup with the known pattern
  const el = document.querySelector(
    `[id*="message-content-id-${messageId}"]`,
  ) as HTMLElement;
  if (el) return el;

  // Fallback: search by partial ID match
  const allMessageEls = document.querySelectorAll('[id*="message-content-id"]');
  for (const candidate of allMessageEls) {
    if (candidate.id.includes(messageId)) {
      return candidate as HTMLElement;
    }
  }
  return null;
}
