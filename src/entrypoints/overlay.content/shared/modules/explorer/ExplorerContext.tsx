import { createContext, useContext } from 'react';

interface ExplorerContextValue {
  onNewChat?: () => void;
  /** Start a new chat and show loading in the given folder */
  onNewChatInFolder?: (folderId: string) => void;
  /** Folder ID where a new chat is being created (loading state) */
  pendingNewChatFolderId?: string | null;
}

export const ExplorerContext = createContext<ExplorerContextValue>({});

export const useExplorerContext = () => useContext(ExplorerContext);
