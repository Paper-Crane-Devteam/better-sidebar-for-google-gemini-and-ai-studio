import { runQuery, runCommand, runBatch } from '../index';
import type { Message } from '../../types/db';

export const messageRepo = {
  create: async (
    message: Omit<Message, 'id' | 'timestamp' | 'order_index'>,
  ): Promise<void> => {
    await runCommand(
      `INSERT INTO messages (id, conversation_id, role, content, message_type, timestamp, order_index) 
       VALUES (hex(randomblob(16)), ?, ?, ?, ?, unixepoch(), 
       (SELECT COALESCE(MAX(order_index), -1) + 1 FROM messages WHERE conversation_id = ?))`,
      [
        message.conversation_id,
        message.role,
        message.content,
        message.message_type || 'text',
        message.conversation_id,
      ],
    );
  },

  bulkInsert: async (
    conversationId: string,
    messages: (Omit<
      Message,
      'id' | 'timestamp' | 'conversation_id' | 'order_index'
    > & { id?: string; created_at?: number | null })[],
  ): Promise<void> => {
    if (messages.length === 0) return;

    // Get current max order_index to ensure continuity
    const result = await runQuery(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM messages WHERE conversation_id = ?',
      [conversationId],
    );
    let currentOrder = (result[0]?.max_order ?? -1) + 1;

    // Honor caller-provided ids (e.g. Gemini r_xxx / rc_xxx from the interceptor)
    // so downstream features like SmartScrollbar can match DB rows to DOM
    // elements without generating duplicate entries. Fall back to a random
    // hex id when the caller doesn't supply one.
    const operations = messages.map((msg) => {
      const hasId = typeof msg.id === 'string' && msg.id.length > 0;
      const hasTs = msg.created_at != null;
      return {
        sql: `INSERT INTO messages (id, conversation_id, role, content, message_type, timestamp, order_index)
              VALUES (${hasId ? '?' : 'hex(randomblob(16))'}, ?, ?, ?, ?, ${hasTs ? '?' : 'unixepoch()'}, ?)`,
        bind: [
          ...(hasId ? [msg.id] : []),
          conversationId,
          msg.role,
          msg.content,
          msg.message_type || 'text',
          ...(hasTs ? [msg.created_at] : []),
          currentOrder++,
        ],
      };
    });

    await runBatch(operations);
  },

  getByConversationId: async (conversationId: string): Promise<Message[]> => {
    return (await runQuery(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY order_index ASC',
      [conversationId],
    )) as Message[];
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('DELETE FROM messages WHERE id = ?', [id]);
  },

  deleteByConversationId: async (conversationId: string): Promise<void> => {
    await runCommand('DELETE FROM messages WHERE conversation_id = ?', [
      conversationId,
    ]);
  },

  replace: async (
    conversationId: string,
    messages: Omit<
      Message,
      'id' | 'timestamp' | 'conversation_id' | 'order_index'
    >[],
  ): Promise<void> => {
    const operations: { sql: string; bind: any[] }[] = [];

    // Delete existing
    operations.push({
      sql: 'DELETE FROM messages WHERE conversation_id = ?',
      bind: [conversationId],
    });

    if (messages.length > 0) {
      let currentOrder = 0;
      messages.forEach((msg) => {
        operations.push({
          sql: 'INSERT INTO messages (id, conversation_id, role, content, message_type, timestamp, order_index) VALUES (hex(randomblob(16)), ?, ?, ?, ?, unixepoch(), ?)',
          bind: [
            conversationId,
            msg.role,
            msg.content,
            msg.message_type || 'text',
            currentOrder++,
          ],
        });
      });
    }

    await runBatch(operations);
  },

  upsert: async (
    conversationId: string,
    messages: (Omit<
      Message,
      'id' | 'timestamp' | 'conversation_id' | 'order_index'
    > & { id: string; created_at?: number | null })[],
  ): Promise<void> => {
    if (messages.length === 0) return;

    // 1. Check which messages already exist
    const incomingIds = messages.map((m) => m.id);
    const existingRows = await runQuery(
      `SELECT id FROM messages WHERE id IN (${incomingIds.map(() => '?').join(',')})`,
      incomingIds,
    );
    const existingIds = new Set(existingRows.map((r: any) => r.id));

    const newMessages = messages.filter((m) => !existingIds.has(m.id));
    const updateMessages = messages.filter((m) => existingIds.has(m.id));

    const operations: { sql: string; bind: any[] }[] = [];

    // 2. Prepare Updates
    if (updateMessages.length > 0) {
      updateMessages.forEach((msg) => {
        operations.push({
          sql: `UPDATE messages SET 
                  content = ?, 
                  role = ?, 
                  message_type = ?, 
                  timestamp = CASE WHEN ? IS NOT NULL THEN ? ELSE timestamp END
                WHERE id = ?`,
          bind: [
            msg.content,
            msg.role,
            msg.message_type || 'text',
            msg.created_at,
            msg.created_at,
            msg.id,
          ],
        });
      });
    }

    // 3. Prepare Inserts
    if (newMessages.length > 0) {
      // Sort new messages by timestamp (asc).
      // Treat missing timestamps as Infinity so they go to the end
      newMessages.sort(
        (a, b) => (a.created_at ?? Infinity) - (b.created_at ?? Infinity),
      );

      // Get DB stats to determine insertion point
      const stats = await runQuery(
        `SELECT MIN(timestamp) as min_ts, MIN(order_index) as min_idx, MAX(order_index) as max_idx 
         FROM messages WHERE conversation_id = ?`,
        [conversationId],
      );

      const dbMinTs = stats[0]?.min_ts;
      const dbMinIdx = stats[0]?.min_idx ?? 0;
      const dbMaxIdx = stats[0]?.max_idx ?? -1;

      const firstNewTs = newMessages[0].created_at;

      let startIdx = 0;

      // If DB has messages, and our new batch starts strictly BEFORE the earliest DB message
      if (dbMinTs !== null && firstNewTs && firstNewTs < dbMinTs) {
        startIdx = dbMinIdx - newMessages.length;
      } else {
        startIdx = dbMaxIdx + 1;
      }

      newMessages.forEach((msg, i) => {
        operations.push({
          sql: `INSERT INTO messages (id, conversation_id, role, content, message_type, timestamp, order_index) 
                VALUES (?, ?, ?, ?, ?, COALESCE(?, unixepoch()), ?)`,
          bind: [
            msg.id,
            conversationId,
            msg.role,
            msg.content,
            msg.message_type || 'text',
            msg.created_at,
            startIdx + i,
          ],
        });
      });
    }

    if (operations.length > 0) {
      await runBatch(operations);
    }
  },

  search: async (
    query: string,
    options: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      includeFolderNames?: string[];
      excludeFolderNames?: string[];
      roleFilter?: 'all' | 'user' | 'model';
      platforms?: string[];
      conversationId?: string;
    } = {},
  ): Promise<any[]> => {
    const params: any[] = [];
    const cteParts: string[] = [];

    // Build CTEs for recursive folder resolution
    if (options.includeFolderNames && options.includeFolderNames.length > 0) {
      const clauses = options.includeFolderNames
        .map(() => 'lower(name) LIKE ?')
        .join(' OR ');
      cteParts.push(`
            included_folders AS (
                SELECT id FROM folders WHERE ${clauses}
                UNION ALL
                SELECT f.id FROM folders f
                JOIN included_folders tf ON f.parent_id = tf.id
            )
        `);
      params.push(
        ...options.includeFolderNames.map((n) => `%${n.toLowerCase()}%`),
      );
    }

    if (options.excludeFolderNames && options.excludeFolderNames.length > 0) {
      const clauses = options.excludeFolderNames
        .map(() => 'lower(name) LIKE ?')
        .join(' OR ');
      cteParts.push(`
            excluded_folders AS (
                SELECT id FROM folders WHERE ${clauses}
                UNION ALL
                SELECT f.id FROM folders f
                JOIN excluded_folders tf ON f.parent_id = tf.id
            )
        `);
      params.push(
        ...options.excludeFolderNames.map((n) => `%${n.toLowerCase()}%`),
      );
    }

    let sql = '';
    if (cteParts.length > 0) {
      sql += `WITH RECURSIVE ${cteParts.join(', ')} `;
    }

    // Check query length. Trigram tokenizer requires at least 3 characters.
    // If query is shorter, fall back to standard LIKE.
    const useFts = query.length >= 3;

    if (useFts) {
      // Use FTS5 table
      // Prepare match query
      let matchQuery = query;
      // We always treat it as a phrase match in FTS to reduce noise before filtering
      matchQuery = `"${query.replace(/"/g, '""')}"`;

      console.log('[DB] FTS Search:', matchQuery);

      sql += `
        SELECT m.*, c.title as conversation_title, c.folder_id, f.name as folder_name, c.external_url, c.platform
        FROM messages_fts fts
        JOIN messages m ON fts.id = m.id
        JOIN conversations c ON m.conversation_id = c.id
        LEFT JOIN folders f ON c.folder_id = f.id
        WHERE messages_fts MATCH ?
        AND m.message_type != 'thought'
        AND c.deleted_at IS NULL
      `;
      params.push(matchQuery);
    } else {
      console.log('[DB] Short query, fallback to LIKE:', query);

      sql += `
        SELECT m.*, c.title as conversation_title, c.folder_id, f.name as folder_name, c.external_url, c.platform
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        LEFT JOIN folders f ON c.folder_id = f.id
        WHERE m.content LIKE ?
        AND m.message_type != 'thought'
        AND c.deleted_at IS NULL
      `;
      params.push(`%${query}%`);
    }

    // CTE-based filtering
    if (options.includeFolderNames && options.includeFolderNames.length > 0) {
      sql += ` AND c.folder_id IN (SELECT id FROM included_folders)`;
    }

    if (options.excludeFolderNames && options.excludeFolderNames.length > 0) {
      sql += ` AND (c.folder_id IS NULL OR c.folder_id NOT IN (SELECT id FROM excluded_folders))`;
    }

    if (options.roleFilter && options.roleFilter !== 'all') {
      sql += ` AND m.role = ?`;
      params.push(options.roleFilter);
    }

    if (options.platforms && options.platforms.length > 0) {
      const placeholders = options.platforms.map(() => '?').join(', ');
      sql += ` AND c.platform IN (${placeholders})`;
      params.push(...options.platforms);
    }

    if (options.conversationId) {
      sql += ` AND m.conversation_id = ?`;
      params.push(options.conversationId);
    }

    // Fetch more results when post-filtering will reduce the set
    const needsPostFilter = options.wholeWord || options.caseSensitive;
    const limit = needsPostFilter ? 1000 : 500;
    sql += ` ORDER BY m.timestamp DESC LIMIT ${limit}`;

    try {
      let results = await runQuery(sql, params);

      // Post-filter in memory for wholeWord and/or caseSensitive
      if (needsPostFilter && query.trim().length > 0) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flags = options.caseSensitive ? '' : 'i';
        const pattern = options.wholeWord
          ? `\\b${escapedQuery}\\b`
          : escapedQuery;
        const regex = new RegExp(pattern, flags);

        results = results.filter((row: any) => {
          return row.content && regex.test(row.content);
        });
      }

      return results;
    } catch (e) {
      console.error(
        'FTS Search failed, falling back to legacy search (or table missing)',
        e,
      );
      throw e;
    }
  },

  getScrollIndex: async (
    messageId: string,
    conversationId: string,
  ): Promise<number> => {
    const result = await runQuery(
      `SELECT COUNT(*) as scroll_index
       FROM messages m
       WHERE m.conversation_id = ?
         AND m.role = 'model'
         AND m.message_type != 'thought'
         AND m.order_index < (SELECT order_index FROM messages WHERE id = ?)`,
      [conversationId, messageId],
    );
    return result[0]?.scroll_index ?? 0;
  },

  /**
   * Get the adjacent message based on role:
   * - If current message is 'user', find the next 'model' message
   * - If current message is 'model', find the previous 'user' message
   */
  getAdjacentMessage: async (
    messageId: string,
    conversationId: string,
    currentRole: 'user' | 'model',
  ): Promise<Message | null> => {
    if (currentRole === 'user') {
      // Find the next model message (order_index > current)
      const result = await runQuery(
        `SELECT m.* FROM messages m
         WHERE m.conversation_id = ?
           AND m.role = 'model'
           AND m.message_type != 'thought'
           AND m.order_index > (SELECT order_index FROM messages WHERE id = ?)
         ORDER BY m.order_index ASC
         LIMIT 1`,
        [conversationId, messageId],
      );
      return result[0] || null;
    } else {
      // Find the previous user message (order_index < current)
      const result = await runQuery(
        `SELECT m.* FROM messages m
         WHERE m.conversation_id = ?
           AND m.role = 'user'
           AND m.message_type != 'thought'
           AND m.order_index < (SELECT order_index FROM messages WHERE id = ?)
         ORDER BY m.order_index DESC
         LIMIT 1`,
        [conversationId, messageId],
      );
      return result[0] || null;
    }
  },
};
