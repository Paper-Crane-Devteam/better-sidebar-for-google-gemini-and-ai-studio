import {
  CAPABILITIES, READ_TOOLS, dependencies, permissionsFor, toolCapability, parseOperations,
  publicData, isChromeBuild, type Batch, type BrowserRequest, type Snapshot, type Operation,
  type Capability, type PlanPreview, type TabState, type BookmarkState,
} from '@/shared/browser-agent/contracts';
import { localAudit } from '@/shared/browser-agent/local-store';
import type { MessageSender } from '../types';

let queue: Promise<unknown> = Promise.resolve();
const cancelled = new Set<string>();
const active = new Set<string>();
const owners = new Map<string, number>();
let initialized: Promise<void> | undefined;
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
async function initialize() {
  return initialized ??= (async () => {
    for (const batch of await localAudit.all()) {
      if (batch.status === 'applying') {
        batch.status = 'unknown';
        batch.error = 'Execution was interrupted. Inspect the browser before attempting another change.';
        await localAudit.save(batch);
      }
    }
  })();
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
async function snapshot(tool: string): Promise<Snapshot> {
  if (tool === 'browser_manage_bookmarks') return { bookmarks: await bookmarkSnapshot() };
  const labels = await localAudit.labels(await epoch());
  const tabs = (await chrome.tabs.query({})).filter(t => !t.incognito).map(t => ({
    id: t.id!, windowId: t.windowId, index: t.index, title: t.title ?? '', url: t.url ?? '',
    pinned: t.pinned, active: t.active, groupId: t.groupId, label: labels[String(t.id)] ?? '',
  })).sort((a, b) => a.id - b.id);
  if (tabs.length > 2000) throw new Error('Too many open tabs for one plan (limit 2,000).');
  const windows = new Set(tabs.map(t => t.windowId));
  const groups = (await chrome.tabGroups.query({})).filter(g => windows.has(g.windowId)).map(g => ({
    id: g.id, windowId: g.windowId, title: g.title ?? '', color: g.color, collapsed: g.collapsed,
  })).sort((a, b) => a.id - b.id);
  return { tabs, groups };
}
/** Titles can update while a page loads; URL and layout still protect object identity. */
function comparable(s: Snapshot) {
  return { ...s, tabs: s.tabs?.map(({ title: _title, ...t }) => t) };
}
function matches(a: Snapshot, b: Snapshot) { return stable(comparable(a)) === stable(comparable(b)); }
function diff(before: Snapshot, after: Snapshot) {
  return (['tabs', 'groups', 'bookmarks'] as const).flatMap(kind => {
    const a = new Map((before[kind] ?? []).map(n => [String(n.id), n] as const));
    const b = new Map((after[kind] ?? []).map(n => [String(n.id), n] as const));
    return [...new Set([...a.keys(), ...b.keys()])].filter(id => stable(a.get(id)) !== stable(b.get(id))).map(id => ({ kind, id, before: a.get(id), after: b.get(id) }));
  });
}
function validateTargets(tool: string, op: Operation, s: Snapshot, owner: number) {
  if (tool === 'browser_manage_bookmarks') {
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
    if (id === owner && !['label', 'pin', 'activate'].includes(op.type)) throw new Error('The Agent host tab is protected.');
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
  if (tool === 'browser_update_tabs') {
    switch (op.type) {
      case 'create': await chrome.tabs.create({ url: String(op.url), active: false, windowId: op.window_id as number | undefined ?? (await chrome.tabs.get(owner)).windowId, index: op.index as number | undefined }); break;
      case 'activate': await chrome.tabs.update(tabId, { active: true }); break;
      case 'pin': await chrome.tabs.update(tabId, { pinned: Boolean(op.pinned) }); break;
      case 'move': await chrome.tabs.move(tabId, { windowId: op.window_id as number | undefined, index: Number(op.index) }); break;
      case 'close': await chrome.tabs.remove(tabId); break;
      case 'label': {
        const key = await epoch(), labels = await localAudit.labels(key);
        labels[String(tabId)] = String(op.label);
        await localAudit.saveLabels(key, labels); break;
      }
    }
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
      case 'delete': {
        const [node] = await chrome.bookmarks.get(String(op.id));
        if (node.url !== undefined) await chrome.bookmarks.remove(node.id);
        else await chrome.bookmarks.removeTree(node.id);
      }
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
async function restoreTabs(before: Snapshot, after: Snapshot, remap: Map<string, string>, owner: number) {
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
  for (const t of [...old].sort((a, b) => a.windowId - b.windowId || a.index - b.index)) {
    const current = await chrome.tabs.get(id(t.id));
    if (id(t.id) !== owner && (current.windowId !== t.windowId || current.index !== t.index)) await chrome.tabs.move(id(t.id), { windowId: t.windowId, index: t.index });
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
  const key = await epoch(), labels = await localAudit.labels(key);
  for (const t of old) {
    labels[String(id(t.id))] = t.label;
    if (t.active && !(await chrome.tabs.get(id(t.id))).active) await chrome.tabs.update(id(t.id), { active: true });
  }
  await localAudit.saveLabels(key, labels);
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
function preview(batch: Batch, undo?: Batch): PlanPreview {
  return {
    id: batch.id, count: batch.operations.length,
    items: batch.operations.map((op, index) => {
      const subtree = new Set<string>();
      if (op.type === 'delete' && typeof op.id === 'string') {
        subtree.add(op.id);
        for (const b of batch.before.bookmarks ?? []) if (b.parentId && subtree.has(b.parentId)) subtree.add(b.id);
      }
      const targets = batch.before.tabs?.filter(t => t.id === op.tab_id || (op.tab_ids as number[] | undefined)?.includes(t.id) || (op.group_id !== undefined && t.groupId === op.group_id))
        ?? batch.before.bookmarks?.filter(b => subtree.has(b.id) || b.id === op.id || b.id === op.parent_id) ?? [];
      return { operation: op, target_count: targets.length, targets: targets.slice(0, 100),
        ...(undo ? { undo: true, changes: undo.steps[undo.steps.length - index - 1].changes?.map(c => ({ kind: c.kind, id: c.id, from: c.after, to: c.before })).slice(0, 100) } : {}),
      };
    }),
    warning: batch.undoOf ? '撤销也需要批准；发现外部变化就停止。关闭标签只尽力重新打开 URL，不能保证恢复表单、滚动位置或页面运行状态。恢复收藏夹会生成新 ID。'
      : '本次批准仅覆盖以上操作。关闭标签只尽力重新打开 URL，不能保证恢复表单、滚动位置或页面运行状态。删除目录会删除其所有子项；恢复收藏夹会生成新 ID。',
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
    if (!matches(before, undo.steps.at(-1)!.after!)) throw new Error('The browser has changed since this batch. Undo would overwrite newer changes.');
    // Recreated/reordered host tabs are never allowed, including an old batch from another host.
    if (before.tabs && undo.steps.some(s => {
      const a = s.before.tabs?.find(t => t.id === owner), b = s.after?.tabs?.find(t => t.id === owner);
      return !!a !== !!b || (a && b && (a.windowId !== b.windowId || a.groupId !== b.groupId));
    })) throw new Error('Undo would remove or regroup the Agent host tab.');
  } else for (const op of operations) validateTargets(tool, op, before, owner);
  const batch: Batch = { id: crypto.randomUUID(), owner, epoch: await epoch(), tool, operations, before, createdAt: Date.now(), status: 'prepared', steps: [], ...(undo ? { undoOf: undo.id } : {}) };
  await localAudit.save(batch);
  return preview(batch, undo);
}
async function commit(planId: string, owner: number) {
  const batch = await localAudit.get(planId);
  if (!batch || batch.owner !== owner) throw new Error('Unknown plan or wrong host.');
  if (batch.status !== 'prepared') throw new Error('This plan has already been attempted. Read its audit record; do not retry it.');
  if (batch.epoch !== await epoch() || Date.now() - batch.createdAt > 600000) throw new Error('Plan expired. Prepare and approve a new plan.');
  await requireTool(batch.tool);
  if (!matches(batch.before, await snapshot(batch.tool))) throw new Error('The browser changed after preview. Prepare and approve a new plan.');
  const undo = batch.undoOf ? await localAudit.get(batch.undoOf) : undefined;
  if (batch.undoOf && !undo) throw new Error('Original batch is missing.');
  if (undo && batch.before.tabs && undoNeedsGroups(undo)) await requireCaps(['tabGroups.write']);
  if (undo?.undoneBy) throw new Error('This batch already has an undo attempt.');
  batch.status = 'applying';
  await localAudit.save(batch);
  if (undo) { undo.undoneBy = batch.id; await localAudit.save(undo); }
  active.add(planId);
  owners.set(planId, owner);
  const map = new Map<string, string>();
  let expected = batch.before;
  try {
    for (const [index, op] of batch.operations.entries()) {
      if (cancelled.has(planId)) throw new Error('Stopped. Completed steps were retained.');
      await requireTool(batch.tool);
      if (undo && batch.before.tabs && undoNeedsGroups(undo)) await requireCaps(['tabGroups.write']);
      const before = await snapshot(batch.tool);
      if (!matches(expected, before)) throw new Error('External changes detected. Remaining steps were stopped.');
      if (!undo) validateTargets(batch.tool, op, before, owner);
      const step: Batch['steps'][number] = { operation: op, before, status: 'applying' };
      batch.steps.push(step);
      await localAudit.save(batch);
      if (undo) {
        const original = undo.steps[undo.steps.length - index - 1];
        if (original.before.bookmarks) await restoreBookmarks(original.before.bookmarks, original.after!.bookmarks!, map);
        else {
          // Restoration can change membership, even for a batch originally using tabs.write.
          await restoreTabs(original.before, original.after!, map, owner);
        }
      } else await apply(batch.tool, op, owner);
      step.after = await snapshot(batch.tool);
      step.changes = diff(step.before, step.after);
      step.status = 'applied';
      if (undo) {
        const target = remapped(undo.steps[undo.steps.length - index - 1].before, map);
        if (!matches(target, step.after)) throw new Error('Restoration did not fully match the saved state. Inspect the result before continuing.');
      }
      expected = step.after;
      try { await localAudit.save(batch); }
      catch (error) { step.status = 'unknown'; throw error; }
    }
    batch.status = 'applied';
    if (undo) { undo.status = 'undone'; await localAudit.save(undo); }
  } catch (error) {
    const pending = batch.steps.at(-1);
    if (pending?.status === 'applying') pending.status = 'unknown';
    batch.status = pending?.status === 'unknown' ? 'unknown' : 'failed';
    batch.error = error instanceof Error ? error.message : 'Browser operation failed.';
  } finally { active.delete(planId); owners.delete(planId); cancelled.delete(planId); }
  await localAudit.save(batch);
  return { batch_id: batch.id, status: batch.status, error: batch.error, completed: batch.steps.filter(s => s.status === 'applied').length, planned: batch.operations.length, steps: batch.steps.map(s => ({ operation: s.operation, status: s.status, change_count: s.changes?.length ?? 0, changes: s.changes?.slice(0, 10), changes_truncated: (s.changes?.length ?? 0) > 10 })) };
}

async function read(tool: string, params: Record<string, string>, owner: number) {
  if (!(READ_TOOLS as readonly string[]).includes(tool)) throw new Error('Unknown read tool.');
  await requireTool(tool);
  const windowId = numberParam(params.window_id, (await chrome.tabs.get(owner)).windowId);
  if (tool === 'browser_list_tabs') {
    const labels = await localAudit.labels(await epoch());
    return page((await chrome.tabs.query({ windowId })).filter(t => !t.incognito).map(t => ({ id: t.id, window_id: t.windowId, index: t.index, title: t.title, url: t.url, group_id: t.groupId, pinned: t.pinned, active: t.active, label: labels[String(t.id)] ?? '', protected: t.id === owner })), params);
  }
  if (tool === 'browser_list_tab_groups') {
    if ((await chrome.windows.get(windowId)).incognito) throw new Error('Private windows are excluded.');
    return page(await chrome.tabGroups.query({ windowId }), params);
  }
  if (tool === 'browser_list_bookmarks') {
    const nodes = params.query ? await chrome.bookmarks.search(params.query.slice(0, 500)) : await chrome.bookmarks.getChildren(params.parent_id || '0');
    return page(nodes.map(n => ({ id: n.id, parent_id: n.parentId, index: n.index, title: n.title, url: n.url, folder: n.url === undefined, managed: !!n.unmodifiable })), params);
  }
  const records = (await localAudit.all()).filter(b => b.status !== 'prepared' && (!params.batch_id || b.id === params.batch_id)).sort((a, b) => b.createdAt - a.createdAt);
  const visible = [];
  const readableKinds = new Set<string>();
  for (const [kind, cap] of [['tabs', 'tabs.read'], ['groups', 'tabGroups.read'], ['bookmarks', 'bookmarks.read']] as const) {
    try { await requireCaps([cap]); readableKinds.add(kind); } catch { /* Filter historical entity data too. */ }
  }
  for (const b of records) {
    try {
      const cap = toolCapability(b.tool);
      if (cap) await requireCaps([cap.replace('.write', '.read') as Capability]);
      visible.push({ batch_id: b.id, created_at: b.createdAt, tool: b.tool, status: b.status, error: b.error, undo_of: b.undoOf, undone_by: b.undoneBy,
        can_undo: !b.undoOf && !b.undoneBy && ['applied', 'failed'].includes(b.status) && b.steps.length > 0 && b.steps.every(s => s.status === 'applied') && (!b.before.tabs || b.epoch === await epoch()),
        completed: b.steps.filter(s => s.status === 'applied').length, planned: b.operations.length,
        ...(params.batch_id ? { steps: b.steps.map((s, index) => ({ step_index: index, operation: s.operation, status: s.status, change_count: s.changes?.length ?? 0 })),
          ...(params.step_index !== undefined ? { changes: page((b.steps[numberParam(params.step_index, 0)]?.changes ?? []).filter(c => readableKinds.has(c.kind)), params) } : {}) } : {}),
      });
    } catch { /* Revoked capabilities also hide historical data. */ }
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
    await initialize();
    if (request.action === 'open-settings') {
      await chrome.windows.create({ url: chrome.runtime.getURL('browser-agent-settings.html'), type: 'popup', width: 540, height: 720 });
      return { success: true };
    }
    if (request.action === 'cancel') {
      const plan = await localAudit.get(request.planId);
      if (!plan || plan.owner !== owner) throw new Error('Unknown plan or wrong host.');
      if (active.has(plan.id) || plan.status === 'applying') cancelled.add(plan.id);
      else if (plan.status === 'prepared') { plan.status = 'failed'; plan.error = 'Cancelled before execution.'; await localAudit.save(plan); }
      return { success: true };
    }
    if (request.action === 'configure') {
      if (!request.settings || !Array.isArray(request.settings.capabilities) || request.settings.capabilities.some(c => !CAPABILITIES.includes(c)) || typeof request.settings.shareFullUrls !== 'boolean') throw new Error('Invalid settings.');
      const caps = [...new Set(request.settings.capabilities.flatMap(dependencies))];
      if (caps.length && !await chrome.permissions.contains({ permissions: permissionsFor(caps) })) throw new Error('Grant Chrome permissions first.');
      await localAudit.saveSettings({ ...request.settings, capabilities: caps });
      await chrome.storage.local.set({ 'browser-agent-settings-version': Date.now() });
    }
    if (request.action === 'settings' || request.action === 'configure') {
      const settings = await localAudit.settings();
      const capabilities: Capability[] = [];
      for (const cap of settings.capabilities) if (await chrome.permissions.contains({ permissions: permissionsFor(dependencies(cap)) })) capabilities.push(cap);
      return { success: true, data: { ...settings, capabilities } };
    }
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
