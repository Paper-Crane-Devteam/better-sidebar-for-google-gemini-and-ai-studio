import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';

export type PendingNewChatPhase =
  | 'editing'       // User is typing a title (input focused)
  | 'idle'          // User blurred the input, waiting for API intercept (editable)
  | 'intercepted';  // API intercepted, title locked, pure pending state

export interface PendingNewChatEntry {
  /** Unique ID for the virtual tree node */
  nodeId: string;
  /** Target folder ID (null = root) */
  folderId: string | null;
  /** User-defined title (empty = let AI generate) */
  title: string;
  /** Current phase */
  phase: PendingNewChatPhase;
}

export interface UsePendingNewChatReturn {
  /** The current pending entry (singleton, null if none) */
  pendingEntry: PendingNewChatEntry | null;
  /** Create a new pending entry (replaces any existing one) */
  createPendingEntry: (folderId: string | null) => void;
  /** Update the title of the pending entry */
  updateTitle: (title: string) => void;
  /** Transition from editing → idle (on blur) */
  commitEditing: () => void;
  /** Re-enter editing mode from idle */
  startEditing: () => void;
  /** Remove the pending entry (cancel / delete) */
  removePendingEntry: () => void;
  /** Called when the create API is intercepted — locks the entry */
  markIntercepted: (conversationId: string) => void;
  /** Called when the conversation is fully created — clears the entry and renames if needed */
  finalize: (conversationId: string, apiTitle: string) => void;
}

const PENDING_NODE_ID = '__pending_new_chat_entry__';

export const usePendingNewChat = (): UsePendingNewChatReturn => {
  const [pendingEntry, setPendingEntry] = useState<PendingNewChatEntry | null>(null);
  const pendingEntryRef = useRef<PendingNewChatEntry | null>(null);
  pendingEntryRef.current = pendingEntry;

  // Track the conversation ID once intercepted, so finalize can match
  const interceptedConversationIdRef = useRef<string | null>(null);

  const { renameItem, fetchData } = useAppStore();

  const createPendingEntry = useCallback((folderId: string | null) => {
    interceptedConversationIdRef.current = null;
    setPendingEntry({
      nodeId: PENDING_NODE_ID,
      folderId,
      title: '',
      phase: 'editing',
    });
  }, []);

  const updateTitle = useCallback((title: string) => {
    setPendingEntry((prev) => {
      if (!prev || prev.phase === 'intercepted') return prev;
      return { ...prev, title };
    });
  }, []);

  const commitEditing = useCallback(() => {
    setPendingEntry((prev) => {
      if (!prev || prev.phase === 'intercepted') return prev;
      return { ...prev, phase: 'idle' };
    });
  }, []);

  const startEditing = useCallback(() => {
    setPendingEntry((prev) => {
      if (!prev || prev.phase === 'intercepted') return prev;
      return { ...prev, phase: 'editing' };
    });
  }, []);

  const removePendingEntry = useCallback(() => {
    interceptedConversationIdRef.current = null;
    setPendingEntry(null);
  }, []);

  const markIntercepted = useCallback((conversationId: string) => {
    interceptedConversationIdRef.current = conversationId;
    setPendingEntry((prev) => {
      if (!prev) return prev;
      return { ...prev, phase: 'intercepted' };
    });
  }, []);

  const finalize = useCallback(async (conversationId: string, apiTitle: string) => {
    const entry = pendingEntryRef.current;
    if (!entry) return;

    // If user defined a custom title, rename the conversation
    const userTitle = entry.title.trim();
    if (userTitle && userTitle !== apiTitle) {
      try {
        await renameItem(conversationId, userTitle, 'file');
      } catch (e) {
        console.error('Better Sidebar: Failed to rename new conversation', e);
      }
    }

    // Clear the pending entry
    interceptedConversationIdRef.current = null;
    setPendingEntry(null);
  }, [renameItem]);

  return {
    pendingEntry,
    createPendingEntry,
    updateTitle,
    commitEditing,
    startEditing,
    removePendingEntry,
    markIntercepted,
    finalize,
  };
};
