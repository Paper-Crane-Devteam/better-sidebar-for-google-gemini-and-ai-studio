import { createContext, useContext } from 'react';

interface ExplorerContextValue {
  onNewChat?: () => void;
}

export const ExplorerContext = createContext<ExplorerContextValue>({});

export const useExplorerContext = () => useContext(ExplorerContext);
