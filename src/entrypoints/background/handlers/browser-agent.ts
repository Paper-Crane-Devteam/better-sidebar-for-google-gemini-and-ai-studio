import {
  CAPABILITIES, READ_TOOLS, dependencies, permissionsFor, toolCapability, parseOperations,
  publicData, isChromeBuild, isTabTool, readCapability, tierOf, type Batch, type BrowserRequest,
  type Snapshot, type Operation, type Capability, type PlanPreview, type BookmarkState,
  type Tier, type TabState, type GroupState, type Placement, type PreviewTarget,
} from '@/shared/browser-agent/contracts';
import { localAudit } from '@/shared/browser-agent/local-store';
import { ensureDbReady } from '../db';
import { ensureDbForTab, getCurrentDbName } from '../tab-profile-map';
import type { MessageSender } from '../types';

let queue: Promise<unknown> = Promise.resolve();
const cancelled = new Set<string>();
const active = new Set<string>();
const owners = new Map<string, number>();
let epochPromise: Promise<string> | undefined;
const epoch = () => epochPromise ??= (async () => {
  const key = 'browser-agent-epoch';
  const value = (await chrome.storage.session.get(key))[key];
  if (typeof value === 'string') return value;
  const id = crypto.randomUUID();
  await chrome.storage.session.set({ [key]: id });
  return id;
})();
const stable = (v: unknown) => JSON.stringify(v);
const numberParam = (v: string | undefined, fallback: number) => {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Expected a non-negative integer.');
  return n;
};
function page<T>(items: T[], params: Record<string, string>) {
  const offset = numberParam(params.offset, 0);
  const limit = Math.max(1, Math.min(numberParam(params.limit, 50), 100));
  return { total: items.length, items: items.slice(offset, offset + limit), next_offset: offset + limit < items.length ? offset + limit : null };
}
/** Profile databases this service-worker life has already swept. */
const swept = new Set<string>();

/**
 * Open the right profile's database, then sweep it once.
 *
 * Only the journal needs this. Settings and the permission window read
 * `chrome.storage`, so they must not be parked behind the database opening — that
 * window is where a user goes when nothing else is working.
 *
 * Keyed by database name because the journal lives in the profile database, and two
 * tabs signed into different accounts are two journals. `ensureDbForTab` is what makes a
 * request land in the profile its own tab belongs to, so it runs per request while the
 * sweep runs once per profile.
 */
async function journalReady(owner: number | undefined) {
  await ensureDbReady();
  await ensureDbForTab(owner);
  const key = getCurrentDbName() ?? '';
  if (swept.has(key)) return;
  swept.add(key);
  try {
    discardLegacyStore();
    await localAudit.markInterrupted('Execution was interrupted. Inspect the browser before attempting another change.');
    await localAudit.prune();
  } catch (error) {
    // Upkeep, not a mechanism. A row stuck at `applying` is still unusable — `commit`
    // only accepts `prepared` — so failing the caller's request over it buys nothing.
    console.warn('[BrowserAgent] Journal upkeep failed:', error);
  }
}

/**
 * Drop the database the first version kept its journal in.
 *
 * Best-effort and fire-and-forget: it is storage nobody reads any more, and Browser
 * Agent never shipped, so there is nothing in it worth migrating.
 */
function discardLegacyStore() {
  try { indexedDB.deleteDatabase('browser-agent-local-v1'); } catch { /* Nothing depends on this. */ }
}
async function requireCaps(caps: Capability[]) {
  const settings = await localAudit.settings();
  const required = [...new Set(caps.flatMap(dependencies))];
  if (required.some(c => !settings.capabilities.includes(c)) || !await chrome.permissions.contains({ permissions: permissionsFor(required) })) {
    throw new Error('Browser access is disabled or was revoked. Open Browser Agent permissions.');
  }
}
async function requireTool(tool: string) {
  const cap = toolCapability(tool);
  if (cap) await requireCaps([cap]);
}
async function bookmarkSnapshot(): Promise<BookmarkState[]> {
  const roots = await chrome.bookmarks.getTree();
  const rows: BookmarkState[] = [];
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
    for (const n of nodes) {
      rows.push({ id: n.id, parentId: n.parentId, index: n.index, title: n.title, ...(n.url !== undefined ? { url: n.url } : {}), ...(n.unmodifiable ? { unmodifiable: n.unmodifiable } : {}) });
      if (n.children) walk(n.children);
    }
  };
  walk(roots);
  if (rows.length > 10000) throw new Error('This bookmark collection exceeds the first-version planning limit (10,000 items).');
  return rows;
}
/**
 * A tab's address, including one it has not arrived at yet.
 *
 * `Tab.url` is the **last committed** URL. A tab created a moment ago has not committed
 * anything, so `url` is `''` and the destination sits in `pendingUrl` until the
 * navigation lands. Reading `url` alone therefore gave a freshly created tab one
 * identity for a few hundred milliseconds and another one afterwards — and every
 * consistency check in this file compares whole snapshots, so that shift was read as
 * "someone changed the browser underneath us". It broke three separate things: a batch
 * stopped at the step after any `create`, a batch that had created a tab could never be
 * undone, and undoing a `close` reported that the restoration had not matched.
 */
const tabUrl = (t: chrome.tabs.Tab) => t.url || t.pendingUrl || '';

async function snapshot(tool: string): Promise<Snapshot> {
  if (!isTabTool(tool)) return { bookmarks: await bookmarkSnapshot() };
  const tabs = (await chrome.tabs.query({})).filter(t => !t.incognito).map(t => ({
    id: t.id!, windowId: t.windowId, index: t.index, title: t.title ?? '', url: tabUrl(t),
    pinned: t.pinned, active: t.active, groupId: t.groupId,
  })).sort((a, b) => a.id - b.id);
  if (tabs.length > 2000) throw new Error('Too many open tabs for one plan (limit 2,000).');
  const windows = new Set(tabs.map(t => t.windowId));
  const groups = (await chrome.tabGroups.query({})).filter(g => windows.has(g.windowId)).map(g => ({
    id: g.id, windowId: g.windowId, title: g.title ?? '', color: g.color, collapsed: g.collapsed,
  })).sort((a, b) => a.id - b.id);
  return { tabs, groups };
}
/**
 * The part of the browser one batch's approval is about.
 *
 * The comparison below used to run over the whole browser — every non-incognito tab in
 * every window, `active` and `url` included, with only `title` excluded. That is a
 * demand that the browser hold still from the moment the preview is drawn until the last
 * step lands, and browsers do not hold still. The false conflicts were routine:
 *
 * - The preview says "close tab #7". You click over to #7 to see what it is, come back,
 *   approve — and `active` has changed. Looking at what you are about to approve is the
 *   single most likely thing to happen in that gap.
 * - You open a tab anywhere while the batch runs, and every index after it shifts.
 * - A background tab finishes a redirect.
 *
 * So the comparison is scoped to what the operations can actually be affected by:
 *
 * | | compared | why |
 * |---|---|---|
 * | windows the batch touches | every tab, in full | index-based moves depend on the whole order of their window |
 * | other windows | nothing | no operation here can be affected by them |
 * | `active` | never | focus is not a layout fact, and no operation's correctness rests on it |
 * | `url` of a targeted tab | yes | closing or moving *this* tab means the page that was in it |
 * | `url` of a context tab | no | it is only there to establish an ordering |
 *
 * ⚠️ This is not the guard that keeps an approval bound to real objects — `validateTargets`
 * re-checks every target against a fresh snapshot on each step, protected host tab and
 * private windows included. This one answers the narrower "did the world move under the
 * preview", and it is the one that has to be scoped or it fires on everything.
 */
interface Scope {
  /** Windows whose layout the batch depends on. */
  windows: Set<number>;
  /** Tabs the batch names, or whose group it names — the ones whose identity matters. */
  targeted: Set<number>;
  /**
   * Tabs a restoration re-created. Their address is explicitly best-effort: we hand the
   * URL back to Chrome and it decides where that lands, so a redirect is a normal
   * outcome, not evidence that someone else touched the browser.
   */
  reopened?: Set<number>;
}

/**
 * `everyTab` widens `targeted` to the whole scoped windows, for restorations.
 *
 * `restoreTabs` does not work from the operation list — it walks the recorded snapshot and
 * moves anything whose position differs, which can be any tab in those windows. So for an
 * undo, "targeted" is all of them.
 */
function scopeOf(operations: Operation[], before: Snapshot, owner: number, everyTab: boolean): Scope {
  const windows = new Set<number>();
  const targeted = new Set<number>();
  // Always in scope: `create` without a `window_id` lands in the host tab's window.
  const hostWindow = before.tabs?.find(t => t.id === owner)?.windowId;
  if (hostWindow !== undefined) windows.add(hostWindow);
  for (const op of operations) {
    for (const id of (op.tab_ids as number[] | undefined) ?? (op.tab_id !== undefined ? [Number(op.tab_id)] : [])) targeted.add(id);
    if (op.group_id !== undefined) for (const t of before.tabs ?? []) if (t.groupId === op.group_id) targeted.add(t.id);
    if (op.window_id !== undefined) windows.add(Number(op.window_id));
  }
  for (const t of before.tabs ?? []) if (targeted.has(t.id)) windows.add(t.windowId);
  if (everyTab) for (const t of before.tabs ?? []) if (windows.has(t.windowId)) targeted.add(t.id);
  return { windows, targeted };
}

/**
 * A snapshot reduced to the fields and objects the scope says matter.
 *
 * Bookmarks are compared whole and unscoped. They have no equivalent of a tab quietly
 * finishing a navigation — a bookmark tree only changes when someone changes it — so the
 * strict comparison costs nothing there, and scoping it would mean reasoning about which
 * folders a move's index depends on for no gain.
 */
function comparable(s: Snapshot, scope: Scope) {
  if (!s.tabs) return s;
  return {
    ...s,
    tabs: s.tabs
      .filter(t => scope.windows.has(t.windowId))
      .map(({ title: _title, active: _active, ...t }) =>
        scope.targeted.has(t.id) && !scope.reopened?.has(t.id) ? t : { ...t, url: '' }),
    groups: s.groups?.filter(g => scope.windows.has(g.windowId)),
  };
}
function matches(a: Snapshot, b: Snapshot, scope: Scope) {
  return stable(comparable(a, scope)) === stable(comparable(b, scope));
}
function diff(before: Snapshot, after: Snapshot) {
  return (['tabs', 'groups', 'bookmarks'] as const).flatMap(kind => {
    const a = new Map((before[kind] ?? []).map(n => [String(n.id), n] as const));
    const b = new Map((after[kind] ?? []).map(n => [String(n.id), n] as const));
    return [...new Set([...a.keys(), ...b.keys()])].filter(id => stable(a.get(id)) !== stable(b.get(id))).map(id => ({ kind, id, before: a.get(id), after: b.get(id) }));
  });
}
function validateTargets(tool: string, op: Operation, s: Snapshot, owner: number) {
  if (!isTabTool(tool)) {
    const rows = s.bookmarks!;
    const target = rows.find(n => n.id === op.id);
    if (op.type !== 'create' && (!target || target.parentId === undefined || target.parentId === '0' || target.unmodifiable)) throw new Error('Bookmark is missing, a protected root, or managed.');
    if (op.parent_id !== undefined) {
      const parent = rows.find(n => n.id === op.parent_id);
      if (!parent || parent.url !== undefined || parent.id === '0' || parent.unmodifiable) throw new Error('Invalid bookmark destination.');
      let current: BookmarkState | undefined = parent;
      while (current) {
        if (current.id === op.id) throw new Error('Cannot move a folder into itself or its descendants.');
        current = rows.find(n => n.id === current!.parentId);
      }
    }
    if (op.index !== undefined && Number(op.index) < 0) throw new Error('Bookmark index must be non-negative.');
    return;
  }
  const ids = op.tab_ids as number[] | undefined ?? (op.tab_id !== undefined ? [Number(op.tab_id)] : []);
  for (const id of ids) {
    const tab = s.tabs!.find(t => t.id === id);
    if (!tab) throw new Error('Tab is missing or private.');
    if (id === owner && !['pin', 'activate'].includes(op.type)) throw new Error('The Agent host tab is protected.');
    if (tool === 'browser_manage_tab_groups' && tab.pinned) throw new Error('Pinned tabs cannot be grouped.');
  }
  if (op.group_id !== undefined) {
    if (!s.groups!.some(g => g.id === op.group_id)) throw new Error('Group is missing.');
    if (s.tabs!.some(t => t.id === owner && t.groupId === op.group_id)) throw new Error('The group containing the Agent host is protected.');
  }
  if (op.window_id !== undefined && !s.tabs!.some(t => t.windowId === op.window_id)) throw new Error('Destination window is missing or private.');
  if (ids.length > 1 && new Set(s.tabs!.filter(t => ids.includes(t.id)).map(t => t.windowId)).size > 1) throw new Error('Group members must belong to the same window.');
}
async function apply(tool: string, op: Operation, owner: number) {
  const tabId = Number(op.tab_id);
  if (tool === 'browser_arrange_tabs') {
    switch (op.type) {
      case 'create': await chrome.tabs.create({ url: String(op.url), active: false, windowId: op.window_id as number | undefined ?? (await chrome.tabs.get(owner)).windowId, index: op.index as number | undefined }); break;
      case 'activate': await chrome.tabs.update(tabId, { active: true }); break;
      case 'pin': await chrome.tabs.update(tabId, { pinned: Boolean(op.pinned) }); break;
      case 'move': await chrome.tabs.move(tabId, { windowId: op.window_id as number | undefined, index: Number(op.index) }); break;
    }
  } else if (tool === 'browser_close_tabs') {
    await chrome.tabs.remove(tabId);
  } else if (tool === 'browser_delete_bookmarks') {
    const [node] = await chrome.bookmarks.get(String(op.id));
    if (node.url !== undefined) await chrome.bookmarks.remove(node.id);
    else await chrome.bookmarks.removeTree(node.id);
  } else if (tool === 'browser_manage_tab_groups') {
    switch (op.type) {
      case 'create': {
        const id = await chrome.tabs.group({ tabIds: op.tab_ids as [number, ...number[]] });
        await chrome.tabGroups.update(id, { title: op.title as string | undefined, color: op.color as chrome.tabGroups.Color | undefined }); break;
      }
      case 'update': await chrome.tabGroups.update(Number(op.group_id), { title: op.title as string | undefined, color: op.color as chrome.tabGroups.Color | undefined, collapsed: op.collapsed as boolean | undefined }); break;
      case 'move': await chrome.tabGroups.move(Number(op.group_id), { windowId: op.window_id as number | undefined, index: Number(op.index) }); break;
      case 'ungroup': await chrome.tabs.ungroup(op.tab_ids as [number, ...number[]]); break;
    }
  } else {
    switch (op.type) {
      case 'create': await chrome.bookmarks.create({ parentId: String(op.parent_id), title: String(op.title), url: op.url as string | undefined, index: op.index as number | undefined }); break;
      case 'update': await chrome.bookmarks.update(String(op.id), { title: String(op.title) }); break;
      case 'move': await chrome.bookmarks.move(String(op.id), { parentId: String(op.parent_id), index: op.index as number | undefined }); break;
    }
  }
}

/** Restore only changed bookmarks. Parents are recreated before children and IDs are remapped. */
async function restoreBookmarks(before: BookmarkState[], after: BookmarkState[], remap: Map<string, string>) {
  const id = (value: string) => remap.get(value) ?? value;
  const original = new Set(before.map(n => n.id));
  const added = after.filter(n => !original.has(n.id));
  for (const n of [...added].reverse()) {
    if (n.url !== undefined) await chrome.bookmarks.remove(id(n.id));
    else await chrome.bookmarks.removeTree(id(n.id));
  }
  const existing = new Set(after.map(n => n.id));
  for (const n of before) {
    if (!existing.has(n.id)) {
      const created = await chrome.bookmarks.create({ parentId: n.parentId ? id(n.parentId) : undefined, title: n.title, url: n.url, index: n.index });
      remap.set(n.id, created.id);
    }
  }
  for (const n of before) {
    const current = after.find(x => x.id === n.id);
    if (!current || n.parentId === undefined || n.parentId === '0') continue;
    if (n.title !== current.title) await chrome.bookmarks.update(id(n.id), { title: n.title });
    if (n.parentId !== current.parentId || n.index !== current.index) await chrome.bookmarks.move(id(n.id), { parentId: id(n.parentId), index: n.index });
  }
}

/** Layout restoration does not claim to restore the runtime state of a closed web page. */
async function restoreTabs(before: Snapshot, after: Snapshot, remap: Map<string, string>) {
  const id = (n: number) => Number(remap.get(`tab:${n}`) ?? n);
  const gid = (n: number) => Number(remap.get(`group:${n}`) ?? n);
  const old = before.tabs!, now = after.tabs!;
  for (const t of now.filter(t => !old.some(o => o.id === t.id))) await chrome.tabs.remove(id(t.id));
  for (const t of old.filter(t => !now.some(o => o.id === t.id))) {
    if (!/^https?:\/\//i.test(t.url)) throw new Error('This closed page cannot be reopened by the extension.');
    const created = await chrome.tabs.create({ url: t.url, windowId: t.windowId, index: t.index, pinned: t.pinned, active: false });
    remap.set(`tab:${t.id}`, String(created.id));
  }
  // Unpin/ungroup changed members before moving; untouched tabs stay in their groups.
  for (const t of old) {
    const previous = now.find(n => n.id === t.id);
    const current = await chrome.tabs.get(id(t.id));
    if (current.groupId !== -1 && (current.groupId !== gid(t.groupId) || current.windowId !== t.windowId)) await chrome.tabs.ungroup(id(t.id));
    if (!previous || previous.pinned !== t.pinned) await chrome.tabs.update(id(t.id), { pinned: t.pinned });
  }
  /**
   * The host tab is reordered here too — it is the one place where that is allowed.
   *
   * Forward operations can never move it (`validateTargets`), but they move it *anyway*:
   * shifting any other tab past it changes its index. Leaving it pinned in place made
   * restoration unable to converge on the recorded layout — the tab it refused to move
   * was the one blocking every other tab from reaching its old position — and the run
   * then failed its own verification with "restoration did not fully match", after
   * having spent the batch's single undo attempt.
   *
   * The position is the only thing being restored, and only to one the browser was
   * already in: `prepare` rejects any batch where the host's window or group differs
   * between before and after, so this cannot move it out of its window or into a group.
   */
  for (const t of [...old].sort((a, b) => a.windowId - b.windowId || a.index - b.index)) {
    const current = await chrome.tabs.get(id(t.id));
    if (current.windowId !== t.windowId || current.index !== t.index) await chrome.tabs.move(id(t.id), { windowId: t.windowId, index: t.index });
  }
  for (const g of before.groups ?? []) {
    const members = old.filter(t => t.groupId === g.id).map(t => id(t.id));
    if (!members.length) continue;
    const exists = (await chrome.tabGroups.query({})).some(x => x.id === gid(g.id));
    if (!exists) {
      const newId = await chrome.tabs.group({ tabIds: members as [number, ...number[]] });
      remap.set(`group:${g.id}`, String(newId));
    } else {
      const missing: number[] = [];
      for (const tab of members) if ((await chrome.tabs.get(tab)).groupId !== gid(g.id)) missing.push(tab);
      if (missing.length) await chrome.tabs.group({ groupId: gid(g.id), tabIds: missing as [number, ...number[]] });
    }
    const current = await chrome.tabGroups.get(gid(g.id));
    if (current.title !== g.title || current.color !== g.color || current.collapsed !== g.collapsed) {
      await chrome.tabGroups.update(gid(g.id), { title: g.title, color: g.color as chrome.tabGroups.Color, collapsed: g.collapsed });
    }
  }
  for (const t of old) {
    if (t.active && !(await chrome.tabs.get(id(t.id))).active) await chrome.tabs.update(id(t.id), { active: true });
  }
}
function remapped(s: Snapshot, map: Map<string, string>): Snapshot {
  const tab = (n: number) => Number(map.get(`tab:${n}`) ?? n);
  const group = (n: number) => Number(map.get(`group:${n}`) ?? n);
  return {
    ...(s.tabs ? { tabs: s.tabs.map(t => ({ ...t, id: tab(t.id), groupId: group(t.groupId) })).sort((a, b) => a.id - b.id) } : {}),
    ...(s.groups ? { groups: s.groups.map(g => ({ ...g, id: group(g.id) })).sort((a, b) => a.id - b.id) } : {}),
    ...(s.bookmarks ? { bookmarks: s.bookmarks.map(n => ({ ...n, id: map.get(n.id) ?? n.id, parentId: n.parentId ? map.get(n.parentId) ?? n.parentId : undefined })) } : {}),
  };
}
function undoNeedsGroups(batch: Batch) {
  return batch.steps.some(s => stable(s.before.groups) !== stable(s.after?.groups)
    || s.before.tabs?.some(t => (s.after?.tabs?.find(a => a.id === t.id)?.groupId ?? -1) !== t.groupId));
}
/**
 * The tier of undoing a batch, which is not the tier of the batch.
 *
 * Undo is usually the safer direction, but not always: undoing "created three bookmark
 * folders" deletes those three folders, and the user may have put things in them since.
 * So the question is what the *undo* has to do — and re-creating something is the only
 * forward operation whose inverse destroys anything.
 *
 * Groups do not count. Removing a group the batch created leaves its tabs alone; the
 * group is a container, and losing it costs a name and a colour.
 */
function undoTier(batch: Batch): Tier {
  const removesObjects = batch.steps.some(step => (['tabs', 'bookmarks'] as const).some(kind => {
    const before = new Set((step.before[kind] ?? []).map(o => String(o.id)));
    return (step.after?.[kind] ?? []).some(o => !before.has(String(o.id)));
  }));
  return removesObjects ? 'lossy' : 'low';
}
/**
 * Operation params that are an id and nothing else.
 *
 * Dropped from the card rather than translated. Each one is either already spelled out by
 * `targets` (`tab_id`, `tab_ids`, `id`, `group_id`) or resolved to a name of its own below
 * (`parent_id` → `folder`, `window_id` → `window`). What the card used to do with them was
 * print the number again under a label — `Object: 53` for the very bookmark named on the
 * line above it.
 */
const ID_PARAMS = new Set(['tab_id', 'tab_ids', 'id', 'group_id', 'parent_id', 'window_id']);

/**
 * Resolves ids to the things the user can actually see, for one batch.
 *
 * Built once per preview because every lookup reads the same snapshot: `batch.before` is a
 * complete picture (the entire bookmark tree, every non-incognito tab and group), so a
 * miss here means the object genuinely is not there — a tab an undo is about to reopen,
 * for instance — and the field is then simply left out rather than guessed at.
 */
function describer(batch: Batch) {
  const tabs = batch.before.tabs ?? [];
  const bookmarks = batch.before.bookmarks ?? [];
  const groups = batch.before.groups ?? [];
  /*
    Windows are numbered rather than named, because Chrome does not name them. The order is
    by id, which is allocation order — near enough to the order they were opened that
    "window 2" stays put across every line of one card, which is the property that matters.
    A single-window browser gets no ordinal at all: "window 1" is noise when there is no
    window 2 to tell it apart from.
  */
  const windows = [...new Set(tabs.map(t => t.windowId))].sort((a, b) => a - b);
  const host = tabs.find(t => t.id === batch.owner)?.windowId;
  const ordinal = (windowId?: number) => {
    const at = windows.indexOf(windowId!);
    return windows.length > 1 && at >= 0 ? at + 1 : undefined;
  };
  const inWindow = (windowId?: number): Placement =>
    windowId !== undefined && windowId === host ? { hostWindow: true } : { window: ordinal(windowId) };
  // `''` is a real answer here — an unnamed group still needs saying, and the card has the
  // wording for it. Only a tab outside every group (`-1`) has no group at all.
  const groupName = (groupId?: number) =>
    groupId === undefined || groupId === -1 ? undefined : groups.find(g => g.id === groupId)?.title ?? '';
  // A root folder's title is empty, and "in ''" says less than nothing.
  const folderName = (parentId?: string) => bookmarks.find(b => b.id === parentId)?.title || undefined;

  const placeTab = (tab: TabState): Placement => ({
    ...inWindow(tab.windowId),
    group: groupName(tab.groupId),
    position: tab.index + 1,
    ...(tab.pinned ? { pinned: true } : {}),
    url: tab.url,
  });
  const placeBookmark = (mark: BookmarkState): Placement => ({
    folder: folderName(mark.parentId),
    position: mark.index === undefined ? undefined : mark.index + 1,
    url: mark.url,
  });
  /** A snapshot row of any kind. `kind` is what says which, so nothing is inferred here. */
  const place = (kind: string, row?: unknown): Placement | undefined => {
    if (!row) return undefined;
    if (kind === 'tabs') return placeTab(row as TabState);
    if (kind === 'bookmarks') return placeBookmark(row as BookmarkState);
    return inWindow((row as GroupState).windowId);
  };

  return {
    /** One operation's params, ids resolved, positions counted from 1, `type` removed. */
    details: (op: Operation): Record<string, string | number | boolean> => {
      const out: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(op)) {
        if (key === 'type' || value === undefined || ID_PARAMS.has(key)) continue;
        // `index` is the one param the user reads as a place rather than a value, and
        // Chrome counts it from 0. Renamed as well as shifted, so the card's label for it
        // is the same one it uses for a target's position.
        if (key === 'index') out.position = Number(value) + 1;
        else out[key] = value as string | number | boolean;
      }
      const folder = folderName(op.parent_id as string | undefined);
      if (folder !== undefined) out.folder = folder;
      const group = groupName(op.group_id as number | undefined);
      if (group !== undefined) out.group = group;
      const window = ordinal(op.window_id as number | undefined);
      if (window !== undefined) out.window = window;
      return out;
    },
    target: (kind: 'tabs' | 'bookmarks', row: TabState | BookmarkState): PreviewTarget =>
      ({ title: row.title, ...place(kind, row) }),
    place,
  };
}

function preview(batch: Batch, undo?: Batch): PlanPreview {
  const describe = describer(batch);
  return {
    id: batch.id, count: batch.operations.length,
    tier: undo ? undoTier(undo) : tierOf(batch.tool),
    items: batch.operations.map((op, index) => {
      const subtree = new Set<string>();
      if (op.type === 'delete' && typeof op.id === 'string') {
        subtree.add(op.id);
        for (const b of batch.before.bookmarks ?? []) if (b.parentId && subtree.has(b.parentId)) subtree.add(b.id);
      }
      /*
        ⚠️ A move's destination folder is deliberately *not* a target. It used to be matched
        in here alongside the bookmark being moved, which put the folder the user is moving
        something *into* on the same list as the things being moved — indistinguishable, and
        for a `create` it was the only entry, so the card claimed one object would be
        affected and then named the wrong one. The destination is a detail now (`folder`).
      */
      const kind = batch.before.tabs ? 'tabs' : 'bookmarks';
      const targets: Array<TabState | BookmarkState> = batch.before.tabs?.filter(t => t.id === op.tab_id || (op.tab_ids as number[] | undefined)?.includes(t.id) || (op.group_id !== undefined && t.groupId === op.group_id))
        ?? batch.before.bookmarks?.filter(b => subtree.has(b.id) || b.id === op.id) ?? [];
      const changes = undo?.steps[undo.steps.length - index - 1].changes;
      return {
        type: op.type, details: describe.details(op),
        targetCount: targets.length,
        targets: targets.slice(0, 100).map(row => describe.target(kind, row)),
        ...(undo ? {
          undo: true,
          changes: changes?.slice(0, 100).map(c => ({
            // Named by what it is. The row carries the title on whichever side exists —
            // a tab being reopened has no current state, and a created one no prior state.
            title: ((c.after ?? c.before) as { title?: string } | undefined)?.title ?? '',
            from: describe.place(c.kind, c.after),
            to: describe.place(c.kind, c.before),
          })),
        } : {}),
      };
    }),
    undo: !!batch.undoOf,
  };
}
async function prepare(tool: string, params: Record<string, string>, owner: number) {
  let undo: Batch | undefined;
  if (tool === 'browser_undo_changes') {
    undo = await localAudit.get(params.batch_id);
    if (!undo || undo.undoOf || undo.undoneBy || !['applied', 'failed'].includes(undo.status) || !undo.steps.length || undo.steps.some(s => s.status !== 'applied')) throw new Error('This batch cannot be undone automatically.');
    if (undo.before.tabs && undo.epoch !== await epoch()) throw new Error('Tab undo is unavailable after a browser restart.');
    tool = undo.tool;
  }
  await requireTool(tool);
  const before = await snapshot(tool);
  const operations = undo ? [...undo.steps].reverse().map(s => s.operation) : parseOperations(tool, params.operations);
  if (undo) {
    if (before.tabs && undoNeedsGroups(undo)) await requireCaps(['tabGroups.write']);
    // Scoped by the original batch: those are the windows the restoration will work in.
    if (!matches(before, undo.steps.at(-1)!.after!, scopeOf(undo.operations, undo.before, owner, true))) throw new Error('The browser has changed since this batch. Undo would overwrite newer changes.');
    // Recreated/reordered host tabs are never allowed, including an old batch from another host.
    if (before.tabs && undo.steps.some(s => {
      const a = s.before.tabs?.find(t => t.id === owner), b = s.after?.tabs?.find(t => t.id === owner);
      return !!a !== !!b || (a && b && (a.windowId !== b.windowId || a.groupId !== b.groupId));
    })) throw new Error('Undo would remove or regroup the Agent host tab.');
  } else for (const op of operations) validateTargets(tool, op, before, owner);
  const batch: Batch = { id: crypto.randomUUID(), owner, epoch: await epoch(), tool, operations, before, createdAt: Date.now(), status: 'prepared', steps: [], ...(undo ? { undoOf: undo.id } : {}) };
  // Awaited before the preview is shown: a plan the journal never accepted must not be
  // approvable, because approval is what makes it executable.
  await localAudit.insert(batch);
  return preview(batch, undo);
}
async function commit(planId: string, owner: number) {
  const batch = await localAudit.get(planId);
  if (!batch || batch.owner !== owner) throw new Error('Unknown plan or wrong host.');
  if (batch.status !== 'prepared') throw new Error('This plan has already been attempted. Read its audit record; do not retry it.');
  if (batch.epoch !== await epoch() || Date.now() - batch.createdAt > 600000) throw new Error('Plan expired. Prepare and approve a new plan.');
  await requireTool(batch.tool);
  const scope = scopeOf(batch.operations, batch.before, owner, !!batch.undoOf);
  if (!matches(batch.before, await snapshot(batch.tool), scope)) throw new Error('The browser changed after preview. Prepare and approve a new plan.');
  const undo = batch.undoOf ? await localAudit.get(batch.undoOf) : undefined;
  if (batch.undoOf && !undo) throw new Error('Original batch is missing.');
  if (undo && batch.before.tabs && undoNeedsGroups(undo)) await requireCaps(['tabGroups.write']);
  if (undo?.undoneBy) throw new Error('This batch already has an undo attempt.');
  batch.status = 'applying';
  await localAudit.patch(batch.id, { status: batch.status });
  if (undo) { undo.undoneBy = batch.id; await localAudit.patch(undo.id, { undoneBy: batch.id }); }
  active.add(planId);
  owners.set(planId, owner);
  const map = new Map<string, string>();
  /**
   * The scope, plus whatever this run has re-created so far.
   *
   * Re-created tabs join `targeted` as well as `reopened`: they are the objects the
   * restoration is about, and a tab that did not exist when the scope was computed cannot
   * have been named by it.
   */
  const scoped = (): Scope => {
    const reopened = new Set([...map].filter(([key]) => key.startsWith('tab:')).map(([, id]) => Number(id)));
    return { ...scope, targeted: new Set([...scope.targeted, ...reopened]), reopened };
  };
  let expected = batch.before;
  try {
    for (const [index, op] of batch.operations.entries()) {
      if (cancelled.has(planId)) throw new Error('Stopped. Completed steps were retained.');
      await requireTool(batch.tool);
      if (undo && batch.before.tabs && undoNeedsGroups(undo)) await requireCaps(['tabGroups.write']);
      const before = await snapshot(batch.tool);
      if (!matches(expected, before, scoped())) throw new Error('External changes detected. Remaining steps were stopped.');
      if (!undo) validateTargets(batch.tool, op, before, owner);
      const step: Batch['steps'][number] = { operation: op, before, status: 'applying' };
      batch.steps.push(step);
      // Its own row, written before the Chrome call. A reload in the middle of a write is
      // the one situation nothing else can reconstruct, and this row is the only evidence.
      await localAudit.insertStep(batch.id, index, step);
      if (undo) {
        const original = undo.steps[undo.steps.length - index - 1];
        if (original.before.bookmarks) await restoreBookmarks(original.before.bookmarks, original.after!.bookmarks!, map);
        else {
          // Restoration can change membership, even for a batch that only arranged tabs.
          await restoreTabs(original.before, original.after!, map);
        }
      } else await apply(batch.tool, op, owner);
      step.after = await snapshot(batch.tool);
      step.changes = diff(step.before, step.after);
      step.status = 'applied';
      if (undo) {
        const target = remapped(undo.steps[undo.steps.length - index - 1].before, map);
        if (!matches(target, step.after, scoped())) throw new Error('Restoration did not fully match the saved state. Inspect the result before continuing.');
      }
      expected = step.after;
      // The outcome of a step that already happened. Failing to record it is exactly the
      // `unknown` case: the browser moved and we cannot prove where it landed.
      try { await localAudit.updateStep(batch.id, index, step); }
      catch (error) {
        step.status = 'unknown';
        await localAudit.updateStep(batch.id, index, step).catch(() => { /* Already failing. */ });
        throw error;
      }
    }
    batch.status = 'applied';
    if (undo) { undo.status = 'undone'; await localAudit.patch(undo.id, { status: undo.status }); }
  } catch (error) {
    const pending = batch.steps.at(-1);
    if (pending?.status === 'applying') {
      pending.status = 'unknown';
      await localAudit.updateStep(batch.id, batch.steps.length - 1, pending).catch(() => { /* Best effort. */ });
    }
    batch.status = pending?.status === 'unknown' ? 'unknown' : 'failed';
    batch.error = error instanceof Error ? error.message : 'Browser operation failed.';
  } finally { active.delete(planId); owners.delete(planId); cancelled.delete(planId); }
  await localAudit.patch(batch.id, { status: batch.status, error: batch.error ?? null });
  /**
   * `undoneBy` is a claim, not a verdict — so release it when the attempt never began.
   *
   * It is written before the first step so that two undo attempts cannot race, and it
   * used to stay written whatever happened next. A conflict or a revoked permission at
   * step one therefore spent the batch's single undo without restoring anything, and the
   * batch was marked un-undoable for good: `prepare` answered "this batch cannot be
   * undone automatically" forever, for a reason that had already gone away.
   *
   * Released only when **no step row was ever created**. Past that the browser has been
   * touched — a step at `applied` changed something, and one at `unknown` might have —
   * and a second attempt would be working from a state neither we nor the user can
   * describe. Zero steps is the only case where nothing happened.
   */
  if (undo && !batch.steps.length && batch.status !== 'applied') {
    await localAudit.patch(undo.id, { undoneBy: null });
  }
  /**
   * What the AI is told: the verdict per step, and where to look for the rest.
   *
   * It used to carry up to ten full before/after objects per step. Thirty steps of that is
   * tens of kilobytes of JSON going into a composer with a 31,998-character ceiling — so
   * the payload got truncated, and what the model actually read was a result cut off
   * mid-object. None of it was needed: `browser_query_changes` pages the same records on
   * demand, which is what it exists for.
   */
  return {
    batch_id: batch.id, status: batch.status, error: batch.error,
    completed: batch.steps.filter(s => s.status === 'applied').length, planned: batch.operations.length,
    steps: batch.steps.map(s => ({ operation: s.operation, status: s.status, change_count: s.changes?.length ?? 0 })),
    ...(batch.status === 'applied' ? {} : { detail: `Use browser_query_changes with batch_id "${batch.id}" to read what changed, step by step. Do not retry this batch.` }),
  };
}

async function read(tool: string, params: Record<string, string>, owner: number) {
  if (!(READ_TOOLS as readonly string[]).includes(tool)) throw new Error('Unknown read tool.');
  await requireTool(tool);
  const windowId = numberParam(params.window_id, (await chrome.tabs.get(owner)).windowId);
  if (tool === 'browser_list_tabs') {
    return page((await chrome.tabs.query({ windowId })).filter(t => !t.incognito).map(t => ({ id: t.id, window_id: t.windowId, index: t.index, title: t.title, url: tabUrl(t), group_id: t.groupId, pinned: t.pinned, active: t.active, protected: t.id === owner })), params);
  }
  if (tool === 'browser_list_tab_groups') {
    if ((await chrome.windows.get(windowId)).incognito) throw new Error('Private windows are excluded.');
    return page(await chrome.tabGroups.query({ windowId }), params);
  }
  if (tool === 'browser_list_bookmarks') {
    const nodes = params.query ? await chrome.bookmarks.search(params.query.slice(0, 500)) : await chrome.bookmarks.getChildren(params.parent_id || '0');
    return page(nodes.map(n => ({ id: n.id, parent_id: n.parentId, index: n.index, title: n.title, url: n.url, folder: n.url === undefined, managed: !!n.unmodifiable })), params);
  }
  /**
   * Which capabilities are readable, asked once.
   *
   * This used to be re-asked per record — a settings read plus a `permissions.contains`
   * for every batch in the list — and the answer cannot differ between two records.
   */
  const readable = new Set<Capability>();
  for (const cap of ['tabs.read', 'tabGroups.read', 'bookmarks.read'] as const) {
    try { await requireCaps([cap]); readable.add(cap); } catch { /* Revoked capabilities also hide historical data. */ }
  }
  const readableKinds = new Set(([['tabs', 'tabs.read'], ['groups', 'tabGroups.read'], ['bookmarks', 'bookmarks.read']] as const)
    .filter(([, cap]) => readable.has(cap)).map(([kind]) => kind));
  const session = await epoch();
  const visible = [];
  for (const b of await localAudit.list(params.batch_id || undefined)) {
    const cap = toolCapability(b.tool);
    if (cap && !readable.has(readCapability(cap))) continue;
    visible.push({ batch_id: b.id, created_at: b.createdAt, tool: b.tool, status: b.status, error: b.error, undo_of: b.undoOf, undone_by: b.undoneBy,
      can_undo: !b.undoOf && !b.undoneBy && ['applied', 'failed'].includes(b.status) && b.steps > 0 && b.applied === b.steps && (!b.touchesTabs || b.epoch === session),
      completed: b.applied, planned: b.planned,
      // Steps and object-level changes are only loaded when the caller asked for one
      // batch: they are the two columns that carry snapshots.
      ...(params.batch_id ? { steps: (await localAudit.listSteps(b.id)).map(s => ({ step_index: s.index, operation: s.operation, status: s.status, change_count: s.changeCount })),
        ...(params.step_index !== undefined ? { changes: page((await localAudit.stepChanges(b.id, numberParam(params.step_index, 0))).filter(c => readableKinds.has(c.kind as 'tabs' | 'groups' | 'bookmarks')), params) } : {}) } : {}),
    });
  }
  return page(visible, params.batch_id ? { limit: '1' } : params);
}

export async function handleBrowserAgent(request: BrowserRequest, sender: MessageSender) {
  try {
    if (!isChromeBuild()) throw new Error('Browser Agent currently supports Chrome only.');
    const owner = sender.tab?.id;
    const origin = new URL(sender.url ?? sender.tab?.url ?? '').origin;
    const settingsPage = sender.url === chrome.runtime.getURL('browser-agent-settings.html');
    const host = owner !== undefined && !sender.tab?.incognito && ['https://gemini.google.com', 'https://aistudio.google.com'].includes(origin);
    if (sender.id !== chrome.runtime.id || (!host && !(settingsPage && ['settings', 'configure'].includes(request.action)))) throw new Error('Unsupported Browser Agent host.');
    if (request.action === 'open-settings') {
      // Focus the window already showing this instead of stacking another one: the panel
      // link is the kind of thing people click twice when the first click seems slow.
      const existing = (await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] }))
        .find(w => w.tabs?.some(t => t.url === chrome.runtime.getURL('browser-agent-settings.html')));
      if (existing?.id !== undefined) await chrome.windows.update(existing.id, { focused: true });
      // Sized to the content, which is now three switches and a button. The old
      // 540×720 was measured against a page of explanatory paragraphs.
      else await chrome.windows.create({ url: chrome.runtime.getURL('browser-agent-settings.html'), type: 'popup', width: 460, height: 420 });
      return { success: true };
    }
    if (request.action === 'cancel') {
      await journalReady(owner);
      const plan = await localAudit.get(request.planId);
      if (!plan || plan.owner !== owner) throw new Error('Unknown plan or wrong host.');
      if (active.has(plan.id) || plan.status === 'applying') cancelled.add(plan.id);
      else if (plan.status === 'prepared') await localAudit.patch(plan.id, { status: 'failed', error: 'Cancelled before execution.' });
      return { success: true };
    }
    if (request.action === 'configure') {
      if (!request.settings || !Array.isArray(request.settings.capabilities) || request.settings.capabilities.some(c => !CAPABILITIES.includes(c)) || typeof request.settings.shareFullUrls !== 'boolean') throw new Error('Invalid settings.');
      const caps = [...new Set(request.settings.capabilities.flatMap(dependencies))];
      if (caps.length && !await chrome.permissions.contains({ permissions: permissionsFor(caps) })) throw new Error('Grant Chrome permissions first.');
      // The settings themselves now live in `storage.local`, so writing them *is* the
      // notification every other context needs. The separate version key it used to bump
      // existed only because the record was in a database nothing could observe.
      await localAudit.saveSettings({ ...request.settings, capabilities: caps });
    }
    if (request.action === 'settings' || request.action === 'configure') {
      const settings = await localAudit.settings();
      const capabilities: Capability[] = [];
      for (const cap of settings.capabilities) if (await chrome.permissions.contains({ permissions: permissionsFor(dependencies(cap)) })) capabilities.push(cap);
      return { success: true, data: { ...settings, capabilities } };
    }
    // Outside the queue: opening a database is not work that needs serialising, and a
    // cold start would otherwise hold up whatever is already queued behind it.
    await journalReady(owner);
    const work = async () => {
      const result = request.action === 'read' ? await read(request.tool, request.params, owner!)
        : request.action === 'prepare' ? await prepare(request.tool, request.params, owner!)
        : request.action === 'commit' ? await commit(request.planId, owner!)
        : (() => { throw new Error('Unknown browser request.'); })();
      return publicData(result, (await localAudit.settings()).shareFullUrls);
    };
    const result = queue.then(work, work);
    queue = result.catch(() => {});
    return { success: true, data: await result };
  } catch (error) {
    // Chrome error strings can contain full URLs. Always sanitize errors.
    return { success: false, error: publicData(error instanceof Error ? error.message : 'Browser operation failed.', false) };
  }
}

chrome.tabs.onRemoved.addListener(tabId => {
  for (const [id, owner] of owners) if (owner === tabId) cancelled.add(id);
});
chrome.tabs.onUpdated.addListener((tabId, changes) => {
  if (changes.status === 'loading' || changes.url) {
    for (const [id, owner] of owners) if (owner === tabId) cancelled.add(id);
  }
});
