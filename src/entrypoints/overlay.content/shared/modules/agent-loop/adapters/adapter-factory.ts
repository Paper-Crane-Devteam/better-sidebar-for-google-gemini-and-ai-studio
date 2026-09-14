/**
 * Adapter Factory — Platform auto-detection and lazy adapter instantiation.
 *
 * Detects the current platform from the URL hostname and creates the
 * appropriate AgentPlatformAdapter. Future platforms just need:
 * 1. A new adapter class implementing AgentPlatformAdapter
 * 2. Registration in ADAPTER_REGISTRY below
 */

import type { AgentPlatformAdapter } from './types';
import { GeminiAgentAdapter } from './gemini-adapter';
import { AIStudioAgentAdapter } from './aistudio-adapter';

// ─── Platform Types ──────────────────────────────────────────────────────────

/**
 * Supported platform identifiers.
 * These match the `platform` column values in the database.
 */
export type PlatformId = 'gemini' | 'aistudio' | 'chatgpt' | 'claude';

export interface PlatformInfo {
  /** Platform identifier (matches DB platform column) */
  id: PlatformId;
  /** Human-readable name */
  displayName: string;
  /** Hostnames that identify this platform */
  hostnames: string[];
  /** Factory function to create the adapter */
  createAdapter: () => AgentPlatformAdapter;
}

// ─── Registry ────────────────────────────────────────────────────────────────

const ADAPTER_REGISTRY: PlatformInfo[] = [
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    hostnames: ['gemini.google.com'],
    createAdapter: () => new GeminiAgentAdapter(),
  },
  {
    id: 'aistudio',
    displayName: 'Google AI Studio',
    hostnames: ['aistudio.google.com'],
    createAdapter: () => new AIStudioAgentAdapter(),
  },
  // Future platforms:
  // {
  //   id: 'chatgpt',
  //   displayName: 'ChatGPT',
  //   hostnames: ['chatgpt.com', 'chat.openai.com'],
  //   createAdapter: () => new ChatGPTAgentAdapter(),
  // },
  // {
  //   id: 'claude',
  //   displayName: 'Claude',
  //   hostnames: ['claude.ai'],
  //   createAdapter: () => new ClaudeAgentAdapter(),
  // },
];

// ─── Detection & Factory ─────────────────────────────────────────────────────

/**
 * Detect the current platform from the page URL.
 * Returns null if the current page is not a supported platform.
 */
export function detectPlatform(): PlatformInfo | null {
  const hostname = window.location.hostname;

  for (const platform of ADAPTER_REGISTRY) {
    for (const h of platform.hostnames) {
      if (hostname === h || hostname.endsWith(`.${h}`)) {
        return platform;
      }
    }
  }

  return null;
}

/**
 * Get the current platform ID, or null if not on a supported platform.
 */
export function getCurrentPlatformId(): PlatformId | null {
  return detectPlatform()?.id ?? null;
}

/**
 * Get the current platform display name.
 */
export function getCurrentPlatformName(): string | null {
  return detectPlatform()?.displayName ?? null;
}

/**
 * Create an adapter for the current platform.
 * Returns null if the current page is not a supported platform.
 */
export function createAdapterForCurrentPlatform(): AgentPlatformAdapter | null {
  const platform = detectPlatform();
  if (!platform) {
    console.warn('[AgentLoop] No adapter found for hostname:', window.location.hostname);
    return null;
  }

  console.log(`[AgentLoop] Platform detected: ${platform.displayName} (${platform.id})`);
  return platform.createAdapter();
}

/**
 * Create an adapter for a specific platform ID.
 * Useful for testing or when you know the platform already.
 */
export function createAdapterForPlatform(platformId: PlatformId): AgentPlatformAdapter | null {
  const platform = ADAPTER_REGISTRY.find((p) => p.id === platformId);
  if (!platform) {
    console.warn('[AgentLoop] Unknown platform ID:', platformId);
    return null;
  }
  return platform.createAdapter();
}

/**
 * Get all registered platforms (for UI display or configuration).
 */
export function getRegisteredPlatforms(): readonly PlatformInfo[] {
  return ADAPTER_REGISTRY;
}
