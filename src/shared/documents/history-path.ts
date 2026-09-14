/**
 * Where pre-edit copies live — a zero-dependency leaf, on purpose.
 *
 * Three very different places need to agree on this one string: the engine that writes
 * the copies (`storage.ts`, which pulls in OPFS and fflate), the free-tier counter
 * (`workspace/limits.ts`, which runs in the content script), and the file tree. Putting
 * it in `storage.ts` would drag the whole document engine into the overlay bundle that is
 * injected on every page load, for the sake of one prefix check.
 */

/** Directory holding pre-edit copies. Mirrors the workspace tree beneath it. */
export const HISTORY_DIR = '.history';

/** Whether a path is one of our backups, so listings and quotas can skip it. */
export function isHistoryPath(path: string): boolean {
  return path === HISTORY_DIR || path.startsWith(`${HISTORY_DIR}/`);
}
