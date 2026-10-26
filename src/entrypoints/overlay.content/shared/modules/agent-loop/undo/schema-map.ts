/**
 * Which tables exist, and which ones the database will touch on your behalf.
 *
 * Mirrors `src/shared/db/schema.ts`. It is duplicated rather than derived because
 * the undo layer needs the *cascade* relationships, and those are only expressed
 * as `FOREIGN KEY ... ON DELETE CASCADE` inside a SQL string.
 *
 * ⚠️ Keep in sync with schema.ts. A table missing from `KNOWN_TABLES` is refused
 * outright (no undo offered), which is the safe direction. A *missing cascade
 * edge* is the dangerous direction: the undo would restore the table that was
 * named in the SQL while silently losing the rows the database deleted downstream.
 */

/** Every table the agent is allowed to touch. Anything else → no undo. */
export const KNOWN_TABLES: readonly string[] = [
  'prompt_folders',
  'prompts',
  'folders',
  'conversations',
  'messages',
  'favorites',
  'tags',
  'conversation_tags',
  'gems',
  'notebooks',
  'snippet_folders',
  'snippets',
  'collection_folders',
];

/**
 * Direct `ON DELETE CASCADE` children, keyed by parent table.
 *
 * Self-references are listed too (`folders → folders` via `parent_id`): deleting
 * one folder takes its subtree with it, so the whole table has to be captured.
 */
const CASCADE_CHILDREN: Record<string, readonly string[]> = {
  prompt_folders: ['prompt_folders', 'prompts'],
  folders: ['folders', 'conversations'],
  conversations: ['messages', 'conversation_tags'],
  tags: ['conversation_tags'],
  snippet_folders: ['snippet_folders', 'snippets'],
  // Subfolders only: gems/notebooks point at it without a foreign key.
  collection_folders: ['collection_folders'],
};

/**
 * Insert order for a restore: parents before children.
 *
 * Only cosmetic while foreign keys are off during the restore, but it keeps the
 * restore valid if that ever changes, and makes the generated SQL readable.
 */
export const RESTORE_ORDER: readonly string[] = [
  'prompt_folders',
  'prompts',
  'folders',
  'conversations',
  'messages',
  'tags',
  'conversation_tags',
  'snippet_folders',
  'snippets',
  'favorites',
  'collection_folders',
  'gems',
  'notebooks',
];

/** Whether this identifier is a table the agent may write to */
export function isKnownTable(table: string): boolean {
  return KNOWN_TABLES.includes(table);
}

/**
 * Every table a DELETE on `table` can remove rows from, including `table` itself.
 *
 * Walked transitively: deleting a folder cascades to conversations, which cascades
 * to messages and conversation_tags. Missing any of those means the undo restores
 * the folder but not what hung off it.
 */
export function cascadeClosure(table: string): string[] {
  const seen = new Set<string>();
  const queue = [table];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const child of CASCADE_CHILDREN[current] ?? []) {
      if (!seen.has(child)) queue.push(child);
    }
  }

  return [...seen];
}

/**
 * Tables that must be captured before `sql` runs.
 *
 * The distinction that keeps snapshots small: cascades only fire on DELETE.
 * An INSERT or UPDATE cannot reach another table, so it only needs its own —
 * treating every write as a potential cascade would mean snapshotting `messages`
 * (the biggest table by far) every time a folder gets renamed.
 */
export function tablesToCapture(operation: 'insert' | 'update' | 'delete', table: string): string[] {
  return operation === 'delete' ? cascadeClosure(table) : [table];
}
