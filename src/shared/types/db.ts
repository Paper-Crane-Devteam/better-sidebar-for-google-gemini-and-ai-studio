export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  platform: string;
  color: string | null;
  order_index: number;
  is_pinned: number;
  created_at: number;
  updated_at: number;
}

export interface Conversation {
  id: string;
  title: string | null;
  description: string | null;
  folder_id: string | null;
  external_id: string | null;
  external_url: string | null;
  model_name: string | null;
  type: string;
  platform: string; // 'aistudio' | 'gemini' | 'chatgpt' | 'claude'
  order_index: number;
  updated_at: number;
  // NULL when the platform's list API never exposed a real creation time.
  // Only populated on paths that observe creation directly (create/generate
  // interceptors). Consumers must fall back to last_active_at.
  created_at: number | null;
  last_active_at: number; // business timestamp: last chat activity, rename, etc.
  prompt_metadata: any;
  deleted_at: number | null; // Unix timestamp in seconds, NULL = active (not deleted)
  gem_id: string | null;
  notebook_id: string | null;
  /**
   * 1 for a temporary chat. Stored so follow-up messages have a row to attach
   * to, but excluded from every list and from search — a temporary chat is never
   * meant to surface in the sidebar.
   */
  is_temporary: number;
}

export interface Gem {
  id: string;
  name: string;
  external_id: string | null;
  external_url: string | null;
  icon_url: string | null;
  description: string | null;
  platform: string;
  order_index: number;
  is_pinned: number;
  is_deleted: number;
  default_folder_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Notebook {
  id: string;
  name: string;
  external_id: string | null;
  external_url: string | null;
  icon_url: string | null;
  description: string | null;
  platform: string;
  order_index: number;
  is_pinned: number;
  is_deleted: number;
  default_folder_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'model';
  content: string | null;
  message_type: 'text' | 'thought';
  order_index: number;
  timestamp: number;
}

export interface Favorite {
  id: string;
  target_id: string;
  target_type: 'conversation' | 'message' | 'prompt' | 'snippet';
  note: string | null;
  created_at: number;
}

export interface PromptFolder {
  id: string;
  name: string;
  parent_id: string | null;
  order_index: number;
  is_pinned: number;
  created_at: number;
  updated_at: number;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  type: 'normal' | 'system';
  icon?: string;
  folder_id: string | null;
  order_index: number;
  created_at: number;
  updated_at: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  created_at: number;
}

export interface ConversationTag {
  conversation_id: string;
  tag_id: string;
  created_at: number;
}

export interface SnippetFolder {
  id: string;
  name: string;
  parent_id: string | null;
  order_index: number;
  is_pinned: number;
  created_at: number;
  updated_at: number;
}

export interface Snippet {
  id: string;
  title: string;
  content: string | null;
  source_url: string | null;
  source_platform: string | null;
  folder_id: string | null;
  order_index: number;
  is_pinned: number;
  created_at: number;
  updated_at: number;
}

/**
 * One agent task, from the first prompt to whatever ended it.
 *
 * Exists so a reload can say what was running rather than starting over with a blank
 * "Follow-up task" — the runtime store holds all of this and loses it on refresh.
 */
export interface AgentSessionRow {
  id: string;
  /** Null until the platform assigns one, for a session started in a fresh chat */
  conversation_id: string | null;
  title: string | null;
  skill_id: string | null;
  status: 'running' | 'ended';
  /** Mirrors `AgentEndReason`; null while still running */
  end_reason: string | null;
  rounds: number;
  started_at: number;
  ended_at: number | null;
}

/**
 * What became of one tool call.
 *
 * `join_key` is `buildToolCallKey(call)` — the same digest written into the result
 * section sent back to the AI, which is what lets a card in the chat find this row
 * without any positional guessing.
 *
 * `status` is written twice: `running` before the tool is invoked, then the verdict
 * after. A row still at `running` means the page went away mid-execution, so the
 * write may or may not have landed — the one state that has to be reported as
 * uncertain rather than resolved either way.
 */
export interface AgentToolCallRow {
  id: string;
  session_id: string | null;
  conversation_id: string | null;
  join_key: string;
  round: number;
  order_index: number;
  tool_name: string | null;
  description: string | null;
  /** JSON of the call's params, for showing what ran and for a future replay */
  params: string | null;
  is_write: number;
  status: 'running' | 'ok' | 'failed' | 'rejected';
  /**
   * The result as the AI would have read it — kept only while undelivered.
   *
   * Cleared once delivery is confirmed, because from that point the conversation
   * carries it and a second copy is dead weight. While it is here, it is the only
   * copy in existence: the payload was staged in the composer and the composer is
   * gone.
   */
  result_body: string | null;
  /** 1 once the round's results were confirmed to reach the AI */
  delivered: number;
  created_at: number;
  updated_at: number;
}
