import { useState, useCallback, useRef } from 'react';

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

export interface FinalizeResult {
  /** Whether a rename is needed */
  needsRename: boolean;
  /** The user-defined title to rename to */
  userTitle: string;
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
  /** Called when the conversation is fully created — clears the entry and returns rename info */
  finalize: (apiTitle: string) => FinalizeResult;
}

const PENDING_NODE_ID = '__pending_new_chat_entry__';

export const usePendingNewChat = (): UsePendingNewChatReturn => {
  const [pendingEntry, setPendingEntry] = useState<PendingNewChatEntry | null>(null);
  const pendingEntryRef = useRef<PendingNewChatEntry | null>(null);
  pendingEntryRef.current = pendingEntry;

  // Track the conversation ID once intercepted, so finalize can match
  const interceptedConversationIdRef = useRef<string | null>(null);

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

  /**
   * Finalize the pending entry: clears it and returns whether a rename is needed.
   * The caller is responsible for actually calling renameItem.
   * This avoids closure/reference issues with store actions inside useCallback.
   */
  const finalize = useCallback((apiTitle: string): FinalizeResult => {
    const entry = pendingEntryRef.current;
    if (!entry) return { needsRename: false, userTitle: '' };

    // Clear the pending entry immediately (removes the virtual node from tree)
    interceptedConversationIdRef.current = null;
    setPendingEntry(null);

    // Check if user defined a custom title that differs from the API title
    const userTitle = entry.title.trim();
    if (userTitle && userTitle !== apiTitle) {
      return { needsRename: true, userTitle };
    }
    return { needsRename: false, userTitle: '' };
  }, []);

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
