import { create } from 'zustand';
import type { AppState } from './types';
import { initialUIState } from './initial-state';
import { createAllActions } from './actions';

export const useAppStore = create<AppState>((set, get) => ({
  folders: [],
  conversations: [],
  promptFolders: [],
  prompts: [],
  favorites: [],
  tags: [],
  conversationTags: [],
  gems: [],
  notebooks: [],
  isLoading: false,
  ui: initialUIState,

  ...createAllActions(set, get),
}));
