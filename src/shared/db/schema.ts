/**
 * FTS bookkeeping for `messages`, kept separate from SCHEMA so the migration that
 * rebuilds the table can reinstate the exact same triggers instead of a copy that
 * drifts.
 *
 * ── Why the guards ──────────────────────────────────────────────────────────
 * `messages.id` is the platform's own id, and it is only unique *within* a
 * conversation: Gemini's branch feature copies a conversation and reuses the
 * response ids verbatim, so the same `rc_xxx` legitimately exists in two rows.
 * The FTS table is keyed on that id alone, which leaves two ways to corrupt it:
 *
 *  - INSERT would add a second row with the same key, so one hit becomes N and
 *    search returns the same text repeatedly.
 *  - DELETE would drop the key while other copies still reference it, making
 *    those copies unsearchable.
 *
 * Both are avoided by treating the FTS row as shared: written when the first copy
 * appears, removed when the last one goes. That works because copies carry
 * identical text — they *are* the same response. The tradeoff is that if two
 * same-id rows ever diverge, only the first-indexed text is searchable; a stale
 * excerpt is an acceptable price for not rebuilding a trigram index over every
 * message on upgrade.
 *
 * The `idx_messages_id` index is what makes the guards cheap. Without it each
 * insert would scan the table, turning a bulk capture into O(n²).
 * 
 * IMPORTANT: no backtip in sql comment or it will break the sql grammer
 */
export const MESSAGES_FTS_OBJECTS = `
CREATE INDEX IF NOT EXISTS idx_messages_id ON messages(id);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, content)
  SELECT new.id, new.content
  WHERE (SELECT COUNT(*) FROM messages WHERE id = new.id) = 1;
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts
  WHERE id = old.id
    AND NOT EXISTS (SELECT 1 FROM messages WHERE id = old.id);
END;

-- The WHEN clause is a real optimisation, not a nicety: messages_fts.id is
-- UNINDEXED, so this statement scans the index table. Every conversation capture
-- re-UPDATEs rows it already stored, and without the guard each of those no-op
-- updates paid for a full scan.
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages
WHEN new.content IS NOT old.content BEGIN
  UPDATE messages_fts SET content = new.content WHERE id = new.id;
END;
`;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS prompt_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  order_index INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(parent_id) REFERENCES prompt_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'normal', -- 'normal' | 'system'
  icon TEXT,
  folder_id TEXT,
  order_index INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(folder_id) REFERENCES prompt_folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompt_folders_parent ON prompt_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_prompts_folder ON prompts(folder_id);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  platform TEXT DEFAULT 'aistudio', -- 'aistudio' | 'gemini' | 'chatgpt' | 'claude'
  color TEXT, -- hex color for folder icon, e.g. '#4F46E5'
  order_index INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT DEFAULT '',
  folder_id TEXT,
  external_id TEXT UNIQUE,
  external_url TEXT,
  model_name TEXT,
  type TEXT DEFAULT 'conversation',
  platform TEXT DEFAULT 'aistudio', -- 'aistudio' | 'gemini' | 'chatgpt' | 'claude'
  order_index INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch()),
  created_at INTEGER DEFAULT (unixepoch()),
  last_active_at INTEGER DEFAULT (unixepoch()), -- business timestamp: last chat activity, rename, etc.
  prompt_metadata TEXT,
  deleted_at INTEGER DEFAULT NULL, -- soft delete: unix timestamp in seconds, NULL = active
  gem_id TEXT,
  notebook_id TEXT,
  -- 1 = temporary chat. Recorded but never listed or searched.
  --
  -- The row exists rather than being skipped because the messages table has a
  -- foreign key into this one with enforcement on: refusing to store the
  -- conversation would make every follow-up turn's message insert fail. Marking
  -- and filtering costs one column and keeps every write path unchanged.
  --
  -- Treated as sticky on upsert (see conversationRepo.save): a library scan or a
  -- late full-data save must never be able to un-hide a temporary chat.
  is_temporary INTEGER DEFAULT 0,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- The id column holds the platform's own message id, which is only unique inside
-- one conversation: Gemini's branch feature copies a conversation and reuses the
-- response ids, so the same id legitimately appears in two conversations. A
-- global primary key on id made the second copy unstorable -- and worse, made an
-- upsert of the copy silently UPDATE the original. Hence the composite key.
--
-- Column order is load-bearing: sync import intersects payload columns with the
-- live table, and SELECT * consumers read positionally in a few places.
CREATE TABLE IF NOT EXISTS messages (
  id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'model'
  content TEXT,
  message_type TEXT DEFAULT 'text', -- 'text' or 'thought'
  order_index INTEGER DEFAULT 0,
  timestamp INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (conversation_id, id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'conversation' or 'message'
  note TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(target_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_conversations_folder ON conversations(folder_id);
-- No index on messages(conversation_id): the (conversation_id, id) primary key
-- already indexes that prefix, so a separate one only costs write time.
CREATE INDEX IF NOT EXISTS idx_favorites_target ON favorites(target_id, target_type);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS conversation_tags (
  conversation_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (conversation_id, tag_id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag ON conversation_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation ON conversation_tags(conversation_id);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(id UNINDEXED, content, tokenize='trigram');
${MESSAGES_FTS_OBJECTS}
-- Populate FTS table if empty but messages exist (simple migration).
-- Grouped by id because one FTS row is shared by every copy of a message id;
-- SQLite picks one arbitrary content, which is what the shared-row model wants.
INSERT INTO messages_fts(id, content) 
SELECT id, content FROM messages 
WHERE (SELECT COUNT(*) FROM messages_fts) = 0
GROUP BY id;

CREATE TABLE IF NOT EXISTS gems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  external_id TEXT UNIQUE,
  external_url TEXT,
  icon_url TEXT,
  description TEXT,
  platform TEXT DEFAULT 'gemini',
  order_index INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_gems_platform ON gems(platform);

CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  external_id TEXT UNIQUE,
  external_url TEXT,
  icon_url TEXT,
  description TEXT,
  platform TEXT DEFAULT 'gemini',
  order_index INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notebooks_platform ON notebooks(platform);

CREATE TABLE IF NOT EXISTS snippet_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  order_index INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(parent_id) REFERENCES snippet_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  source_platform TEXT,
  folder_id TEXT,
  order_index INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(folder_id) REFERENCES snippet_folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snippet_folders_parent ON snippet_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_snippets_folder ON snippets(folder_id);
`;
