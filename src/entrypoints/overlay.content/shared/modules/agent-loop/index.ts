/**
 * Agent Loop module — Public API.
 */

// Types
export type {
  AgentLoopStatus,
  ParsedToolCall,
  ParseResult,
  ToolCallResult,
  BuiltInPrompt,
  PendingApproval,
  ApprovalDecision,
  ApprovalScope,
  ToolRisk,
  AgentLoopSettings,
  AgentEndReason,
  TaskOutcome,
} from './types';

// Store
export { useAgentLoopStore } from './agent-loop-store';

// Event Bus
export { agentEventBus } from './event-bus';
export type { AgentEventMap } from './event-bus';

// Engine
export {
  AgentLoopEngine,
  setActiveEngine,
  getActiveEngine,
  clearActiveEngine,
  parseToolCalls,
  TOOL_TAG,
  CircuitBreaker,
} from './engine';
export type { CircuitBreakerState, LoopCheckResult, FailureCheckResult } from './engine';

// Tools
export { executeToolCall } from './tools/tool-registry';
export { executeSql } from './tools/execute-sql';
// Message sync — the run outlives the agent session, so the overlay entry resumes it
export {
  syncMessages,
  startSyncRun,
  resumeSyncRun,
  cancelSyncRun,
  isSyncRunActive,
} from './tools/sync';

// Undo — table snapshots, one undo point per session
export {
  undoAgentWrites,
  describeUndo,
  canUndo,
  undoBlockedReason,
  affectedTables,
  resetSnapshots,
  subscribeUndoState,
} from './undo';
export type { UndoResult } from './undo';
export {
  completeTask,
  COMPLETE_TASK_SIGNAL,
  parseCompleteTaskSignal,
} from './tools/complete-task';

// Prompts
export { assembleFinalPrompt, assembleSkillActivation } from './prompts/prompt-assembler';
export { buildInitialMessage } from './prompts/initial-message';
/** @deprecated Use assembleFinalPrompt instead */
export { getBasePrompt } from './prompts/base-prompt';
/** @deprecated Use getSkillsForAgent from the skills layer instead */
export { getBuiltInPrompts, getBuiltInPromptById } from './prompts/built-in-registry';

// Hooks
export { useAgentTrigger } from './useAgentTrigger';
export type { AgentTriggerPopupState } from './useAgentTrigger';

// Agent entries (one row per agent) — shared by the `>` popup and the tab launcher
export {
  getAgentEntries,
  getAgentEntryById,
  searchAgentEntries,
  agentIdFromEntry,
  defaultAgentTitle,
  AGENT_AUTO_ID,
} from './agent-entry';
export type { AgentEntry } from './agent-entry';

// Agents — who the session is running as
export {
  AGENTS,
  DEFAULT_AGENT_ID,
  getAgent,
  listAgents,
  localizedAgent,
  normalizeAgentId,
} from './agents/registry';
export type { AgentDefinition, AgentId } from './agents/types';

// Adapters
export type { AgentPlatformAdapter, ComposerState, ResultSection } from './adapters/types';
export { GeminiAgentAdapter } from './adapters/gemini-adapter';
export { AIStudioAgentAdapter } from './adapters/aistudio-adapter';
export {
  createAdapterForCurrentPlatform,
  createAdapterForPlatform,
  detectPlatform,
  getCurrentPlatformId,
  getCurrentPlatformName,
  getRegisteredPlatforms,
} from './adapters/adapter-factory';
export type { PlatformId, PlatformInfo } from './adapters/adapter-factory';

// UI Components
export { AgentCommandPopup } from './AgentCommandPopup';

// Execution policy — who needs approval, and who therefore presses send
export { useAgentPolicyStore } from './agent-policy-store';
export type { AgentPolicyState } from './agent-policy-store';
export {
  requiresApproval,
  shouldAutoSend,
  isUnattendedAllowed,
  getToolRisk,
  isWriteOperation,
  isControlTool,
  buildToolCallFingerprint,
} from './execution-policy';

// Renderer
export { ConversationOverlay, ConversationViewSwitcher, injectRendererStyles, buildPromptMarker } from './renderer';

// Auto-pickup — shared by every platform's feature component
export { useAutoPickup, planPickup } from './pickup';
export type { PickupTurn, PickupPlan } from './pickup';

// ─── New Architecture: Soul + Skill + MCP ────────────────────────────────────

// MCP Layer
export {
  mcpRegistry,
  CORE_MCP,
  BUILTIN_MCP,
  WORKSPACE_MCP,
  DOCUMENT_MCP,
  generateToolSchemaPrompt,
} from './mcp';
export type { MCPServer, ToolSchema, ToolDefinition } from './mcp';

// Skills Layer — scoped to one agent; see skills/index.ts
export {
  getAllSkills,
  getSkillsForAgent,
  getEnabledSkillsForAgent,
  getSkillById,
  BUILTIN_SKILLS,
} from './skills';
export type { Skill } from './skills';

// Agent Config Store
export { useAgentConfigStore } from './agent-config-store';
export type { AgentConfigStoreState } from './agent-config-store';

// MCP Setup
export {
  initMCPRegistry,
  syncMCPEnabledState,
  isServerEnabled,
  setServerEnabled,
  isWorkspaceEnabled,
  setWorkspaceEnabled,
  isDocumentsEnabled,
  setDocumentsEnabled,
} from './mcp/setup';
