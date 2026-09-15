import { runQuery, runCommand, runBatch } from '../index';
import type { Conversation } from '../../types/db';

/**
 * What every browse surface has to exclude.
 *
 * Temporary chats are filtered here rather than in the sidebar's own filter code
 * so the rule cannot be forgotten by a new consumer — the tree, the timeline,
 * favourites, export and stats all read through these queries. `getById` is
 * deliberately *not* filtered: features that act on the conversation the user is
 * currently looking at still need to resolve it while they sit inside one.
 */
const VISIBLE = 'deleted_at IS NULL AND is_temporary = 0';

export const conversationRepo = {
  save: async (
    c: Partial<Conversation> & Pick<Conversation, 'id'>
  ): Promise<void> => {
    const platform = c.platform ?? 'aistudio';
    const updatedAt = c.updated_at ?? Math.floor(Date.now() / 1000);
    await runCommand(
      `
      INSERT INTO conversations (id, title, description, folder_id, external_id, external_url, model_name, type, platform, updated_at, created_at, last_active_at, prompt_metadata, deleted_at, gem_id, notebook_id, is_temporary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = COALESCE(excluded.description, conversations.description),
        folder_id = COALESCE(excluded.folder_id, conversations.folder_id),
        external_url = excluded.external_url,
        model_name = excluded.model_name,
        type = COALESCE(excluded.type, conversations.type),
        platform = COALESCE(excluded.platform, conversations.platform),
        updated_at = excluded.updated_at,
        created_at = COALESCE(excluded.created_at, conversations.created_at),
        last_active_at = COALESCE(excluded.last_active_at, conversations.last_active_at),
        prompt_metadata = COALESCE(excluded.prompt_metadata, conversations.prompt_metadata),
        gem_id = COALESCE(excluded.gem_id, conversations.gem_id),
        notebook_id = COALESCE(excluded.notebook_id, conversations.notebook_id),
        -- Sticky, not overwritten: only the create interceptor knows a chat is
        -- temporary, and it only knows it once. Every later write to this row
        -- (AI Studio's full-data save, a library scan) passes 0 simply because it
        -- has no opinion, and COALESCE would let those un-hide the conversation.
        is_temporary = MAX(conversations.is_temporary, excluded.is_temporary),
        deleted_at = NULL
    `,
      [
        c.id,
        c.title,
        c.description || null,
        c.folder_id,
        c.external_id,
        c.external_url,
        c.model_name,
        c.type || 'conversation',
        platform,
        updatedAt,
        c.created_at || null,
        c.last_active_at || Math.floor(Date.now() / 1000),
        c.prompt_metadata ? JSON.stringify(c.prompt_metadata) : null,
        c.gem_id ?? null,
        c.notebook_id ?? null,
        c.is_temporary ? 1 : 0,
      ]
    );
  },

  getById: async (id: string): Promise<Conversation | undefined> => {
    const result = await runQuery('SELECT * FROM conversations WHERE id = ? AND deleted_at IS NULL', [
      id,
    ]);
    const row = result[0];
    if (!row) return undefined;
    return row as Conversation;
  },

  getByFolderId: async (folderId: string | null): Promise<Conversation[]> => {
    if (folderId === null) {
      return (await runQuery(
        `SELECT * FROM conversations WHERE folder_id IS NULL AND ${VISIBLE} ORDER BY last_active_at DESC`
      )) as Conversation[];
    } else {
      return (await runQuery(
        `SELECT * FROM conversations WHERE folder_id = ? AND ${VISIBLE} ORDER BY last_active_at DESC`,
        [folderId]
      )) as Conversation[];
    }
  },

  getAll: async (platform?: string): Promise<Conversation[]> => {
    if (platform) {
      return (await runQuery(
        `SELECT * FROM conversations WHERE platform = ? AND ${VISIBLE} ORDER BY last_active_at DESC`,
        [platform]
      )) as Conversation[];
    }
    return (await runQuery(
      `SELECT * FROM conversations WHERE ${VISIBLE} ORDER BY last_active_at DESC`
    )) as Conversation[];
  },

  update: async (
    id: string,
    updates: Partial<
      Pick<
        Conversation,
        | 'title'
        | 'description'
        | 'folder_id'
        | 'external_url'
        | 'model_name'
        | 'last_active_at'
        | 'prompt_metadata'
        | 'platform'
      >
    >
  ): Promise<void> => {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const values = fields.map((field) => {
      const val = (updates as any)[field];
      if (field === 'prompt_metadata') {
        if (val === null) return null;
        return JSON.stringify(val);
      }
      return val;
    });

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    await runCommand(
      `UPDATE conversations SET ${setClause}, updated_at = unixepoch() WHERE id = ?`,
      [...values, id],
    );
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('UPDATE conversations SET deleted_at = unixepoch() WHERE id = ?', [id]);
  },

  move: async (id: string, folderId: string | null): Promise<void> => {
    await runCommand('UPDATE conversations SET folder_id = ?, updated_at = unixepoch() WHERE id = ?', [
      folderId,
      id,
    ]);
  },

  moveMultiple: async (
    ids: string[],
    folderId: string | null
  ): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(
      `UPDATE conversations SET folder_id = ?, updated_at = unixepoch() WHERE id IN (${placeholders})`,
      [folderId, ...ids]
    );
  },

  bulkSave: async (
    conversations: (Partial<Conversation> & Pick<Conversation, 'id'>)[]
  ): Promise<void> => {
    if (conversations.length === 0) return;

    const operations = conversations.map((c) => {
      const platform = c.platform ?? 'aistudio';
      const updatedAt = c.updated_at ?? Math.floor(Date.now() / 1000);
      return {
        sql: `
      INSERT INTO conversations (id, title, description, folder_id, external_id, external_url, model_name, type, platform, updated_at, created_at, last_active_at, prompt_metadata, deleted_at, gem_id, notebook_id, is_temporary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = COALESCE(excluded.description, conversations.description),
        folder_id = COALESCE(excluded.folder_id, conversations.folder_id),
        external_url = excluded.external_url,
        model_name = excluded.model_name,
        type = COALESCE(excluded.type, conversations.type),
        platform = COALESCE(excluded.platform, conversations.platform),
        updated_at = CASE
          WHEN conversations.title IS NOT excluded.title THEN unixepoch()
          ELSE conversations.updated_at
        END,
        created_at = COALESCE(excluded.created_at, conversations.created_at),
        last_active_at = CASE
          WHEN conversations.title IS NOT excluded.title THEN unixepoch()
          ELSE COALESCE(excluded.last_active_at, conversations.last_active_at)
        END,
        prompt_metadata = COALESCE(excluded.prompt_metadata, conversations.prompt_metadata),
        gem_id = COALESCE(excluded.gem_id, conversations.gem_id),
        notebook_id = COALESCE(excluded.notebook_id, conversations.notebook_id),
        -- Sticky — see conversationRepo.save. This path is the library scan, the
        -- one most likely to re-save a temporary chat with no knowledge of it
        -- (AI Studio lists them like any other prompt).
        is_temporary = MAX(conversations.is_temporary, excluded.is_temporary),
        deleted_at = NULL
    `,
        bind: [
          c.id,
          c.title,
          c.description || null,
          c.folder_id,
          c.external_id,
          c.external_url,
          c.model_name,
          c.type || 'conversation',
          platform,
          updatedAt,
          c.created_at || null,
          c.last_active_at || Math.floor(Date.now() / 1000),
          c.prompt_metadata ? JSON.stringify(c.prompt_metadata) : null,
          c.gem_id ?? null,
          c.notebook_id ?? null,
          c.is_temporary ? 1 : 0,
        ],
      };
    });

    await runBatch(operations);
  },

  /**
   * Intentionally includes temporary chats: this is "what do we already know
   * about", used by the library scan to skip rows it has seen. Hiding them here
   * would make AI Studio's scan treat every temporary chat as a new prompt and
   * re-import it on every run.
   */
  getAllIds: async (): Promise<string[]> => {
    const result = await runQuery('SELECT id FROM conversations WHERE deleted_at IS NULL');
    return result.map((r: any) => r.id);
  },

  deleteMultiple: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(
      `UPDATE conversations SET deleted_at = unixepoch() WHERE id IN (${placeholders})`,
      ids
    );
  },

  /**
   * Conversations whose transcript we do not have, or no longer have in full.
   *
   * Two ways in:
   *
   *  - No messages at all. The normal capture path is an interception, so a
   *    conversation only gets a transcript once the user opens it — everything
   *    the library scan listed but nobody visited lands here.
   *  - `last_active_at` newer than the newest message we hold, by more than
   *    `staleSlackSec`. That is a chat continued somewhere this browser could not
   *    see it. The slack absorbs the 0–5s drift observed between the list
   *    endpoint's timestamp and the message timestamps; without it every
   *    conversation would look stale.
   *
   * Notebook chats are excluded: they are served by a different endpoint than the
   * one the backfill knows how to call.
   *
   * `excludeIds` is how the caller applies its own cooldown record. It is done in
   * SQL rather than by filtering the result, so a handful of permanently
   * unproductive conversations cannot sit at the head of the list and starve
   * everything behind them.
   *
   * Written with correlated subqueries rather than the more obvious
   * `LEFT JOIN messages … GROUP BY c.id … HAVING COUNT(*) = 0`. The scheduler asks
   * this question every half minute, and the join form has to visit every message
   * row in the profile to answer it, where `NOT EXISTS` stops at the first one and
   * rides the `(conversation_id, id)` primary key. On a library that is already
   * filled in — the steady state, and the one that runs forever — almost every
   * conversation is rejected by that single index probe, and the two remaining
   * subqueries only run for the handful of rows that survive.
   */
  getBackfillCandidates: async (
    platform: string,
    options: { limit?: number; staleSlackSec?: number; excludeIds?: string[] } = {},
  ): Promise<{ id: string; last_active_at: number | null; message_count: number }[]> => {
    const { limit = 10, staleSlackSec = 900, excludeIds = [] } = options;

    const exclusion =
      excludeIds.length > 0
        ? `AND c.id NOT IN (${excludeIds.map(() => '?').join(',')})`
        : '';

    return (await runQuery(
      `SELECT c.id,
              c.last_active_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c
       WHERE c.platform = ?
         AND ${VISIBLE}
         AND c.notebook_id IS NULL
         ${exclusion}
         AND (
           NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
           OR c.last_active_at >
              (SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = c.id) + ?
         )
       ORDER BY (message_count = 0) DESC, c.last_active_at DESC
       LIMIT ?`,
      [platform, ...excludeIds, staleSlackSec, limit],
    )) as { id: string; last_active_at: number | null; message_count: number }[];
  },

  getDeletedIds: async (platform?: string): Promise<string[]> => {
    if (platform) {
      const result = await runQuery(
        'SELECT id FROM conversations WHERE platform = ? AND deleted_at IS NOT NULL',
        [platform]
      );
      return result.map((r: any) => r.id);
    }
    const result = await runQuery('SELECT id FROM conversations WHERE deleted_at IS NOT NULL');
    return result.map((r: any) => r.id);
  },
};
