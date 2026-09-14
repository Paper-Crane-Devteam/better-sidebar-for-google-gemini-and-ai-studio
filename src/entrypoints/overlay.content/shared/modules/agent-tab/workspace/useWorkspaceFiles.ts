/**
 * Load one workspace's file tree, shaped for the shared `FolderTree`.
 *
 * Fetches the whole subtree in a single recursive `list`, then builds the nesting in
 * memory. OPFS has no way to ask for "one level plus counts", so lazy per-directory
 * loading would mean a message round trip per expand — for a workspace of notes, one
 * flat fetch is both simpler and faster.
 *
 * It also re-lists when the agent writes, so watching a task run shows the files appear.
 * That refresh is silent by design; see `load` and `useWorkspaceRevision`.
 *
 * ## The path is the id
 *
 * `FolderTreeNodeData.id` holds the full workspace path. Everything downstream — move,
 * rename, delete, download — needs the path and nothing else, so any other id would be
 * a lookup table standing between the tree and every operation on it.
 *
 * It does mean ids are not stable across a rename: renaming `notes/` changes the id of
 * every file beneath it. Two consequences, both accepted. react-arborist's persisted
 * expand state is keyed by id, so a renamed folder comes back collapsed and the old
 * keys linger in localStorage as dead weight. Neither is worth a second identity scheme
 * that would have to be kept in sync with the filesystem it describes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forWorkspace, type FileEntry } from '@/shared/workspace/client';
import { isProbablyBinary } from '@/shared/workspace/file-kinds';
import type { FolderTreeNodeData } from '../../../components/folder-tree';
import { useWorkspaceRevision } from './useWorkspaceRevision';

/** What each node carries in `data`, for the row renderer and the menus. */
export interface WorkspaceNodeData {
  path: string;
  kind: 'file' | 'directory';
  /** Bytes; absent for directories. */
  size?: number;
  /** Epoch millis of last write; absent for directories. */
  modified?: number;
  /** Guessed from the extension. Only drives the icon and a hint. */
  isBinary: boolean;
}

/** The parent path of a workspace path. '' for a top-level entry. */
function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/**
 * Assemble a nested tree from flat paths.
 *
 * Intermediate directories are synthesised when missing: a recursive list yields them,
 * but a truncated page may not, and a file whose parent is absent would otherwise
 * vanish from the tree entirely.
 *
 * Directories get `children: []` and files get no `children` key at all. That is what
 * react-arborist reads to decide what is a leaf, and it is also what stops a file from
 * accepting a drop.
 */
function buildTree(entries: FileEntry[]): FolderTreeNodeData[] {
  const roots: FolderTreeNodeData[] = [];
  const byPath = new Map<string, FolderTreeNodeData>();

  const ensureDir = (path: string): FolderTreeNodeData | null => {
    if (path === '') return null;
    const existing = byPath.get(path);
    if (existing) return existing;

    const node: FolderTreeNodeData = {
      id: path,
      name: path.slice(path.lastIndexOf('/') + 1),
      type: 'folder',
      children: [],
      data: { path, kind: 'directory', isBinary: false } satisfies WorkspaceNodeData,
    };
    byPath.set(path, node);

    const parent = ensureDir(parentOf(path));
    (parent ? parent.children! : roots).push(node);
    return node;
  };

  // Directories first, so a file never has to create its own parent out of order.
  for (const entry of entries) {
    if (entry.kind === 'directory') ensureDir(entry.path);
  }

  for (const entry of entries) {
    if (entry.kind !== 'file') continue;
    const node: FolderTreeNodeData = {
      id: entry.path,
      name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
      type: 'file',
      data: {
        path: entry.path,
        kind: 'file',
        size: entry.size,
        modified: entry.modified,
        isBinary: isProbablyBinary(entry.path),
      } satisfies WorkspaceNodeData,
    };
    byPath.set(entry.path, node);
    const parent = ensureDir(parentOf(entry.path));
    (parent ? parent.children! : roots).push(node);
  }

  sortNodes(roots);
  return roots;
}

/** Directories before files, then alphabetical — the order a file browser reads in. */
function sortNodes(nodes: FolderTreeNodeData[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
  for (const node of nodes) if (node.children?.length) sortNodes(node.children);
}

/**
 * Drop everything that does not match, keeping folders that still contain a match.
 *
 * Matches on the file's own name rather than its full path: typing "notes" to have every
 * file under `notes/` survive reads as a bug, because the folder is already visible
 * above them. Folder names are matched too, and a matching folder keeps its whole
 * subtree — that is the one case where the path does carry the intent.
 */
function filterTree(nodes: FolderTreeNodeData[], term: string): FolderTreeNodeData[] {
  const out: FolderTreeNodeData[] = [];

  for (const node of nodes) {
    const selfMatches = node.name.toLowerCase().includes(term);

    if (node.type === 'file') {
      if (selfMatches) out.push(node);
      continue;
    }

    if (selfMatches) {
      out.push(node);
      continue;
    }

    const children = filterTree(node.children ?? [], term);
    if (children.length > 0) out.push({ ...node, children });
  }

  return out;
}

export interface UseWorkspaceFilesResult {
  /** Ready for `FolderTree`, already filtered by `searchTerm`. */
  data: FolderTreeNodeData[];
  /**
   * Every directory, as `{ id, parent_id }`.
   *
   * `useFolderTree` needs this to tell whether a dragged id is a folder. It expects the
   * SQL row shape the other trees pass, so the two keys are named to match rather than
   * to describe a path.
   */
  folders: Array<{ id: string; parent_id: string | null }>;
  /**
   * How many files exist, across the whole workspace and ignoring the search filter.
   *
   * Not for display. It decides whether the destructive actions are reachable at all, and
   * it fills in their confirmation copy ("delete all 12 files"). A running total of files
   * and bytes used to sit in the header; it changed on its own, prompted nothing, and was
   * removed.
   */
  fileCount: number;
  loading: boolean;
  error: string | null;
  /**
   * Re-list, showing the loading state.
   *
   * For operations the user just performed and is waiting on. Agent writes refresh
   * themselves, silently — callers do not need to arrange for that.
   */
  reload: () => Promise<void>;
}

export function useWorkspaceFiles(
  workspaceId: string,
  searchTerm = '',
): UseWorkspaceFilesResult {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Which load is the current one.
   *
   * A silent refresh can now overlap a user-triggered reload — a switch mid-burst, an
   * agent write landing while an upload finishes. Whichever started last is the one whose
   * answer describes the workspace, so earlier replies are dropped rather than applied on
   * arrival.
   */
  const latest = useRef(0);

  /**
   * List the workspace.
   *
   * `silent` is the whole difference between the two entry points below, and it is not
   * only about the spinner. A silent load never blanks the tree and never surfaces its own
   * failure: it is refreshing something the user is currently looking at and did not ask
   * to have replaced, so on failure the previous listing stays and the next attempt tries
   * again. A visible load owns the panel and reports what happened.
   */
  const load = useCallback(
    async (silent: boolean) => {
      const seq = ++latest.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const { entries: found } = await forWorkspace(workspaceId).list('', true);
        if (seq !== latest.current) return;
        setEntries(found);
        // A successful read is also the answer to whatever the last failure said.
        setError(null);
      } catch (e) {
        if (seq !== latest.current || silent) return;
        setError((e as Error).message);
        // Clear on failure: leaving the previous workspace's files on screen under a new
        // name is worse than showing nothing.
        setEntries([]);
      } finally {
        // Unconditional, unlike the writes above: whoever raised the spinner has to lower
        // it. Skipping this when a later load has taken over would leave the panel behind
        // a spinner that nothing is waiting for, because a silent load never clears it.
        if (!silent) setLoading(false);
      }
    },
    [workspaceId],
  );

  const reload = useCallback(() => load(false), [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Re-list after the agent has written, without the spinner.
   *
   * The spinner matters here: `WorkspaceView` swaps the tree out for it while `loading`
   * is true, so routing an agent-driven refresh through `reload` would unmount and
   * remount a react-arborist tree — losing scroll position and expand state — every few
   * seconds of a running task. See the note on the tree's `key` in `WorkspaceView`.
   */
  const revision = useWorkspaceRevision();
  const handled = useRef(0);
  useEffect(() => {
    if (revision === handled.current) return;
    handled.current = revision;
    void load(true);
  }, [revision, load]);

  const tree = useMemo(() => buildTree(entries), [entries]);

  const data = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return term ? filterTree(tree, term) : tree;
  }, [tree, searchTerm]);

  const folders = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'directory')
        .map((e) => ({ id: e.path, parent_id: parentOf(e.path) || null })),
    [entries],
  );

  const fileCount = useMemo(
    () => entries.reduce((n, entry) => (entry.kind === 'file' ? n + 1 : n), 0),
    [entries],
  );

  return { data, folders, fileCount, loading, error, reload };
}
