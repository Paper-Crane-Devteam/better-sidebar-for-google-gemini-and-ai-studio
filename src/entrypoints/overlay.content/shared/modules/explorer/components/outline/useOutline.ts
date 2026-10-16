/**
 * Hook: useOutline
 *
 * Builds outline section data from the shared conversation-messages-store.
 * No longer manages its own DB fetches or interceptor listeners — all data
 * comes from useConversationMessagesStore (initialized at the app root).
 *
 * This hook only adds:
 *  - Outline parsing (messages → sections with parsed heading/code trees)
 *  - Filter / search
 *  - Scroll-based active section detection
 *  - Navigation (scroll to heading)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useConversationMessagesStore,
  type ConversationMessage,
} from '@/shared/lib/conversation-messages-store';
import { parseOutlineFromContent } from './parse-outline';
import type { OutlineSection, OutlineFilter } from './types';
import { getPlatformDomAdapter } from '@/shared/lib/platform-dom-adapter';

export function useOutline() {
  const messages = useConversationMessagesStore((s) => s.messages);
  const isLoading = useConversationMessagesStore((s) => s.isLoading);
  const isOnConversation = useConversationMessagesStore((s) => s.isOnConversation);

  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OutlineFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Build sections from messages ─────────────────────────────────
  const sections = useMemo(() => {
    const result: OutlineSection[] = [];
    let turnIndex = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;

      turnIndex++;
      const userContent = msg.content.trim();
      const userLabel =
        userContent.length > 80
          ? userContent.substring(0, 80) + '…'
          : userContent;

      // Find the paired model message (next message with role=model)
      let modelMsg: ConversationMessage | undefined;
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'model') {
          modelMsg = messages[j];
          break;
        }
        if (messages[j].role === 'user') break; // next user message, no model for this turn
      }

      const children = modelMsg
        ? parseOutlineFromContent(modelMsg.content, modelMsg.id)
        : [];

      result.push({
        id: `section-${msg.id}`,
        userQuery: userLabel,
        userQueryFull: userContent,
        userMessageId: msg.id,
        userInDom: msg.inDom,
        modelMessageId: modelMsg?.id,
        modelContent: modelMsg?.content,
        modelInDom: modelMsg?.inDom ?? false,
        children,
        turnIndex,
        timestamp: msg.timestamp,
      });
    }

    return result;
  }, [messages]);

  // ── Active section detection (scroll tracking) ───────────────────
  useEffect(() => {
    const adapter = getPlatformDomAdapter();
    if (!adapter) return;

    const detect = () => {
      if (sections.length === 0) return;
      const center = window.innerHeight / 2;
      let bestId: string | null = null;
      let bestDist = Infinity;

      for (const section of sections) {
        const el = adapter.findMessageElement(section.userMessageId);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        const dist = Math.abs(top - center);
        if (top <= center && dist < bestDist) {
          bestDist = dist;
          bestId = section.userMessageId;
        } else if (!bestId && dist < bestDist) {
          bestDist = dist;
          bestId = section.userMessageId;
        }
      }

      if (bestId && bestId !== activeMessageId) {
        setActiveMessageId(bestId);
      }
    };

    detect();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(detect, 100);
    };

    const target = adapter.getChatScrollContainer() || window;
    target.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      target.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [sections, activeMessageId]);

  // ── Navigation ───────────────────────────────────────────────────
  const scrollToMessage = useCallback((messageId: string, headingLabel?: string, headingLevel?: string) => {
    const adapter = getPlatformDomAdapter();
    if (!adapter) return;

    const el = adapter.findMessageElement(messageId);
    if (!el) return;

    // If a heading label is provided, try to find and scroll to that specific element
    if (headingLabel) {
      const searchRoot = el.closest('.conversation-container') || el;

      // For actual h1-h4 headings, search by tag
      if (headingLevel && /^h[1-4]$/.test(headingLevel)) {
        const headings = searchRoot.querySelectorAll(headingLevel);
        for (const heading of headings) {
          if (heading.textContent?.trim() === headingLabel.trim()) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveMessageId(messageId);
            return;
          }
        }
        // Partial match fallback
        for (const heading of headings) {
          if (heading.textContent?.trim().includes(headingLabel.trim().slice(0, 40))) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setActiveMessageId(messageId);
            return;
          }
        }
      }

      // For bold headers, code blocks, etc. — search by text content across all elements
      const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_ELEMENT);
      let current = walker.nextNode() as HTMLElement | null;
      const labelNorm = headingLabel.trim().slice(0, 40);
      while (current) {
        const text = current.textContent?.trim();
        if (text && text.includes(labelNorm) && current.offsetHeight > 0) {
          current.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveMessageId(messageId);
          return;
        }
        current = walker.nextNode() as HTMLElement | null;
      }
    }

    // Default: scroll to the message container
    if (adapter.scrollToMessageElement) {
      adapter.scrollToMessageElement(el);
    } else {
      const container = el.closest('.conversation-container') || el;
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveMessageId(messageId);
  }, []);

  // ── Filtered sections ────────────────────────────────────────────
  const filteredSections = useMemo(() => {
    let result = sections;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result
        .map((section) => {
          // Full-text search: match against user query, model content, and outline node labels
          const matchesUserQuery = section.userQueryFull.toLowerCase().includes(q);
          const matchesModelContent = section.modelContent?.toLowerCase().includes(q) ?? false;
          const matchingChildren = section.children.filter(
            (child) =>
              child.label.toLowerCase().includes(q) ||
              child.children.some((c) => c.label.toLowerCase().includes(q)),
          );
          if (matchesUserQuery || matchesModelContent || matchingChildren.length > 0) {
            return {
              ...section,
              // If matched via full content, show all children; otherwise only matching ones
              children: (matchesUserQuery || matchesModelContent) ? section.children : matchingChildren,
            };
          }
          return null;
        })
        .filter(Boolean) as OutlineSection[];
    }

    if (filter !== 'all') {
      const allowedTypes: Record<Exclude<OutlineFilter, 'all'>, string[]> = {
        headings: ['heading'],
        code: ['code-block'],
        images: ['image'],
        tables: ['table'],
        links: ['link'],
        math: ['math'],
      };
      const types = allowedTypes[filter];
      result = result
        .map((section) => {
          const filtered = section.children.filter((c) =>
            types.includes(c.type),
          );
          if (filtered.length > 0) {
            return { ...section, children: filtered };
          }
          return null;
        })
        .filter(Boolean) as OutlineSection[];
    }

    return result;
  }, [sections, filter, searchQuery]);

  // ── Stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let headings = 0;
    let codeBlocks = 0;
    let images = 0;
    let tables = 0;
    let links = 0;
    let math = 0;
    const countNodes = (nodes: OutlineSection['children']) => {
      for (const node of nodes) {
        if (node.type === 'heading') headings++;
        if (node.type === 'code-block') codeBlocks++;
        if (node.type === 'image') images++;
        if (node.type === 'table') tables++;
        if (node.type === 'link') links++;
        if (node.type === 'math') math++;
        countNodes(node.children);
      }
    };
    sections.forEach((s) => countNodes(s.children));
    return { turns: sections.length, headings, codeBlocks, images, tables, links, math };
  }, [sections]);

  return {
    sections: filteredSections,
    allSections: sections,
    activeMessageId,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    scrollToMessage,
    isLoading,
    stats,
    isOnConversation,
  };
}
