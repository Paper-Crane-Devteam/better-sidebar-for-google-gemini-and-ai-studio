export const SCHEMA = `
CREATE TABLE IF NOT EXISTS prompt_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  order_index INTEGER DEFAULT 0,
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
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
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
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'model'
  content TEXT,
  message_type TEXT DEFAULT 'text', -- 'text' or 'thought'
  order_index INTEGER DEFAULT 0,
  timestamp INTEGER DEFAULT (unixepoch()),
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
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
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

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(id, content) VALUES(new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  UPDATE messages_fts SET content = new.content WHERE id = new.id;
END;

-- Populate FTS table if empty but messages exist (simple migration)
INSERT INTO messages_fts(id, content) 
SELECT id, content FROM messages 
WHERE (SELECT COUNT(*) FROM messages_fts) = 0;

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
`;
