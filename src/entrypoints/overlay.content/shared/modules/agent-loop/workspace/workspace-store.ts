/**
 * Workspace registry — the list of workspaces and which one is selected.
 *
 * Lives in `chrome.storage.local`, not in OPFS. Two reasons:
 *
 * - The switcher renders from it synchronously. Reading a manifest out of OPFS means
 *   a message round trip, so the control would flash empty on every mount.
 * - The agent must not see it. A `.meta.json` inside the workspace root would show up
 *   in `list_files` and have to be filtered out of every traversal — a special case
 *   in the filesystem layer to hold data the filesystem layer has no use for.
 *
 * OPFS holds only file content, under `agent-workspace/<id>/`.
 *
 * ⚠️ `activeId` is a *selection*, not the binding. Once a conversation runs a
 * workspace tool it is locked to whatever was active at that moment, and that binding
 * lives in `agent_sessions.workspace_id`. See `workspace-binding.ts`.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface WorkspaceMeta {
  id: string;
  name: string;
  createdAt: number;
}

/**
 * The workspace every install starts with.
 *
 * A fixed id rather than a generated one: it is the fallback when a selection points
 * at something deleted, and that fallback has to be nameable without reading state.
 */
export const DEFAULT_WORKSPACE_ID = 'default';

export interface WorkspaceStoreState {
  workspaces: WorkspaceMeta[];
  /** The workspace a *new* conversation will use. */
  activeId: string;

  createWorkspace: (name: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  removeWorkspace: (id: string) => void;
  setActiveId: (id: string) => void;
}

function defaultWorkspace(): WorkspaceMeta {
  return { id: DEFAULT_WORKSPACE_ID, name: 'Default', createdAt: Date.now() };
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  persist(
    (set, get) => ({
      workspaces: [defaultWorkspace()],
      activeId: DEFAULT_WORKSPACE_ID,

      createWorkspace: (name) => {
        const id = `ws-${crypto.randomUUID().slice(0, 8)}`;
        const trimmed = name.trim() || 'Untitled';
        set({
          workspaces: [...get().workspaces, { id, name: trimmed, createdAt: Date.now() }],
          // Selecting it immediately is the point of having just created it.
          activeId: id,
        });
        return id;
      },

      renameWorkspace: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set({
          workspaces: get().workspaces.map((w) =>
            w.id === id ? { ...w, name: trimmed } : w,
          ),
        });
      },

      /**
       * Drop a workspace from the registry.
       *
       * Deleting the files is the caller's job (it needs the message bridge, which a
       * store should not reach into). The default workspace is not removable: it is
       * the fallback for a dangling selection, so removing it would leave that with
       * nowhere to land.
       */
      removeWorkspace: (id) => {
        if (id === DEFAULT_WORKSPACE_ID) return;
        const remaining = get().workspaces.filter((w) => w.id !== id);
        set({
          workspaces: remaining,
          activeId:
            get().activeId === id ? DEFAULT_WORKSPACE_ID : get().activeId,
        });
      },

      setActiveId: (id) => {
        if (!get().workspaces.some((w) => w.id === id)) return;
        set({ activeId: id });
      },
    }),
    {
      name: 'bs-agent-workspaces',
      storage: createJSONStorage(() => ({
        getItem: async (name: string): Promise<string | null> => {
          const result = await chrome.storage.local.get(name);
          return (result[name] as string) ?? null;
        },
        setItem: async (name: string, value: string) => {
          await chrome.storage.local.set({ [name]: value });
        },
        removeItem: async (name: string) => {
          await chrome.storage.local.remove(name);
        },
      })),
      /**
       * Rehydration can land on a persisted state whose `activeId` names a workspace
       * that is no longer there — deleted in another tab, or lost with a partial write.
       * Left alone it would send every file operation to a directory nothing lists.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.workspaces.length === 0) {
          state.workspaces = [defaultWorkspace()];
        }
        if (!state.workspaces.some((w) => w.id === state.activeId)) {
          state.activeId = state.workspaces[0].id;
        }
      },
    },
  ),
);

/** The workspace a new conversation would use. Safe before rehydration. */
export function getActiveWorkspaceId(): string {
  return useWorkspaceStore.getState().activeId || DEFAULT_WORKSPACE_ID;
}

/** Look up a workspace's display name, falling back to its id. */
export function getWorkspaceName(id: string): string {
  return useWorkspaceStore.getState().workspaces.find((w) => w.id === id)?.name ?? id;
}
