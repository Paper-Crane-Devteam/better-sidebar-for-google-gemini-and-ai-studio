import { runCommand } from '../index';

/**
 * Generic UPDATE helper that auto-appends `updated_at = unixepoch()`.
 * Keeps repo code DRY — callers just pass the table, id, and partial updates.
 */
export async function updateWithTimestamp(
  table: string,
  id: string,
  updates: Record<string, any>,
): Promise<void> {
  const fields = Object.keys(updates);
  if (fields.length === 0) return;

  const values = Object.values(updates);
  const setClause = fields.map((f) => `${f} = ?`).join(', ');

  await runCommand(
    `UPDATE ${table} SET ${setClause}, updated_at = unixepoch() WHERE id = ?`,
    [...values, id],
  );
}
