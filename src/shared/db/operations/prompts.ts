import { runQuery, runCommand } from '../index';
import { updateWithTimestamp } from './helpers';
import type { Prompt } from '../../types/db';

export const promptRepo = {
  create: async (
    p: Partial<Prompt> & Pick<Prompt, 'id' | 'title'>
  ): Promise<void> => {
    await runCommand(
      `INSERT INTO prompts (id, title, content, type, icon, folder_id, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.title,
        p.content || null,
        p.type || 'normal',
        p.icon || null,
        p.folder_id || null,
        p.order_index || 0,
        p.created_at || Math.floor(Date.now() / 1000),
        p.updated_at || Math.floor(Date.now() / 1000),
      ]
    );
  },

  save: async (
    p: Partial<Prompt> & Pick<Prompt, 'id'>
  ): Promise<void> => {
    await runCommand(
      `
      INSERT INTO prompts (id, title, content, type, icon, folder_id, order_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = COALESCE(excluded.title, prompts.title),
        content = COALESCE(excluded.content, prompts.content),
        type = COALESCE(excluded.type, prompts.type),
        icon = COALESCE(excluded.icon, prompts.icon),
        folder_id = COALESCE(excluded.folder_id, prompts.folder_id),
        order_index = COALESCE(excluded.order_index, prompts.order_index),
        updated_at = excluded.updated_at
    `,
      [
        p.id,
        p.title || null,
        p.content || null,
        p.type || 'normal',
        p.icon || null,
        p.folder_id || null,
        p.order_index || 0,
        p.created_at || Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000),
      ]
    );
  },

  getById: async (id: string): Promise<Prompt | undefined> => {
    const result = await runQuery('SELECT * FROM prompts WHERE id = ?', [id]);
    return result[0] as Prompt | undefined;
  },

  getByFolderId: async (folderId: string | null): Promise<Prompt[]> => {
    if (folderId === null) {
      return (await runQuery(
        'SELECT * FROM prompts WHERE folder_id IS NULL ORDER BY updated_at DESC'
      )) as Prompt[];
    } else {
      return (await runQuery(
        'SELECT * FROM prompts WHERE folder_id = ? ORDER BY updated_at DESC',
        [folderId]
      )) as Prompt[];
    }
  },

  getAll: async (): Promise<Prompt[]> => {
    return (await runQuery(
      'SELECT * FROM prompts ORDER BY updated_at DESC'
    )) as Prompt[];
  },

  update: async (
    id: string,
    updates: Partial<Pick<Prompt, 'title' | 'content' | 'type' | 'icon' | 'folder_id' | 'order_index'>>
  ): Promise<void> => {
    await updateWithTimestamp('prompts', id, updates);
  },

  delete: async (id: string): Promise<void> => {
    await runCommand('DELETE FROM prompts WHERE id = ?', [id]);
  },

  deleteMultiple: async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(`DELETE FROM prompts WHERE id IN (${placeholders})`, ids);
  },

  move: async (id: string, folderId: string | null): Promise<void> => {
    await runCommand(
      'UPDATE prompts SET folder_id = ?, updated_at = unixepoch() WHERE id = ?',
      [folderId, id]
    );
  },

  moveMultiple: async (
    ids: string[],
    folderId: string | null
  ): Promise<void> => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await runCommand(
      `UPDATE prompts SET folder_id = ?, updated_at = unixepoch() WHERE id IN (${placeholders})`,
      [folderId, ...ids]
    );
  },
};
