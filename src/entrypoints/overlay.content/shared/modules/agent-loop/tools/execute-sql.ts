/**
 * execute_sql Tool Implementation.
 *
 * Executes SQL statements against the local SQLite WASM database.
 * - SELECT: direct execution, max 1000 rows
 * - DML (INSERT/UPDATE/DELETE): paywall check + undo capture
 * - DDL (DROP/ALTER/CREATE/PRAGMA...): blocked
 *
 * Communicates via browser.runtime.sendMessage (EXECUTE_SQL) so it works
 * correctly from content script context.
 *
 * Asking the user for permission is *not* done here. It used to be, which meant a
 * tool opening a dialog, and the request carried only the SQL — so the approval
 * couldn't be offered on the call's own card in the chat, because nothing tied it to
 * a specific tool call. The gate now lives in `engine/stages/approval-gate.ts` and
 * runs before this is ever called.
 */

import { isPowerPackUser } from '@/shared/lib/license-store';
import { captureBeforeWrite } from '../undo';
import { paywallResult } from './paywall-signal';

/** Blocked SQL patterns (DDL and dangerous operations) */
const BLOCKED_PATTERN = /^\s*(DROP|ALTER|CREATE|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX)\b/i;

/** SELECT detection */
const SELECT_PATTERN = /^\s*SELECT\b/i;

/** Maximum rows returned for SELECT queries */
const MAX_RESULT_ROWS = 1000;

/**
 * Placeholder the AI uses instead of inventing random UUIDs.
 *
 * The surrounding quote (if any) is part of the match on purpose: the model
 * writes the placeholder both quoted (`'__NEW_UUID__'`, the documented form)
 * and bare (`NEW_UUID`), and the replacement has to end up as a valid string
 * literal either way. An earlier version swallowed the quotes without putting
 * them back, which turned `VALUES ('NEW_UUID', ...)` into a bare token and
 * made SQLite fail with `unrecognized token`.
 */
const UUID_PLACEHOLDER = /(['"`])?(?:__NEW_UUID__|\{\{NEW_UUID\}\}|<NEW_UUID>|NEW_UUID)\1?/g;

/** Replace all UUID placeholders with real, properly quoted crypto UUIDs */
function hydrateUuids(sql: string): string {
  return sql.replace(UUID_PLACEHOLDER, () => `'${crypto.randomUUID()}'`);
}

export interface ExecuteSqlParams {
  query: string;
}

/**
 * Execute SQL via the background service worker's EXECUTE_SQL handler.
 * This works from content script context (unlike direct runQuery which
 * requires the offscreen/worker communication that only background has).
 */
async function executeSqlViaBackground(sql: string): Promise<any> {
  const response = await browser.runtime.sendMessage({
    type: 'EXECUTE_SQL',
    payload: { sql },
  });

  if (!response.success) {
    throw new Error(response.error || 'SQL execution failed');
  }

  return response.data;
}

/**
 * Execute a SQL statement with safety checks.
 * Returns a formatted string result (success or error).
 */
export async function executeSql(params: ExecuteSqlParams): Promise<string> {
  const { query } = params;

  if (!query || !query.trim()) {
    return 'ERROR: Empty SQL query provided.';
  }

  // 1. Blocklist check
  if (BLOCKED_PATTERN.test(query)) {
    return 'ERROR: This SQL statement type is not allowed. Only SELECT, INSERT, UPDATE, DELETE are permitted.';
  }

  const isSelect = SELECT_PATTERN.test(query);

  /**
   * 2. Non-SELECT: paywall check.
   *
   * Delegated to `isPowerPackUser()` rather than reading `tier` here, which is what this
   * used to do — and got wrong twice in the same expression. It accepted `support_pack`,
   * the cheaper tier whose whole pitch is that it does *not* include write access, and it
   * never consulted `isLicenseValid`, so an expired cache still passed. Every other gate
   * in the app goes through that helper; this one, the only gate that actually mutates
   * user data, was the one that did not.
   */
  if (!isSelect && !isPowerPackUser()) {
    return paywallResult(
      'Writing to the database requires Power Pack. The user has been shown an upgrade prompt.',
    );
  }

  // 3. Hydrate UUID placeholders
  const hydratedQuery = hydrateUuids(query);

  // 4. Snapshot whatever this is about to change, so it can be undone.
  //    Swallows its own failures (downgrades to "no undo this session") — a write
  //    must not be blocked because its safety net could not be set up.
  if (!isSelect) {
    await captureBeforeWrite(hydratedQuery);
  }

  // 5. Execute
  try {
    const result = await executeSqlViaBackground(hydratedQuery);

    if (isSelect) {
      const rows = Array.isArray(result) ? result : [];
      if (rows.length === 0) {
        return 'Result: 0 rows returned.';
      }
      const truncated = rows.length > MAX_RESULT_ROWS;
      const displayRows = truncated ? rows.slice(0, MAX_RESULT_ROWS) : rows;
      let output = `Result: ${rows.length} row(s)`;
      if (truncated) {
        output += ` (showing first ${MAX_RESULT_ROWS}, ${rows.length - MAX_RESULT_ROWS} omitted)`;
      }
      output += '\n' + JSON.stringify(displayRows, null, 2);
      return output;
    } else {
      // For write operations, query changes()
      try {
        const changesResult = await executeSqlViaBackground('SELECT changes() as affected_rows');
        const affectedRows = changesResult?.[0]?.affected_rows ?? 'unknown';
        return `Success: ${affectedRows} row(s) affected.`;
      } catch {
        return 'Success: Operation completed (affected rows unknown).';
      }
    }
  } catch (e) {
    return `ERROR: SQL execution failed - ${(e as Error).message}`;
  }
}

