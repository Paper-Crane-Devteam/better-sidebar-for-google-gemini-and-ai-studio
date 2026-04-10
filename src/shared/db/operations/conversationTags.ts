import { runQuery, runCommand } from '../index';
import type { ConversationTag, Tag, Conversation } from '../../types/db';

export const conversationTagRepo = {
  addTag: async (conversationId: string, tagId: string): Promise<void> => {
    await runCommand(
      'INSERT OR IGNORE INTO conversation_tags (conversation_id, tag_id, created_at) VALUES (?, ?, unixepoch())',
      [conversationId, tagId]
    );
  },

  removeTag: async (conversationId: string, tagId: string): Promise<void> => {
    await runCommand(
      'DELETE FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?',
      [conversationId, tagId]
    );
  },

  getAll: async (): Promise<ConversationTag[]> => {
    return (await runQuery(
      'SELECT * FROM conversation_tags'
    )) as ConversationTag[];
  },

  getTagsByConversationId: async (conversationId: string): Promise<Tag[]> => {
    return (await runQuery(
      `SELECT t.* 
       FROM tags t
       INNER JOIN conversation_tags ct ON t.id = ct.tag_id
       WHERE ct.conversation_id = ?
       ORDER BY t.name ASC`,
      [conversationId]
    )) as Tag[];
  },

  getConversationsByTagId: async (tagId: string): Promise<Conversation[]> => {
    return (await runQuery(
      `SELECT c.* 
       FROM conversations c
       INNER JOIN conversation_tags ct ON c.id = ct.conversation_id
       WHERE ct.tag_id = ?
       ORDER BY c.last_active_at DESC`,
      [tagId]
    )) as Conversation[];
  },
};
