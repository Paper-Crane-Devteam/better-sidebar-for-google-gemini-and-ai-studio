import React from 'react';
import { useConversationNodes } from './useConversationNodes';
import {
  SmartScrollbarView,
  type SmartScrollbarItem,
} from '@/entrypoints/overlay.content/shared/components/smart-scrollbar/SmartScrollbarView';

/**
 * Gemini SmartScrollbar: feeds the shared dot bar from the conversation
 * messages store (DB + interceptor), whose ids match Gemini's DOM.
 */
export const SmartScrollbar: React.FC = () => {
  const { nodes, activeNodeId, scrollToNode } = useConversationNodes();
  const userNodes = nodes.filter((n) => n.role === 'user');

  // If there are absolutely no nodes, the feature is hidden
  const isOnConversationPage = nodes.length > 0 || isConversationUrl();
  const isLoading = isOnConversationPage && userNodes.length === 0;

  // Hide when fewer than 3 model responses
  const modelNodeCount = nodes.filter((n) => n.role === 'model').length;
  if (!isOnConversationPage || modelNodeCount < 3) return null;

  const items: SmartScrollbarItem[] = userNodes.map((n) => ({
    id: n.id,
    content: n.content,
    available: n.inDom,
  }));

  return (
    <SmartScrollbarView
      items={items}
      activeId={activeNodeId}
      onSelect={scrollToNode}
      loading={isLoading}
      variant="gemini"
    />
  );
};

/** Check if the current URL looks like a Gemini conversation page */
function isConversationUrl(): boolean {
  const path = globalThis.location?.pathname || '';
  return /\/app\/[a-zA-Z0-9_-]+/.test(path) || /\/gem\/[^/]+\/[a-zA-Z0-9_-]+/.test(path);
}
