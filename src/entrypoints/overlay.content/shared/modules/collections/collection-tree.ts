/**
 * Tree building and ordering shared by the Gems and Notebooks panels and their
 * pickers. Pure functions only, so the panel, the picker and the drag logic all
 * agree on one order.
 *
 * Shape of the panel tree (three kinds of rows):
 *   user folder   type 'folder', data.kind === 'collectionFolder'
 *   gem/notebook  type 'folder', data.kind === 'collectionItem'   (its chats are children)
 *   conversation  type 'file'
 *
 * Gems/notebooks are react-arborist folders because they have children, but for
 * dragging they behave like files: they go into user folders, never the other
 * way round, and nothing can be dropped into them.
 */
import type { CollectionFolder, CollectionScope, Gem, Notebook } from '@/shared/types/db';
import type { Conversation } from '@/shared/lib/store/types';
import type { CollectionSortOrder } from '@/shared/lib/store/types';
import type { FolderTreeNodeData } from '../../components/folder-tree';

export type CollectionItem = Gem | Notebook;

export const FOLDER_KIND = 'collectionFolder';
export const ITEM_KIND = 'collectionItem';

/** Per-panel constants. */
export const COLLECTION_CONFIG: Record<
  CollectionScope,
  {
    /** Conversation column linking a chat to its gem/notebook */
    convKey: 'gem_id' | 'notebook_id';
    /** Legacy flag on item rows, still read by the item nodes */
    itemFlag: 'isGem' | 'isNotebook';
    /** localStorage key for the expanded rows */
    storageKey: string;
  }
> = {
  gems: { convKey: 'gem_id', itemFlag: 'isGem', storageKey: 'gems-tree-open-state' },
  notebooks: {
    convKey: 'notebook_id',
    itemFlag: 'isNotebook',
    storageKey: 'notebooks-tree-open-state',
  },
};

export const isCollectionFolderNode = (data?: FolderTreeNodeData) =>
  data?.data?.kind === FOLDER_KIND;
export const isCollectionItemNode = (data?: FolderTreeNodeData) =>
  data?.data?.kind === ITEM_KIND;

const dateOf = (d: any): number => d?.updated_at || d?.created_at || 0;

/** Order of gems/notebooks among their siblings under the given sort mode. */
export function compareCollectionItems(
  a: { name: string; order_index?: number },
  b: { name: string; order_index?: number },
  sortOrder: CollectionSortOrder,
): number {
  if (sortOrder === 'custom') {
    // 0 = never ranked: items added after the folder was arranged. They sit on
    // top, newest first, until the next drag in that folder ranks them too —
    // the same rule the Library uses for chats.
    const rankA = a.order_index ?? 0;
    const rankB = b.order_index ?? 0;
    const rankedA = rankA > 0;
    const rankedB = rankB > 0;
    if (rankedA !== rankedB) return rankedA ? 1 : -1;
    if (rankedA && rankA !== rankB) return rankA - rankB;
    if (!rankedA) {
      const byDate = dateOf(b) - dateOf(a);
      if (byDate !== 0) return byDate;
    }
    return a.name.localeCompare(b.name);
  }
  if (sortOrder === 'date') return dateOf(b) - dateOf(a);
  return a.name.localeCompare(b.name);
}

/**
 * Folders always keep their manual order. Must match `sortedFolderSiblings` in
 * useFolderTree (pinned, order_index, name), or folder drops land off by one.
 */
export function compareCollectionFolders(
  a: { name: string; order_index?: number; is_pinned?: number },
  b: { name: string; order_index?: number; is_pinned?: number },
): number {
  const pinA = a.is_pinned ? 1 : 0;
  const pinB = b.is_pinned ? 1 : 0;
  if (pinA !== pinB) return pinB - pinA;
  const orderA = a.order_index ?? 0;
  const orderB = b.order_index ?? 0;
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name);
}

/** Siblings in one level: pinned first, then folders, then gems/notebooks. */
export function compareCollectionNodes(
  a: FolderTreeNodeData,
  b: FolderTreeNodeData,
  sortOrder: CollectionSortOrder,
): number {
  const pinA = a.data?.is_pinned ? 1 : 0;
  const pinB = b.data?.is_pinned ? 1 : 0;
  if (pinA !== pinB) return pinB - pinA;

  const folderA = isCollectionFolderNode(a);
  const folderB = isCollectionFolderNode(b);
  if (folderA !== folderB) return folderA ? -1 : 1;
  if (folderA) return compareCollectionFolders(a.data, b.data);
  return compareCollectionItems(
    { ...a.data, name: a.name },
    { ...b.data, name: b.name },
    sortOrder,
  );
}

/** Ids of every folder below `folderId` (not including it). */
export function descendantFolderIds(folders: CollectionFolder[], folderId: string): string[] {
  const byParent = new Map<string, CollectionFolder[]>();
  for (const f of folders) {
    if (!f.parent_id) continue;
    if (!byParent.has(f.parent_id)) byParent.set(f.parent_id, []);
    byParent.get(f.parent_id)!.push(f);
  }
  const out: string[] = [];
  const walk = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      out.push(child.id);
      walk(child.id);
    }
  };
  walk(folderId);
  return out;
}

/** "Parent / Child" path of a folder, or null if it no longer exists. */
export function folderPath(folders: CollectionFolder[], folderId: string | null): string | null {
  if (!folderId) return null;
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let current = byId.get(folderId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return parts.length ? parts.join(' / ') : null;
}

/**
 * Link folders and items into a forest. Items pointing at a folder that no
 * longer exists (deleted elsewhere, older sync payload) land at the top level,
 * as do folders whose parent is gone.
 */
function linkFolders<T>(
  folders: CollectionFolder[],
  items: T[],
  folderOf: (item: T) => string | null | undefined,
): {
  roots: { folders: CollectionFolder[]; items: T[] };
  childFolders: Map<string, CollectionFolder[]>;
  childItems: Map<string, T[]>;
} {
  const ids = new Set(folders.map((f) => f.id));
  const childFolders = new Map<string, CollectionFolder[]>();
  const childItems = new Map<string, T[]>();
  const roots = { folders: [] as CollectionFolder[], items: [] as T[] };

  for (const f of folders) {
    if (f.parent_id && ids.has(f.parent_id) && f.parent_id !== f.id) {
      if (!childFolders.has(f.parent_id)) childFolders.set(f.parent_id, []);
      childFolders.get(f.parent_id)!.push(f);
    } else {
      roots.folders.push(f);
    }
  }
  for (const item of items) {
    const fid = folderOf(item);
    if (fid && ids.has(fid)) {
      if (!childItems.has(fid)) childItems.set(fid, []);
      childItems.get(fid)!.push(item);
    } else {
      roots.items.push(item);
    }
  }
  return { roots, childFolders, childItems };
}

export interface BuildCollectionTreeInput {
  scope: CollectionScope;
  items: CollectionItem[];
  /** Folders of this scope only */
  folders: CollectionFolder[];
  conversations: Conversation[];
  favoriteIds: Set<string>;
  /** Conversations carrying at least one selected tag; null = no tag filter */
  taggedIds: Set<string> | null;
  onlyFavorites: boolean;
  sortOrder: CollectionSortOrder;
  untitled: string;
}

export function buildCollectionTree(input: BuildCollectionTreeInput): FolderTreeNodeData[] {
  const { scope, items, folders, conversations, favoriteIds, taggedIds, onlyFavorites, sortOrder } =
    input;
  const { convKey, itemFlag } = COLLECTION_CONFIG[scope];
  const hasActiveFilter = onlyFavorites || taggedIds !== null;

  // Chats grouped by their gem/notebook, after the favourite/tag filters.
  const chatsByItem = new Map<string, Conversation[]>();
  for (const c of conversations) {
    const owner = c[convKey];
    if (!owner) continue;
    if (onlyFavorites && !favoriteIds.has(c.id)) continue;
    if (taggedIds && !taggedIds.has(c.id)) continue;
    if (!chatsByItem.has(owner)) chatsByItem.set(owner, []);
    chatsByItem.get(owner)!.push(c);
  }

  const chatDate = (c: any) => c?.last_active_at || c?.updated_at || c?.created_at || 0;
  const itemNode = (item: CollectionItem): FolderTreeNodeData => {
    const children: FolderTreeNodeData[] = (chatsByItem.get(item.id) ?? []).map((c) => ({
      id: c.id,
      name: c.title || input.untitled,
      type: 'file' as const,
      data: c,
    }));
    // Chats inside a gem/notebook have no manual order: favourites, then date or name.
    children.sort((a, b) => {
      const favA = favoriteIds.has(a.id);
      const favB = favoriteIds.has(b.id);
      if (favA !== favB) return favA ? -1 : 1;
      if (sortOrder === 'alpha') return a.name.localeCompare(b.name);
      return chatDate(b.data) - chatDate(a.data);
    });
    return {
      id: item.id,
      name: item.name,
      type: 'folder' as const,
      children,
      data: { ...item, kind: ITEM_KIND, [itemFlag]: true },
    };
  };

  const { roots, childFolders, childItems } = linkFolders(folders, items, (i) => i.folder_id);

  const build = (levelFolders: CollectionFolder[], levelItems: CollectionItem[]) => {
    const nodes: FolderTreeNodeData[] = [];
    for (const f of levelFolders) {
      const children = build(childFolders.get(f.id) ?? [], childItems.get(f.id) ?? []);
      // While filtering, a folder with nothing matching inside is just noise.
      if (hasActiveFilter && children.length === 0) continue;
      nodes.push({
        id: f.id,
        name: f.name,
        type: 'folder' as const,
        children,
        data: { ...f, kind: FOLDER_KIND },
      });
    }
    for (const item of levelItems) {
      const node = itemNode(item);
      if (hasActiveFilter && !node.children?.length) continue;
      nodes.push(node);
    }
    nodes.sort((a, b) => compareCollectionNodes(a, b, sortOrder));
    return nodes;
  };

  return build(roots.folders, roots.items);
}

export type CollectionPickerRow<T extends CollectionItem = CollectionItem> =
  | { kind: 'folder'; id: string; name: string; depth: number; isOpen: boolean }
  | { kind: 'item'; id: string; item: T; depth: number };

/**
 * Flattened rows for the pickers. Folders without any gem/notebook below them
 * are left out — there is nothing to pick in them. While searching, only
 * matching items and the folders leading to them are shown, all expanded.
 */
export function buildPickerRows<T extends CollectionItem>(input: {
  items: T[];
  folders: CollectionFolder[];
  sortOrder: CollectionSortOrder;
  query: string;
  collapsed: Set<string>;
}): CollectionPickerRow<T>[] {
  const q = input.query.trim().toLowerCase();
  const items = q ? input.items.filter((i) => i.name.toLowerCase().includes(q)) : input.items;
  const { roots, childFolders, childItems } = linkFolders(input.folders, items, (i) => i.folder_id);

  type Level = { folders: CollectionFolder[]; items: T[] };
  const countCache = new Map<string, number>();
  const countItems = (folderId: string): number => {
    if (countCache.has(folderId)) return countCache.get(folderId)!;
    let n = childItems.get(folderId)?.length ?? 0;
    for (const sub of childFolders.get(folderId) ?? []) n += countItems(sub.id);
    countCache.set(folderId, n);
    return n;
  };

  const rows: CollectionPickerRow<T>[] = [];
  const emit = (level: Level, depth: number) => {
    type Entry = { folder?: CollectionFolder; item?: T; name: string; data: any };
    const entries: Entry[] = [
      ...level.folders
        .filter((f) => countItems(f.id) > 0)
        .map((f) => ({ folder: f, name: f.name, data: { ...f, kind: FOLDER_KIND } })),
      ...level.items.map((i) => ({ item: i, name: i.name, data: i })),
    ];
    entries.sort((a, b) =>
      compareCollectionNodes(
        { id: '', type: 'folder', name: a.name, data: a.data },
        { id: '', type: 'folder', name: b.name, data: b.data },
        input.sortOrder,
      ),
    );
    for (const e of entries) {
      if (e.folder) {
        const isOpen = !!q || !input.collapsed.has(e.folder.id);
        rows.push({ kind: 'folder', id: e.folder.id, name: e.folder.name, depth, isOpen });
        if (isOpen) {
          emit(
            {
              folders: childFolders.get(e.folder.id) ?? [],
              items: childItems.get(e.folder.id) ?? [],
            },
            depth + 1,
          );
        }
      } else if (e.item) {
        rows.push({ kind: 'item', id: e.item.id, item: e.item, depth });
      }
    }
  };
  emit(roots, 0);
  return rows;
}
