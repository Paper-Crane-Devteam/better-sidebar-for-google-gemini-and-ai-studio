/**
 * Agent Config Store — Persisted via chrome.storage.local.
 *
 * Stores user customization:
 * - Custom skills (user-created)
 * - Disabled builtin skills
 * - Custom MCP servers (future)
 *
 * The builtin "Better Sidebar" MCP server is always on and has no user override.
 *
 * Builtin data lives in code (builtin-skills.ts, builtin-mcp.ts).
 * This store only holds user overrides and additions.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Skill } from './skills/types';

export interface AgentConfigStoreState {
  /** User-created custom skills */
  customSkills: Skill[];

  /** IDs of builtin skills that user has disabled */
  disabledBuiltinSkills: string[];

  /** IDs of MCP servers that user has disabled (not applied to required core servers) */
  disabledMcpServers: string[];

  /**
   * Which agent the Agent tab was last showing.
   *
   * A preference rather than a capability, and the odd one out in this store — but it earns
   * its place here because it is the one piece of agent UI state worth surviving a reload:
   * someone reviewing a thesis in the workspace should not be dropped back on the
   * conversation agent every time the page reloads.
   *
   * ⚠️ Does **not** decide which agent a session runs as. That comes from the `>` capsule and
   * is fixed for the session; this only picks the panel.
   */
  selectedAgentId: string;

  // ─── Actions ─────────────────────────────────────────────────────────

  addCustomSkill: (
    data: Omit<Skill, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'enabled'>,
  ) => void;
  updateCustomSkill: (
    id: string,
    updates: Partial<Pick<Skill, 'title' | 'description' | 'icon' | 'promptContent'>>,
  ) => void;
  removeCustomSkill: (id: string) => void;
  setCustomSkillEnabled: (id: string, enabled: boolean) => void;
  toggleBuiltinSkill: (id: string) => void;
  toggleMcpServer: (id: string) => void;
  setSelectedAgentId: (id: string) => void;
}

export const useAgentConfigStore = create<AgentConfigStoreState>()(
  persist(
    (set, get) => ({
      customSkills: [],
      disabledBuiltinSkills: [],
      disabledMcpServers: [],
      // Not imported from `agents/registry` on purpose: this store is persisted and loads
      // before the agent layer, and a literal keeps the two from depending on each other.
      // `normalizeAgentId` maps anything unexpected onto a real agent at read time.
      selectedAgentId: 'bettersidebar',

      addCustomSkill: (data) => {
        const now = Date.now();
        const newSkill: Skill = {
          ...data,
          id: `custom-${crypto.randomUUID().slice(0, 8)}`,
          type: 'custom',
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
        set({ customSkills: [...get().customSkills, newSkill] });
      },

      updateCustomSkill: (id, updates) => {
        set({
          customSkills: get().customSkills.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s,
          ),
        });
      },

      removeCustomSkill: (id) => {
        set({ customSkills: get().customSkills.filter((s) => s.id !== id) });
      },

      setCustomSkillEnabled: (id, enabled) => {
        set({
          customSkills: get().customSkills.map((s) => (s.id === id ? { ...s, enabled } : s)),
        });
      },

      toggleBuiltinSkill: (id) => {
        const current = get().disabledBuiltinSkills;
        if (current.includes(id)) {
          set({ disabledBuiltinSkills: current.filter((i) => i !== id) });
        } else {
          set({ disabledBuiltinSkills: [...current, id] });
        }
      },

      toggleMcpServer: (id) => {
        const current = get().disabledMcpServers;
        if (current.includes(id)) {
          set({ disabledMcpServers: current.filter((i) => i !== id) });
        } else {
          set({ disabledMcpServers: [...current, id] });
        }
      },

      setSelectedAgentId: (id) => set({ selectedAgentId: id }),
    }),
    {
      name: 'bs-agent-config',
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
    },
  ),
);
