import {
  CAPABILITIES, READ_TOOLS, RESTORE_SIDES, RESTORE_TOOL, dependencies, permissionsFor,
  toolCapability, parseOperations, publicData, isChromeBuild, isTabTool, readCapability,
  tierOf, type BatchTrees, type Batch, type BrowserRequest, type Snapshot, type Operation,
  type Capability, type OperationsPlan, type RestoreEffects, type RestorePlan,
  type RestoreSide, type BookmarkState, type TabState, type GroupState, type Placement,
  type PreviewTarget, type TreeEffect, type TreeNode,
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
 * Whether the objects one operation names are still the objects it was approved for.
 *
 * Run against a fresh snapshot before every step, and it is the **only** thing standing
 * between an approval and the browser. There is deliberately no check that the browser as
 * a whole held still: someone organizing eighty tabs is using their browser while it
 * happens, so opening a tab, switching windows or letting a page finish loading has to be
 * free. Those cannot make any operation here land on the wrong object — an object is named
 * by id, and this function is what confirms the id still means what it did.
 *
 * The exception is `url`, checked for a close in `precondition` below: closing a tab means
 * closing the page that was in it, and that is the one operation where being off by a
 * navigation destroys something.
 */
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
/**
 * The one field whose *value* an approval is bound to.
 *
 * A tab is approved for closing by what was in it, not by its id. Ids get reused within a
 * session and a tab can navigate on its own between the preview and the click, and either
 * way what the user agreed to lose is the page they were shown. Nothing else is compared:
 * a moved or pinned tab is still that tab whatever it has loaded since.
 */
function checkCloseTarget(op: Operation, before: Snapshot, live: Snapshot) {
  const id = Number(op.tab_id);
  const approved = before.tabs?.find(t => t.id === id);
  const now = live.tabs?.find(t => t.id === id);
  if (!approved || !now || approved.url !== now.url) {
    throw new Error('This tab now holds a different page. Prepare and approve a new plan.');
  }
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

/**
 * Restoring is **additive**, and that is the whole contract.
 *
 * A recorded state is put back — objects that went missing are re-created, objects that
 * moved go back to where they were, names and colours are set again — and **nothing is
 * ever removed**. Whatever exists now and is not in the snapshot survives, keeping its
 * contents, and ends up ordered after the restored objects.
 *
 * That makes the direction safe in a way the alternative is not. Making the browser *equal*
 * to a snapshot means closing the tabs someone opened since, and "put my tabs back the way
 * they were" is not a request to throw away the last ten minutes of browsing. It also means
 * restoring never deletes and so is never destructive, which is why it needs no tier of its
 * own and can be repeated as often as the user likes with the same result.
 *
 * The cost, stated in the approval card and nowhere hidden: the result is the snapshot
 * *plus* whatever is new, so the tree on screen is what gets restored rather than
 * everything that will be there afterwards.
 */

/**
 * What a tab restore has to know about the browser it is being put back into.
 *
 * ⚠️ `sameSession` decides how much of the recorded state still *names* anything. Tab,
 * window and group ids are handed out per browser run and start over at the next one, so
 * across a restart a recorded id is not merely missing — it may well name a different
 * object now. Every id match below is gated on it, and the address- and
 * membership-based fallbacks beside them are what carry a restore across a restart.
 */
interface RestoreContext {
  /** The tab the sidebar is in now. */
  owner: number;
  /** The tab it was in when the state was recorded. Its window anchors the mapping. */
  recordedOwner: number;
  sameSession: boolean;
}
/** The host tab, then and now, when the recorded state still contains it. */
interface HostPair { recorded: number; live: number; recordedWindow: number; liveWindow: number }
/**
 * Which object standing in the browser right now *is* each recorded one.
 *
 * Ids answer this within one browser session, whenever they still exist. When they do not —
 * a tab was closed, a bookmark was deleted, the browser was restarted — an object that
 * looks the same is treated as the same, matched once each so two recorded tabs of one URL
 * still need two tabs.
 *
 * ⚠️ Without this, restoring is not repeatable. Re-creating an object gives it a new id, so
 * a second restore of the same state would find the recorded id missing again and make
 * another copy — and the user's own reopening of a tab would be duplicated too. Adopting the
 * lookalike makes running a restore twice land where running it once does.
 */
function pairTabs(want: TabState[], live: chrome.tabs.Tab[], sameSession: boolean, host?: HostPair): Map<number, number> {
  const pairs = new Map<number, number>();
  const claimed = new Set<number>();
  /*
    The host tab is paired first and by role rather than by id or address: it is the one
    object whose identity is known independently of the ids, and its window is what anchors
    every other window across a restart. Left to the address pass it could be claimed by
    some *other* recorded tab of the same address, and then the restore would move the
    sidebar — the one thing §13 does not allow.
  */
  if (host) { pairs.set(host.recorded, host.live); claimed.add(host.live); }
  if (sameSession) {
    for (const t of want) {
      if (pairs.has(t.id) || claimed.has(t.id) || !live.some(x => x.id === t.id)) continue;
      pairs.set(t.id, t.id);
      claimed.add(t.id);
    }
  }
  for (const t of want) {
    if (pairs.has(t.id)) continue;
    const adopted = live.find(x => !claimed.has(x.id!) && tabUrl(x) === t.url);
    if (!adopted) continue;
    pairs.set(t.id, adopted.id!);
    claimed.add(adopted.id!);
  }
  return pairs;
}
/**
 * Which live window each recorded one is. Absent means "build it again".
 *
 * ⚠️ A window is the one thing in a recorded state with **nothing to recognise it by** —
 * no address, no title, no members that are certainly still its own. So there are exactly
 * two answers: the id, inside the session that issued it, and the host tab's window, which
 * stands in for the window the host was recorded in because the host is not allowed to move
 * out of it anyway. Everything else is built from scratch.
 *
 * The identity pass runs first, so the anchor can only fill a window that pass left empty —
 * which after a restart is all of them. Where the two would disagree, `resolveRestore`
 * refuses rather than picking one: the sidebar has moved since the recording, and dragging
 * a whole window's tabs after it is not what "put this back" means.
 */
function pairWindows(want: TabState[], live: chrome.tabs.Tab[], sameSession: boolean, host?: HostPair): Map<number, number> {
  const map = new Map<number, number>();
  if (sameSession) {
    const alive = new Set(live.map(t => t.windowId));
    for (const t of want) if (alive.has(t.windowId)) map.set(t.windowId, t.windowId);
  }
  if (host && !map.has(host.recordedWindow)) map.set(host.recordedWindow, host.liveWindow);
  return map;
}
/**
 * Which live group each recorded one is.
 *
 * A group is recognised by the tabs in it once its id stops meaning anything. That is what
 * keeps a cross-session restore repeatable: re-creating a group gives it a new id, so
 * without this a second restore would build another group beside the first and pull the
 * members over into it.
 *
 * Unanimity is required — every mapped member that is grouped has to be in the *same* live
 * group — because anything less is a guess, and the fallback (a new group) is both correct
 * and visible in the preview.
 */
function pairGroups(target: Snapshot, pairs: Map<number, number>, live: chrome.tabs.Tab[], liveGroups: chrome.tabGroups.TabGroup[], sameSession: boolean): Map<number, number> {
  const map = new Map<number, number>();
  const byId = new Map(live.map(t => [t.id!, t]));
  for (const g of target.groups ?? []) {
    if (sameSession && liveGroups.some(x => x.id === g.id)) { map.set(g.id, g.id); continue; }
    const holders = new Set((target.tabs ?? [])
      .filter(t => t.groupId === g.id)
      .map(t => byId.get(pairs.get(t.id) ?? -1)?.groupId)
      .filter((id): id is number => id !== undefined && id !== -1));
    if (holders.size === 1) map.set(g.id, [...holders][0]);
  }
  return map;
}
/**
 * Everything a tab restore decides before it moves anything.
 *
 * ⚠️ One resolution, two callers: `inspectRestore` previews from it and `restoreTabs`
 * executes from it. That is the only way a badge on a row and what actually happens to that
 * row can be guaranteed to agree — a preview computed by a second model of the restore is a
 * preview that lies.
 *
 * The host guard lives here for the same reason. It is a precondition of the whole restore,
 * and running it from both callers means the preview can refuse before the user approves
 * *and* the commit re-checks against a browser that may have moved since.
 */
async function resolveRestore(target: Snapshot, ctx: RestoreContext) {
  const live = (await chrome.tabs.query({})).filter(t => !t.incognito);
  const liveGroups = await chrome.tabGroups.query({});
  const want = target.tabs ?? [];
  const liveHost = live.find(t => t.id === ctx.owner);
  const recordedHost = want.find(t => t.id === ctx.recordedOwner);
  /*
    ⚠️ An anchor is only wanted when the recorded host id does not already name a live tab —
    after a restart, or when the sidebar has been reopened in a new tab since. While that id
    still names something, declaring some *other* live tab to be the recorded host would
    reorder the wrong sidebar and leave the real one counted as a newcomer.
  */
  const host: HostPair | undefined = liveHost && recordedHost
    && (!ctx.sameSession || !live.some(t => t.id === ctx.recordedOwner))
    ? { recorded: recordedHost.id, live: liveHost.id!, recordedWindow: recordedHost.windowId, liveWindow: liveHost.windowId }
    : undefined;
  const pairs = pairTabs(want, live, ctx.sameSession, host);
  const windows = pairWindows(want, live, ctx.sameSession, host);
  const groups = pairGroups(target, pairs, live, liveGroups, ctx.sameSession);
  /*
    §13, checked against what the mapping actually resolved to rather than against raw ids.
    The host tab may be reordered inside its window — every other tab reaching its recorded
    position depends on it — but never moved to another window. A mismatch here means the
    user has moved the sidebar since the recording, and dragging it home is not something
    "put this state back" is allowed to do; nor is there a way to leave it out, since every
    other tab of that window is going somewhere the host is not.
  */
  const guarded = host ? recordedHost : ctx.sameSession ? want.find(t => t.id === ctx.owner) : undefined;
  if (liveHost && guarded && windows.get(guarded.windowId) !== liveHost.windowId) {
    throw new Error('Restoring this state would move the Agent host tab to another window.');
  }
  /**
   * Whether the host tab's group is being left as it is because the snapshot disagrees.
   *
   * ⚠️ Skipped, not refused. §13 says the host is **not in the organizing scope at all**, so
   * "the snapshot wants it in a group it is not in" is a requirement that does not apply to
   * it rather than a conflict to stop over — and refusing made a whole batch unrestorable
   * for a reason that had nothing to do with the tabs the user wanted back. The common way
   * in is mundane: the host sat in a group, the browser restarted without reopening that
   * group, and putting the state back would now mean creating one and moving the sidebar in.
   *
   * Both directions, since both are the same forbidden move: into a group it is not in, and
   * out of one it is in.
   */
  const hostGroupKept = !!liveHost && !!guarded
    && (guarded.groupId === -1 ? -1 : groups.get(guarded.groupId)) !== liveHost.groupId;
  const kept = new Set(pairs.values());
  /**
   * Where the first restored tab of a window goes.
   *
   * Past any pinned tab that is not in the snapshot: Chrome keeps pinned tabs at the front
   * of a window, so a newcomer that is pinned owns position 0 whatever we ask for. A window
   * that does not exist yet has none of them, hence zero.
   */
  const slotStart = (recordedWindow: number) => {
    const actual = windows.get(recordedWindow);
    return actual === undefined ? 0 : live.filter(t => t.windowId === actual && t.pinned && !kept.has(t.id!)).length;
  };
  return { live, liveGroups, pairs, windows, groups, kept, slotStart, hostGroupKept };
}
/** The same question for bookmarks, where a lookalike is a matching title and address. */
function pairBookmarks(want: BookmarkState[], live: BookmarkState[]): Map<string, string> {
  const pairs = new Map<string, string>();
  const claimed = new Set<string>();
  for (const n of want) {
    if (n.parentId === undefined || !live.some(x => x.id === n.id)) continue;
    pairs.set(n.id, n.id);
    claimed.add(n.id);
  }
  for (const n of want) {
    if (n.parentId === undefined || pairs.has(n.id)) continue;
    const adopted = live.find(x => !claimed.has(x.id) && x.title === n.title && x.url === n.url && x.parentId !== undefined);
    if (!adopted) continue;
    pairs.set(n.id, adopted.id);
    claimed.add(adopted.id);
  }
  return pairs;
}

/** Restore bookmarks additively. Parents are created before children and new ids remapped. */
async function restoreBookmarks(target: BookmarkState[], remap: Map<string, string>) {
  const id = (value: string) => remap.get(value) ?? value;
  const live = await bookmarkSnapshot();
  const pairs = pairBookmarks(target, live);
  for (const [recorded, actual] of pairs) if (recorded !== actual) remap.set(recorded, actual);
  const byId = new Map(live.map(n => [n.id, n]));
  /*
    Re-create what is gone. `target` is a pre-order walk of the tree, so a parent is always
    reached before its children and `remap` already holds its new id by the time a child
    needs it.
  */
  for (const n of target) {
    if (n.parentId === undefined || pairs.has(n.id)) continue;
    if (!pairs.has(n.parentId) && !byId.has(n.parentId)) throw new Error('The folder these bookmarks were in no longer exists.');
    const created = await chrome.bookmarks.create({ parentId: id(n.parentId), title: n.title, url: n.url });
    remap.set(n.id, created.id);
    // A folder just created is the destination for the children still to come.
    pairs.set(n.id, created.id);
  }
  for (const n of target) {
    if (n.parentId === undefined || n.unmodifiable) continue;
    const current = byId.get(id(n.id));
    if (current && current.title !== n.title) await chrome.bookmarks.update(id(n.id), { title: n.title });
  }
  /*
    Order per folder, by rewriting only the folders that are actually out of order.
    Positions are assigned from a running slot rather than the recorded index, so bookmarks
    added since are pushed to the end of the folder instead of displacing the restored ones.
  */
  const byParent = new Map<string, BookmarkState[]>();
  for (const n of target) {
    if (n.parentId === undefined || n.parentId === '0' || n.unmodifiable) continue;
    const siblings = byParent.get(n.parentId) ?? [];
    siblings.push(n);
    byParent.set(n.parentId, siblings);
  }
  for (const [parent, siblings] of byParent) {
    siblings.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const wanted = siblings.map(n => id(n.id));
    const present = (await chrome.bookmarks.getChildren(id(parent))).slice(0, wanted.length).map(n => n.id);
    if (stable(present) === stable(wanted)) continue;
    for (const [slot, node] of wanted.entries()) await chrome.bookmarks.move(node, { parentId: id(parent), index: slot });
  }
}

/**
 * Restore tabs additively. Reopening a page does not restore what was running inside it.
 *
 * ⚠️ Positions come from a **running slot per window**, not the recorded index. Tabs opened
 * since the snapshot have to end up somewhere, and the only answer that keeps the restored
 * tabs in their recorded order is "after them". Using the recorded index instead would
 * interleave the two sets and put nothing where it was.
 *
 * ⚠️ A window that is gone is **built again**, which is what lets a tab state be restored
 * after a browser restart at all. It used to stop instead — and the reason was never that
 * the pages could not be found, since they are matched by address, but that a recorded tab
 * says which window it belongs to with a raw window id and every window id changes at a
 * restart. So the ids get mapped (`pairWindows`) and the unmapped ones get a window of
 * their own.
 */
async function restoreTabs(target: Snapshot, remap: Map<string, string>, ctx: RestoreContext) {
  const id = (n: number) => Number(remap.get(`tab:${n}`) ?? n);
  const gid = (n: number) => Number(remap.get(`group:${n}`) ?? n);
  const want = target.tabs!;
  const { pairs, windows, groups, slotStart } = await resolveRestore(target, ctx);
  for (const [recorded, actual] of pairs) if (recorded !== actual) remap.set(`tab:${recorded}`, String(actual));
  for (const [recorded, actual] of groups) remap.set(`group:${recorded}`, String(actual));
  /*
    A missing window is built by its own first tab, because `windows.create` needs either a
    tab to move in or an address to open and both of those are that tab. Creating an empty
    window instead would leave a New Tab page in it that the restore would have to close —
    and a restore never closes anything.
  */
  for (const recorded of [...new Set(want.map(t => t.windowId))].sort((a, b) => a - b)) {
    if (windows.has(recorded)) continue;
    const [anchor] = want.filter(t => t.windowId === recorded).sort((a, b) => a.index - b.index);
    const standing = pairs.get(anchor.id);
    if (standing === undefined && !/^https?:\/\//i.test(anchor.url)) throw new Error('This closed page cannot be reopened by the extension.');
    const created = await chrome.windows.create(standing === undefined
      ? { url: anchor.url, focused: false }
      : { tabId: standing, focused: false });
    const opened = standing ?? created?.tabs?.[0]?.id;
    if (created === undefined || created.id === undefined || opened === undefined) {
      throw new Error('A window this state used could not be opened again.');
    }
    remap.set(`tab:${anchor.id}`, String(opened));
    pairs.set(anchor.id, opened);
    windows.set(recorded, created.id);
  }
  const wid = (n: number) => windows.get(n)!;
  for (const t of want) {
    if (pairs.has(t.id)) continue;
    if (!/^https?:\/\//i.test(t.url)) throw new Error('This closed page cannot be reopened by the extension.');
    const created = await chrome.tabs.create({ url: t.url, windowId: wid(t.windowId), pinned: t.pinned, active: false });
    remap.set(`tab:${t.id}`, String(created.id));
    pairs.set(t.id, created.id!);
  }
  // Pinned state first, and leave a group whose membership is about to change: a tab
  // cannot be moved out of a group it is still in.
  for (const t of want) {
    const current = await chrome.tabs.get(id(t.id));
    if (current.pinned !== t.pinned) await chrome.tabs.update(id(t.id), { pinned: t.pinned });
    // §13: the host tab is never moved out of its group. Pinning it is fine — that is a
    // property of the tab, not of where it sits — which is why the line above runs for it.
    if (id(t.id) === ctx.owner) continue;
    const wanted = t.groupId === -1 ? -1 : gid(t.groupId);
    if (current.groupId !== -1 && (current.groupId !== wanted || current.windowId !== wid(t.windowId))) {
      await chrome.tabs.ungroup(id(t.id));
    }
  }
  const slots = new Map<number, number>();
  for (const t of [...want].sort((a, b) => a.windowId - b.windowId || a.index - b.index)) {
    const slot = slots.get(t.windowId) ?? slotStart(t.windowId);
    slots.set(t.windowId, slot + 1);
    const current = await chrome.tabs.get(id(t.id));
    if (current.windowId !== wid(t.windowId) || current.index !== slot) {
      await chrome.tabs.move(id(t.id), { windowId: wid(t.windowId), index: slot });
    }
  }
  for (const g of target.groups ?? []) {
    // The host tab is not a member this restore may place (§13). It drops out whether or not
    // it is already in the resolved group — where it is, excluding it changes nothing.
    const members = want.filter(t => t.groupId === g.id).map(t => id(t.id)).filter(tab => tab !== ctx.owner);
    // A group whose only recorded member was the host has nothing left to build.
    if (!members.length) continue;
    // Recognised or not, decided once by `pairGroups` — never by asking whether the
    // recorded id happens to match a live one, which across a restart it may do by
    // coincidence and for an unrelated group.
    if (!remap.has(`group:${g.id}`)) {
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
  for (const t of want) {
    if (t.active && !(await chrome.tabs.get(id(t.id))).active) await chrome.tabs.update(id(t.id), { active: true });
  }
}
/**
 * What restoring this state would come to, counted in objects.
 *
 * Pure, and fed the same walk the tree is annotated from, so a count and the node it belongs
 * to can never disagree. `extra` is what makes the additive contract visible: objects that
 * exist now, are absent from the snapshot, and will be left exactly where they are.
 */
function restoreEffects({ effects, extra }: { effects: Map<string, TreeEffect>; extra: number }): RestoreEffects {
  const counts: RestoreEffects = { restore: 0, reopen: 0, create: 0, keep: 0, extra };
  for (const [key, effect] of effects) {
    if (key.startsWith('group:')) continue; // A container is not an object the user counts.
    counts[effect]++;
  }
  return counts;
}
/**
 * Per-object verdicts for a restore, plus how much the browser holds that the state does not.
 *
 * One walk feeding both the tree and the counts beside it, so a badge and a number can never
 * disagree. It reproduces what `restoreTabs` and `restoreBookmarks` will do, including the
 * running slot and the lookalike pairing — a preview that models the restore differently
 * from the restore is a preview that lies.
 *
 * `restore` covers anything whose place, name, colour or pinned state differs: one word
 * rather than four, because the card answers "will this change" and the tree already shows
 * what it will change to.
 */
async function inspectRestore(target: Snapshot, ctx: RestoreContext): Promise<{ effects: Map<string, TreeEffect>; extra: number; hostGroupKept?: boolean }> {
  const effects = new Map<string, TreeEffect>();
  if (target.tabs) {
    const { live, liveGroups, pairs, windows, groups, kept, slotStart, hostGroupKept } = await resolveRestore(target, ctx);
    const byId = new Map(live.map(t => [t.id!, t]));
    const slots = new Map<number, number>();
    for (const t of [...target.tabs].sort((a, b) => a.windowId - b.windowId || a.index - b.index)) {
      const actual = pairs.get(t.id);
      if (actual === undefined) { effects.set(`tab:${t.id}`, 'reopen'); continue; }
      const current = byId.get(actual)!;
      const slot = slots.get(t.windowId) ?? slotStart(t.windowId);
      slots.set(t.windowId, slot + 1);
      // An adopted tab is a different tab wearing the same address, so it is never "already
      // in place" — its group and position are whatever they happen to be. Neither is a tab
      // whose window has to be built again: it is about to be moved into the new one. The
      // host's group is not compared at all, because the restore will not change it (§13).
      const settled = actual === t.id && current.windowId === windows.get(t.windowId)
        && current.pinned === t.pinned && current.index === slot
        && (actual === ctx.owner || current.groupId === (t.groupId === -1 ? -1 : groups.get(t.groupId)));
      effects.set(`tab:${t.id}`, settled ? 'keep' : 'restore');
    }
    for (const g of target.groups ?? []) {
      // Same membership the executor will place, host excluded — a group it was the only
      // recorded member of is not going to be built, so nothing about it changes.
      const members = target.tabs.filter(t => t.groupId === g.id).filter(t => pairs.get(t.id) !== ctx.owner);
      const current = liveGroups.find(x => x.id === groups.get(g.id));
      const settled = !members.length
        || (!!current && current.title === g.title && current.color === g.color && current.collapsed === g.collapsed);
      effects.set(`group:${g.id}`, settled ? 'keep' : 'restore');
    }
    return { effects, extra: live.filter(t => !kept.has(t.id!)).length, hostGroupKept };
  }
  const live = await bookmarkSnapshot();
  const recorded = target.bookmarks ?? [];
  const pairs = pairBookmarks(recorded, live);
  const byId = new Map(live.map(n => [n.id, n]));
  for (const n of recorded) {
    if (n.parentId === undefined) continue;
    const actual = pairs.get(n.id);
    if (actual === undefined) { effects.set(`mark:${n.id}`, 'create'); continue; }
    const current = byId.get(actual)!;
    const settled = actual === n.id && current.parentId === n.parentId && current.index === n.index && current.title === n.title;
    effects.set(`mark:${n.id}`, settled ? 'keep' : 'restore');
  }
  const kept = new Set(pairs.values());
  return { effects, extra: live.filter(n => n.parentId !== undefined && !kept.has(n.id)).length };
}
/**
 * A snapshot as the browser shows it: windows holding groups holding tabs, folders holding
 * bookmarks.
 *
 * The one view that answers "what did my browser look like" without naming a single id, and
 * the one that can be held up against the real browser and compared by eye. `effects`, when
 * given, marks what a restore would do to each node — the counts beside the tree come from
 * the same map, so the two cannot disagree.
 */
function treeOf(snapshot: Snapshot, hostWindow: number | undefined, effects?: Map<string, TreeEffect>): TreeNode[] {
  const effect = (key: string) => effects && { effect: effects.get(key) ?? 'keep' };
  if (snapshot.bookmarks) {
    const children = new Map<string, BookmarkState[]>();
    for (const n of snapshot.bookmarks) {
      if (n.parentId === undefined) continue;
      const siblings = children.get(n.parentId) ?? [];
      siblings.push(n);
      children.set(n.parentId, siblings);
    }
    const build = (node: BookmarkState): TreeNode => ({
      key: `mark:${node.id}`,
      kind: node.url === undefined ? 'folder' : 'bookmark',
      title: node.title,
      ...(node.url ? { url: node.url } : {}),
      ...effect(`mark:${node.id}`),
      ...(node.url === undefined
        ? { children: (children.get(node.id) ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(build) }
        : {}),
    });
    // The roots ("Bookmarks bar" and friends) are the children of "0"; "0" itself has no
    // name and nothing to say.
    return (children.get('0') ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(build);
  }
  const tabs = snapshot.tabs ?? [];
  const groups = new Map((snapshot.groups ?? []).map(g => [g.id, g]));
  /*
    Windows are numbered by id, which is allocation order — close enough to the order they
    were opened that an ordinal stays put across a whole card, which is the property that
    matters. The host's window says so instead, and a lone window gets no ordinal at all.
  */
  const order = [...new Set(tabs.map(t => t.windowId))].sort((a, b) => a - b);
  const tab = (t: TabState): TreeNode => ({
    key: `tab:${t.id}`, kind: 'tab', title: t.title, ...(t.url ? { url: t.url } : {}), ...effect(`tab:${t.id}`),
  });
  return order.map(windowId => {
    const members = tabs.filter(t => t.windowId === windowId).sort((a, b) => a.index - b.index);
    const children: TreeNode[] = [];
    const pinned = members.filter(t => t.pinned);
    if (pinned.length) children.push({ key: `pinned:${windowId}`, kind: 'pinned', children: pinned.map(tab) });
    // A group is placed where its first member sits, so the tree reads in the same order
    // as the tab strip.
    const seen = new Set<number>();
    for (const t of members) {
      if (t.pinned) continue;
      if (t.groupId === -1) { children.push(tab(t)); continue; }
      if (seen.has(t.groupId)) continue;
      seen.add(t.groupId);
      const group = groups.get(t.groupId);
      children.push({
        key: `group:${t.groupId}`, kind: 'group', title: group?.title ?? '',
        ...(group?.color ? { color: group.color } : {}),
        ...effect(`group:${t.groupId}`),
        children: members.filter(m => !m.pinned && m.groupId === t.groupId).map(tab),
      });
    }
    return {
      key: `window:${windowId}`, kind: 'window' as const,
      ...(windowId === hostWindow ? { hostWindow: true } : {}),
      ...(order.length > 1 ? { window: order.indexOf(windowId) + 1 } : {}),
      children,
    };
  });
}
/**
 * Whether putting this state back needs group write access.
 *
 * Asked of the target state rather than of what changed: restoring a state that has tabs in
 * groups means grouping tabs, whatever the batch that recorded it happened to do.
 */
const restoreNeedsGroups = (target: Snapshot) =>
  !!target.groups?.length || !!target.tabs?.some(t => t.groupId !== -1);
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
  };
}

function preview(batch: Batch): OperationsPlan {
  const describe = describer(batch);
  /** Every object any operation names, so the ones nobody names can be counted. */
  const named = new Set<string>();
  const items = batch.operations.map(op => {
      const subtree = new Set<string>();
      if (op.type === 'delete' && typeof op.id === 'string') {
        subtree.add(op.id);
        for (const b of batch.before.bookmarks ?? []) if (b.parentId && subtree.has(b.parentId)) subtree.add(b.id);
      }
      /*
        ⚠️ A move's destination folder is deliberately *not* a target. Listing it beside the
        bookmarks being moved makes the two indistinguishable, and for a `create` it would
        be the only entry — a card claiming one object is affected and then naming the wrong
        one. The destination is a detail (`folder`).
      */
      const kind = batch.before.tabs ? 'tabs' : 'bookmarks';
      const targets: Array<TabState | BookmarkState> = batch.before.tabs?.filter(t => t.id === op.tab_id || (op.tab_ids as number[] | undefined)?.includes(t.id) || (op.group_id !== undefined && t.groupId === op.group_id))
        ?? batch.before.bookmarks?.filter(b => subtree.has(b.id) || b.id === op.id) ?? [];
      for (const row of targets) named.add(String(row.id));
      return {
        type: op.type, details: describe.details(op),
        targetCount: targets.length,
        targets: targets.slice(0, 100).map(row => describe.target(kind, row)),
      };
    });
  /*
    Bookmarks count only real nodes: the tree's roots ("0" and the bars under it) are not
    things a user thinks of as bookmarks, so including them would inflate the one number on
    the card that is supposed to describe the size of their collection.
  */
  const all = batch.before.tabs ?? (batch.before.bookmarks ?? []).filter(n => n.parentId !== undefined && n.parentId !== '0');
  return {
    id: batch.id, kind: 'operations', count: batch.operations.length,
    tier: tierOf(batch.tool),
    items,
    untouched: all.filter(row => !named.has(String(row.id))).length,
  };
}
async function prepare(tool: string, params: Record<string, string>, owner: number) {
  if (tool === RESTORE_TOOL) return prepareRestore(params, owner);
  await requireTool(tool);
  const before = await snapshot(tool);
  const operations = parseOperations(tool, params.operations);
  for (const op of operations) validateTargets(tool, op, before, owner);
  const batch: Batch = { id: crypto.randomUUID(), owner, epoch: await epoch(), tool, operations, before, createdAt: Date.now(), status: 'prepared', steps: [] };
  // Awaited before the preview is shown: a plan the journal never accepted must not be
  // approvable, because approval is what makes it executable.
  await localAudit.insert(batch);
  return preview(batch);
}
/**
 * A plan to put one recorded state back.
 *
 * Stored as a batch like any other, with one pseudo-operation so the commit loop, the step
 * row and the audit trail need no special case. Its `tool` is the *arrange* tool for the
 * kind of state involved, not the tool of the batch it came from: restoring a batch of
 * closes reopens and positions tabs, so `tabs.arrange` is the capability that describes it,
 * and asking for `tabs.close` to undo a close would be asking for the wrong thing.
 */
async function prepareRestore(params: Record<string, string>, owner: number): Promise<RestorePlan> {
  const side = (params.side || 'before') as RestoreSide;
  if (!(RESTORE_SIDES as readonly string[]).includes(side)) throw new Error('Restore side must be "before" or "after".');
  const source = await localAudit.get(params.batch_id);
  if (!source) throw new Error('That batch is not in the journal.');
  const target = side === 'before' ? source.before : source.after;
  if (!target) throw new Error('This batch never finished, so it has no end state to restore.');
  const onTabs = !!target.tabs;
  const tool = onTabs ? 'browser_arrange_tabs' : 'browser_arrange_bookmarks';
  await requireTool(tool);
  if (onTabs && restoreNeedsGroups(target)) await requireCaps(['tabGroups.write']);
  const before = await snapshot(tool);
  const ctx: RestoreContext = { owner, recordedOwner: source.owner, sameSession: source.epoch === await epoch() };
  /*
    ⚠️ Resolved before the batch is written, not after. `resolveRestore` holds the host
    guard (§13), and a prepare that is refused has to leave nothing behind — a stored plan
    is a plan someone could approve.
  */
  const inspected = await inspectRestore(target, ctx);
  const host = before.tabs?.find(t => t.id === owner);
  const batch: Batch = {
    id: crypto.randomUUID(), owner, epoch: await epoch(), tool,
    operations: [{ type: 'restore', batch_id: source.id, side }],
    before, createdAt: Date.now(), status: 'prepared', steps: [],
    restoreOf: source.id, restoreSide: side,
  };
  await localAudit.insert(batch);
  return {
    id: batch.id, kind: 'restore', tier: 'low', side,
    tree: treeOf(target, host?.windowId, inspected.effects),
    effects: restoreEffects(inspected),
    ...(inspected.hostGroupKept ? { hostGroupKept: true } : {}),
  };
}
async function commit(planId: string, owner: number) {
  const batch = await localAudit.get(planId);
  if (!batch || batch.owner !== owner) throw new Error('Unknown plan or wrong host.');
  if (batch.status !== 'prepared') throw new Error('This plan has already been attempted. Read its audit record; do not retry it.');
  if (batch.epoch !== await epoch() || Date.now() - batch.createdAt > 600000) throw new Error('Plan expired. Prepare and approve a new plan.');
  /**
   * Everything that can refuse the batch, before anything is attempted.
   *
   * ⚠️ Preconditions belong out here rather than in the run, so a plan that cannot proceed is
   * *refused* instead of journalled as a half-attempt. Past this point the batch has a
   * verdict to explain; "the tab you approved closing now holds a different page" is not
   * something to explain in a record, it is something to say to the caller.
   *
   * A refusal is still written down. The user approved this, so "it did not happen, and why"
   * belongs in the journal beside the batches that did — with no end state, which is what
   * marks it as never having run.
   */
  let target: Snapshot | undefined;
  let restoreCtx: RestoreContext | undefined;
  try {
    await requireTool(batch.tool);
    const restoring = batch.restoreOf ? await localAudit.get(batch.restoreOf) : undefined;
    if (batch.restoreOf && !restoring) throw new Error('The batch this would restore is no longer in the journal.');
    target = restoring && (batch.restoreSide === 'after' ? restoring.after : restoring.before);
    if (restoring && !target) throw new Error('The recorded state is missing.');
    // The session that issued the recorded ids, which is what decides whether any of them
    // still name the object they named. Taken from the batch being restored, not this one.
    if (restoring) restoreCtx = { owner, recordedOwner: restoring.owner, sameSession: restoring.epoch === await epoch() };
    if (target?.tabs && restoreNeedsGroups(target)) await requireCaps(['tabGroups.write']);
    if (!target) {
      const live = await snapshot(batch.tool);
      for (const op of batch.operations) {
        validateTargets(batch.tool, op, live, owner);
        if (batch.tool === 'browser_close_tabs') checkCloseTarget(op, batch.before, live);
      }
    }
  } catch (error) {
    batch.error = error instanceof Error ? error.message : 'This plan can no longer be applied.';
    await localAudit.patch(batch.id, { status: 'failed', error: batch.error }).catch(() => { /* Already failing. */ });
    throw error;
  }
  batch.status = 'applying';
  await localAudit.patch(batch.id, { status: batch.status });
  active.add(planId);
  owners.set(planId, owner);
  const map = new Map<string, string>();
  try {
    for (const [index, op] of batch.operations.entries()) {
      if (cancelled.has(planId)) throw new Error('Stopped. Completed steps were retained.');
      await requireTool(batch.tool);
      if (target?.tabs && restoreNeedsGroups(target)) await requireCaps(['tabGroups.write']);
      /*
        Re-checked per step as well, because a step earlier in this batch moves the browser
        and the operations after it were approved against what the preview showed.
      */
      if (!target) {
        const live = await snapshot(batch.tool);
        validateTargets(batch.tool, op, live, owner);
        if (batch.tool === 'browser_close_tabs') checkCloseTarget(op, batch.before, live);
      }
      const step: Batch['steps'][number] = { operation: op, status: 'applying' };
      batch.steps.push(step);
      // Its own row, written before the Chrome call. A reload in the middle of a write is
      // the one situation nothing else can reconstruct, and this row is the only evidence.
      await localAudit.insertStep(batch.id, index, step);
      if (target) {
        if (target.bookmarks) await restoreBookmarks(target.bookmarks, map);
        else await restoreTabs(target, map, restoreCtx!);
      } else {
        await apply(batch.tool, op, owner);
      }
      step.status = 'applied';
      // The outcome of a step that already happened. Failing to record it is exactly the
      // `unknown` case: the browser moved and we cannot prove where it landed.
      try { await localAudit.setStepStatus(batch.id, index, 'applied'); }
      catch (error) {
        step.status = 'unknown';
        await localAudit.setStepStatus(batch.id, index, 'unknown').catch(() => { /* Already failing. */ });
        throw error;
      }
    }
    batch.status = 'applied';
  } catch (error) {
    const pending = batch.steps.at(-1);
    if (pending?.status === 'applying') {
      pending.status = 'unknown';
      await localAudit.setStepStatus(batch.id, batch.steps.length - 1, 'unknown').catch(() => { /* Best effort. */ });
    }
    batch.status = pending?.status === 'unknown' ? 'unknown' : 'failed';
    batch.error = error instanceof Error ? error.message : 'Browser operation failed.';
  } finally { active.delete(planId); owners.delete(planId); cancelled.delete(planId); }
  /**
   * The state the batch ended in, recorded once, whatever the verdict.
   *
   * ⚠️ Written for a failure too, and that is the point: a batch that stopped halfway left
   * the browser in a state nobody planned, and this is the snapshot that makes it
   * restorable and readable. It is skipped only when the run never reached a step, where
   * `before` already describes the browser.
   */
  const after = batch.steps.length ? await snapshot(batch.tool).catch(() => undefined) : undefined;
  if (after) batch.after = after;
  await localAudit.patch(batch.id, { status: batch.status, error: batch.error ?? null, ...(after ? { after } : {}) });
  /**
   * A restore that landed leaves no record of its own.
   *
   * The journal answers "what did the extension change about my browser". Putting a
   * recorded state back is the answer to that question, not another instance of it — and a
   * row per undo doubles the list with entries that are the inverse of the one above them,
   * each carrying two more full snapshots against a 200-batch ceiling. Changing your mind
   * again is still one click: both sides of the batch it came from are still there, so it
   * is restoring the other side rather than restoring the restore.
   *
   * ⚠️ Only when it landed cleanly. A restore that failed or ended `unknown` left the
   * browser somewhere nobody planned, and this row is the only evidence of that.
   */
  if (batch.restoreOf && batch.status === 'applied') {
    await localAudit.discard(batch.id).catch(() => { /* Upkeep. `prune` will get it. */ });
  }
  /**
   * What the AI is told: the verdict per step, and where to look for the rest.
   *
   * No object payload. A composer has a 31,998-character ceiling, and thirty steps of
   * before/after objects overruns it — leaving the model reading a result truncated
   * mid-object. `browser_query_changes` pages the same records on demand.
   */
  return {
    batch_id: batch.id, status: batch.status, error: batch.error,
    completed: batch.steps.filter(s => s.status === 'applied').length, planned: batch.operations.length,
    steps: batch.steps.map(s => ({ operation: s.operation, status: s.status })),
    ...(batch.status === 'applied' ? {} : { detail: `Use browser_query_changes with batch_id "${batch.id}" to read what happened, step by step. Do not retry this batch.` }),
  };
}
/**
 * Both recorded states of one batch, as trees, for the journal's detail view.
 *
 * Not routed through `browser_query_changes`: the AI needs ids to act on and a tree
 * deliberately has none. It answers to the same read capability the tool would, and its
 * output goes through the same redaction, so what the panel may see still matches what the
 * agent may see.
 */
async function trees(batchId: string, owner: number): Promise<BatchTrees> {
  const batch = await localAudit.get(batchId);
  if (!batch) throw new Error('That batch is not in the journal.');
  await requireCaps([readCapability(toolCapability(batch.tool) ?? 'tabs.read')]);
  const states = await localAudit.snapshots(batchId);
  if (!states) throw new Error('That batch is not in the journal.');
  const hostWindow = (await chrome.tabs.get(owner).catch(() => undefined))?.windowId;
  return {
    before: treeOf(states.before, hostWindow),
    ...(states.after ? { after: treeOf(states.after, hostWindow) } : {}),
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
  const visible = [];
  for (const b of await localAudit.list(params.batch_id || undefined)) {
    const cap = toolCapability(b.tool);
    if (cap && !readable.has(readCapability(cap))) continue;
    /*
      Restorable, per side, and the only question is whether the state was recorded. There
      is no "already restored" to rule one out — putting a recorded state back adds objects
      and removes none, so doing it twice lands where doing it once does — and no browser
      session to be inside of either: windows are built again and objects are recognised by
      address or membership when their ids stop meaning anything (see `resolveRestore`).
    */
    visible.push({ batch_id: b.id, created_at: b.createdAt, tool: b.tool, status: b.status, error: b.error,
      restore_of: b.restoreOf, restore_side: b.restoreSide,
      can_restore_before: true, can_restore_after: b.hasAfter,
      completed: b.applied, planned: b.planned,
      ...(params.batch_id ? { steps: (await localAudit.listSteps(b.id)).map(s => ({ step_index: s.index, operation: s.operation, status: s.status })) } : {}),
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
        : request.action === 'trees' ? await trees(request.batchId, owner!)
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
