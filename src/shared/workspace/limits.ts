/**
 * What the free tier gets of the workspace.
 *
 * One workspace, five files. Deliberately not zero: the workspace is a sandbox of newly
 * created content, so the read/write line that guards the *database* — where a write
 * changes something the user already owns — has nothing to protect here. What is worth
 * selling is scale, so that is what the numbers cap. A free user can watch the agent
 * write a file, read it, edit it, and export it, which is the whole demo.
 *
 * ## Enforced at the callers, not in `fs.ts`
 *
 * Same placement as the SQL paywall: the tool layer decides, the filesystem executes.
 * `fs.ts` runs in the background service worker, where the licence store is not
 * hydrated, and pushing the check down there would also mean every internal move and
 * rename had to opt out of it.
 *
 * This is a limit, not a security boundary — OPFS is the user's own disk. It exists to
 * make the paid tier legible, so every check here fails *open* on an error rather than
 * refusing an operation because it could not count.
 */

import { isPowerPackUser } from '@/shared/lib/license-store';
import { isHistoryPath } from '@/shared/documents/history-path';
import { forWorkspace } from './client';

/** Workspaces a free user may keep. The bundled `default` one is the whole allowance. */
export const FREE_MAX_WORKSPACES = 1;

/** Files a free user may keep in a workspace. Directories are not counted. */
export const FREE_MAX_FILES = 5;

export interface WorkspaceQuota {
  /** True when nothing below applies. Callers can skip counting entirely. */
  unlimited: boolean;
  maxWorkspaces: number;
  maxFiles: number;
}

export function workspaceQuota(): WorkspaceQuota {
  if (isPowerPackUser()) {
    return { unlimited: true, maxWorkspaces: Infinity, maxFiles: Infinity };
  }
  return {
    unlimited: false,
    maxWorkspaces: FREE_MAX_WORKSPACES,
    maxFiles: FREE_MAX_FILES,
  };
}

/**
 * Whether another workspace may be created, given how many already exist.
 *
 * Takes the count rather than reading the store, so the switcher can ask the question
 * from a render pass and the create handler can ask it again at click time without the
 * two disagreeing about which store instance they mean.
 */
export function canCreateWorkspace(existingCount: number): boolean {
  return existingCount < workspaceQuota().maxWorkspaces;
}

export interface FileBudget {
  unlimited: boolean;
  /** Files currently in the workspace. 0 when unlimited — it was never counted. */
  used: number;
  max: number;
  /** How many more files may be created. `Infinity` when unlimited. */
  remaining: number;
}

const UNLIMITED_BUDGET: FileBudget = {
  unlimited: true,
  used: 0,
  max: Infinity,
  remaining: Infinity,
};

/**
 * How much room is left for new files in a workspace.
 *
 * Costs one recursive listing, which is why the licence is checked first: a Power Pack
 * user pays nothing for a cap that does not apply to them, and the agent calls this
 * before every `write_file`.
 */
export async function fileBudget(workspaceId: string): Promise<FileBudget> {
  const quota = workspaceQuota();
  if (quota.unlimited) return UNLIMITED_BUDGET;

  const used = await countFiles(workspaceId);
  return {
    unlimited: false,
    used,
    max: quota.maxFiles,
    remaining: Math.max(0, quota.maxFiles - used),
  };
}

/**
 * Count the files in a workspace, ignoring directories.
 *
 * Returns 0 if the listing fails. `uploadFiles` already makes the same call for conflict
 * detection and treats an unreadable listing as an empty workspace; refusing to write
 * because the count is unknown would turn a transient messaging failure into a paywall,
 * which is the one thing a paywall must never be by accident.
 */
async function countFiles(workspaceId: string): Promise<number> {
  try {
    const { entries } = await forWorkspace(workspaceId).list('', true);
    return entries.reduce(
      // `.history/` holds the pre-edit copies the document engine takes before it
      // rewrites a file. ⚠️ Counting them would mean editing a document three times
      // pushes a free user into the paywall — a safety net that charges for itself is a
      // safety net people learn to switch off.
      (n, entry) => (entry.kind === 'file' && !isHistoryPath(entry.path) ? n + 1 : n),
      0,
    );
  } catch {
    return 0;
  }
}
