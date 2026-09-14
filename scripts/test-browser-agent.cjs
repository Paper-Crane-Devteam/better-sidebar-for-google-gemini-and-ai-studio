const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const clone = value => value === undefined ? undefined : structuredClone(value);
function moduleFrom(file, imports, globals = {}) {
  const source = fs.readFileSync(path.resolve(file), 'utf8').replaceAll('import.meta.env.BROWSER', '"chrome"');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}
const contracts = moduleFrom('src/shared/browser-agent/contracts.ts', {});
function harness() {
  const batches = new Map();
  let settings = clone(contracts.DEFAULT_SETTINGS);
  let labels = {};
  let nextId = 100;
  let failWrite = false;
  let onMutation;
  const granted = new Set(['tabs', 'tabGroups', 'bookmarks']);
  const session = {};
  const state = {
    tabs: [
      { id: 1, windowId: 10, index: 0, title: 'Agent', url: 'https://gemini.google.com/app', active: true, pinned: false, groupId: -1, incognito: false },
      { id: 2, windowId: 10, index: 1, title: 'Vague title', url: 'https://example.com/private?token=secret#fragment', active: false, pinned: false, groupId: -1, incognito: false },
      { id: 3, windowId: 10, index: 2, title: 'Another', url: 'https://other.test/path', active: false, pinned: false, groupId: -1, incognito: false },
    ], groups: [], bookmarks: [
      { id: '0', title: '' }, { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar' },
      { id: '2', parentId: '1', index: 0, title: 'Folder' },
      { id: '3', parentId: '2', index: 0, title: 'Bookmark', url: 'https://example.com/private?token=secret' },
    ], mutations: 0,
  };
  function mutation() { state.mutations++; if (onMutation) onMutation(); }
  function reindexTabs() {
    for (const w of new Set(state.tabs.map(t => t.windowId))) state.tabs.filter(t => t.windowId === w).sort((a, b) => a.index - b.index).forEach((t, i) => t.index = i);
  }
  const getTab = id => { const tab = state.tabs.find(t => t.id === id); if (!tab) throw new Error('No tab'); return tab; };
  function children(parent) { return state.bookmarks.filter(n => n.parentId === parent).sort((a, b) => a.index - b.index); }
  const getBookmark = id => { const b = state.bookmarks.find(n => n.id === id); if (!b) throw new Error('No bookmark'); return b; };
  function tree(n) { return { ...n, ...(n.url === undefined ? { children: children(n.id).map(tree) } : {}) }; }
  const audit = {
    settings: async () => clone(settings), saveSettings: async s => { settings = clone(s); },
    all: async () => [...batches.values()].map(clone), get: async id => clone(batches.get(id)),
    save: async b => { if (failWrite) throw new Error('Disk full'); batches.set(b.id, clone(b)); },
    labels: async () => clone(labels), saveLabels: async (_, value) => { labels = clone(value); },
  };
  const chrome = {
    runtime: { id: 'extension-id', getURL: p => `chrome-extension://extension-id/${p}` },
    permissions: { contains: async ({ permissions }) => permissions.every(p => granted.has(p)) },
    storage: { session: { get: async k => ({ [k]: session[k] }), set: async v => Object.assign(session, v) }, local: { set: async () => {} } },
    windows: { get: async id => { if (!state.tabs.some(t => t.windowId === id)) throw new Error('No window'); return { incognito: false }; }, create: async () => {} },
    tabs: {
      onRemoved: { addListener() {} }, onUpdated: { addListener() {} }, get: async id => clone(getTab(id)),
      query: async q => clone(state.tabs.filter(t => q.windowId === undefined || t.windowId === q.windowId)),
      create: async p => {
        if (!state.tabs.some(t => t.windowId === p.windowId)) throw new Error('No window');
        const tabs = state.tabs.filter(t => t.windowId === p.windowId);
        const index = p.index ?? tabs.length;
        tabs.filter(t => t.index >= index).forEach(t => t.index++);
        const tab = { id: nextId++, title: p.url, url: p.url, windowId: p.windowId, index, active: !!p.active, pinned: !!p.pinned, groupId: -1, incognito: false };
        state.tabs.push(tab); mutation(); return clone(tab);
      },
      remove: async id => { getTab(id); state.tabs = state.tabs.filter(t => t.id !== id); reindexTabs(); mutation(); },
      update: async (id, p) => { const tab = getTab(id); if (p.active) state.tabs.filter(t => t.windowId === tab.windowId).forEach(t => t.active = false); Object.assign(tab, p); mutation(); return clone(tab); },
      move: async (id, p) => {
        const tab = getTab(id); const target = p.windowId ?? tab.windowId;
        const rest = state.tabs.filter(t => t.id !== id && t.windowId === target).sort((a, b) => a.index - b.index);
        const index = p.index === -1 ? rest.length : Math.min(p.index, rest.length);
        tab.windowId = target; rest.splice(index, 0, tab); rest.forEach((t, i) => t.index = i); mutation(); return clone(tab);
      },
      group: async p => {
        const members = (Array.isArray(p.tabIds) ? p.tabIds : [p.tabIds]).map(getTab);
        let id = p.groupId;
        if (id === undefined) { id = nextId++; state.groups.push({ id, title: '', color: 'grey', collapsed: false, windowId: members[0].windowId }); }
        members.forEach(t => t.groupId = id); mutation(); return id;
      },
      ungroup: async ids => { for (const id of Array.isArray(ids) ? ids : [ids]) getTab(id).groupId = -1; state.groups = state.groups.filter(g => state.tabs.some(t => t.groupId === g.id)); mutation(); },
    },
    tabGroups: {
      query: async q => clone(state.groups.filter(g => q.windowId === undefined || g.windowId === q.windowId)),
      get: async id => { const g = state.groups.find(g => g.id === id); if (!g) throw new Error('No group'); return clone(g); },
      update: async (id, p) => { const g = state.groups.find(g => g.id === id); if (!g) throw new Error('No group'); Object.assign(g, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))); mutation(); return clone(g); },
      move: async () => { throw new Error('Simulated API failure'); },
    },
    bookmarks: {
      getTree: async () => [tree(getBookmark('0'))], get: async id => [clone(getBookmark(id))],
      getChildren: async id => { getBookmark(id); return clone(children(id)); }, search: async q => clone(state.bookmarks.filter(n => n.title.includes(q))),
      create: async p => {
        getBookmark(p.parentId); const siblings = children(p.parentId); const index = p.index ?? siblings.length;
        siblings.filter(n => n.index >= index).forEach(n => n.index++);
        const n = { id: String(nextId++), parentId: p.parentId, title: p.title, index, ...(p.url !== undefined ? { url: p.url } : {}) };
        state.bookmarks.push(n); mutation(); return clone(n);
      },
      update: async (id, p) => { const n = getBookmark(id); Object.assign(n, p); mutation(); return clone(n); },
      remove: async id => { const n = getBookmark(id); if (children(id).length) throw new Error('Folder not empty'); state.bookmarks = state.bookmarks.filter(n => n.id !== id); children(n.parentId).forEach((n, i) => n.index = i); mutation(); },
      removeTree: async id => { const n = getBookmark(id); const remove = new Set([id]); for (const row of state.bookmarks) if (remove.has(row.parentId)) remove.add(row.id); state.bookmarks = state.bookmarks.filter(n => !remove.has(n.id)); children(n.parentId).forEach((n, i) => n.index = i); mutation(); },
      move: async (id, p) => { const n = getBookmark(id); getBookmark(p.parentId); const oldParent = n.parentId; n.parentId = p.parentId; const rest = children(p.parentId).filter(x => x.id !== id); rest.splice(p.index ?? rest.length, 0, n); rest.forEach((n, i) => n.index = i); if (oldParent !== p.parentId) children(oldParent).forEach((n, i) => n.index = i); mutation(); return clone(n); },
    },
  };
  const sender = { id: chrome.runtime.id, url: 'https://gemini.google.com/app', tab: { ...state.tabs[0] } };
  let backend;
  const reload = () => { backend = moduleFrom('src/entrypoints/background/handlers/browser-agent.ts', {
    '@/shared/browser-agent/contracts': contracts, '@/shared/browser-agent/local-store': { localAudit: audit },
  }, { chrome, crypto: webcrypto }); };
  reload();
  const call = (payload, from = sender) => backend.handleBrowserAgent(payload, from);
  const grant = async caps => {
    const result = await call({ action: 'configure', settings: { capabilities: caps, shareFullUrls: true } });
    assert.equal(result.success, true, result.error);
  };
  const prepare = (tool, operations) => call({ action: 'prepare', tool, params: { operations: JSON.stringify(operations) } });
  const commit = plan => call({ action: 'commit', planId: plan.data.id });
  return { state, batches, granted, call, grant, prepare, commit, reload, sender, session,
    setDiskFailure: value => failWrite = value, onMutation: fn => onMutation = fn };
}

test('All browser mutations require approval even in speed/round/auto-write mode; reads never do', () => {
  const policy = moduleFrom('src/entrypoints/overlay.content/shared/modules/agent-loop/execution-policy.ts', {
    '@/shared/browser-agent/contracts': contracts,
    './agent-loop-store': { useAgentLoopStore: { getState: () => ({ speedMode: true, approveRestOfRound: true }) } },
    './agent-policy-store': { useAgentPolicyStore: { getState: () => ({ autoRunReads: false, autoRunWrites: true }) } },
    './engine/parser/tool-schema': { CONTROL_TOOLS: ['complete_task'], identityParams: p => p, isHandoffTool: () => false },
  });
  for (const name of contracts.WRITE_TOOLS) { assert.equal(policy.requiresApproval({ name, params: {} }), true); assert.equal(policy.getToolRisk({ name, params: {} }), 'write'); }
  for (const name of contracts.READ_TOOLS) assert.equal(policy.requiresApproval({ name, params: {} }), false);
});
test('Strict operation validation rejects unknown fields, unsafe URLs and wrong types', () => {
  const parse = op => contracts.parseOperations('browser_update_tabs', JSON.stringify([op]));
  for (const op of [{ type: 'close', tab_id: '2' }, { type: 'create', url: 'javascript:alert(1)' }, { type: 'move', tab_id: 2 }, { type: 'close', tab_id: 2, approved: true }, { type: 'pin', tab_id: 2, pinned: 'false' }]) assert.throws(() => parse(op));
  assert.equal(parse({ type: 'move', tab_id: 2, index: 0 }).length, 1);
});
test('Read permissions are disabled initially and checked again after native revocation', async () => {
  const h = harness();
  const read = () => h.call({ action: 'read', tool: 'browser_list_tabs', params: {} });
  assert.equal((await read()).success, false);
  await h.grant(['tabs.read']); assert.equal((await read()).success, true);
  h.granted.delete('tabs'); assert.equal((await read()).success, false);
  assert.equal(h.state.mutations, 0);
});
test('Preparing a plan has no effects; commits are owner-bound, fixed and single-use', async () => {
  const h = harness(); await h.grant(['tabs.write']);
  const plan = await h.prepare('browser_update_tabs', [{ type: 'move', tab_id: 3, index: 1 }]);
  assert.equal(plan.success, true, plan.error); assert.equal(h.state.mutations, 0);
  assert.equal((await h.call({ action: 'commit', planId: plan.data.id }, { ...h.sender, tab: { ...h.sender.tab, id: 2 } })).success, false);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 3).index, 1);
  assert.equal((await h.commit(plan)).success, false); assert.equal(h.state.mutations, 1);
});
test('External navigation and permission revocation after preview block execution', async () => {
  for (const cause of ['navigation', 'permission']) {
    const h = harness(); await h.grant(['tabs.write']);
    const plan = await h.prepare('browser_update_tabs', [{ type: 'close', tab_id: 2 }]);
    if (cause === 'navigation') h.state.tabs[1].url = 'https://different.test/'; else h.granted.delete('tabs');
    assert.equal((await h.commit(plan)).success, false); assert.equal(h.state.mutations, 0);
  }
});
test('Host tab, incognito tabs and invalid bookmark parent cycles are protected', async () => {
  const h = harness(); await h.grant(['tabs.write', 'bookmarks.write']);
  assert.equal((await h.prepare('browser_update_tabs', [{ type: 'close', tab_id: 1 }])).success, false);
  h.state.tabs[1].incognito = true;
  assert.equal((await h.prepare('browser_update_tabs', [{ type: 'close', tab_id: 2 }])).success, false);
  assert.equal((await h.prepare('browser_manage_bookmarks', [{ type: 'move', id: '2', parent_id: '2' }])).success, false);
  assert.equal((await h.prepare('browser_manage_bookmarks', [{ type: 'delete', id: '1' }])).success, false);
  assert.equal(h.state.mutations, 0);
});
test('URL switch redacts lists, execution differences and historical changes', async () => {
  const h = harness(); await h.grant(['tabs.write']);
  const plan = await h.prepare('browser_update_tabs', [{ type: 'label', tab_id: 2, label: 'Read later' }]);
  const commit = await h.commit(plan); assert.equal(commit.data.status, 'applied');
  assert.match(JSON.stringify(commit), /token=secret/);
  await h.call({ action: 'configure', settings: { capabilities: ['tabs.write'], shareFullUrls: false } });
  for (const payload of [
    { action: 'read', tool: 'browser_list_tabs', params: {} },
    { action: 'read', tool: 'browser_query_changes', params: { batch_id: plan.data.id, step_index: '0' } },
  ]) { const result = await h.call(payload); assert.equal(result.success, true); assert.doesNotMatch(JSON.stringify(result), /token=secret|\/private/); }
  const stored = h.batches.get(plan.data.id); assert.match(JSON.stringify(stored), /token=secret/);
});
test('No write occurs when durable preflight logging fails', async () => {
  const h = harness(); await h.grant(['tabs.write']); h.setDiskFailure(true);
  assert.equal((await h.prepare('browser_update_tabs', [{ type: 'close', tab_id: 2 }])).success, false);
  assert.equal(h.state.mutations, 0);
});
test('Cancellation stops remaining steps and reports partial execution', async () => {
  const h = harness(); await h.grant(['tabs.write']);
  const plan = await h.prepare('browser_update_tabs', [{ type: 'pin', tab_id: 2, pinned: true }, { type: 'close', tab_id: 3 }]);
  h.onMutation(() => { void h.call({ action: 'cancel', planId: plan.data.id }); });
  const result = await h.commit(plan);
  assert.equal(result.data.status, 'failed'); assert.equal(result.data.completed, 1); assert.equal(h.state.tabs.length, 3);
});
test('An ambiguous API failure is journaled as unknown and never retried', async () => {
  const h = harness(); await h.grant(['tabGroups.write']);
  h.state.groups.push({ id: 20, windowId: 10, title: 'Group', color: 'blue', collapsed: false }); h.state.tabs[1].groupId = 20;
  const plan = await h.prepare('browser_manage_tab_groups', [{ type: 'move', group_id: 20, index: 0 }]);
  assert.equal((await h.commit(plan)).data.status, 'unknown');
  assert.equal((await h.commit(plan)).success, false);
  assert.equal((await h.call({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: plan.data.id } })).success, false);
});
test('Backend restart marks an unfinished journal unknown', async () => {
  const h = harness(); await h.grant(['tabs.write']);
  const plan = await h.prepare('browser_update_tabs', [{ type: 'close', tab_id: 2 }]);
  h.batches.get(plan.data.id).status = 'applying'; h.reload();
  await h.call({ action: 'settings' }); assert.equal(h.batches.get(plan.data.id).status, 'unknown');
  assert.equal((await h.commit(plan)).success, false);
});
test('Closed tab undo reopens the URL with a new identity and cannot run twice', async () => {
  const h = harness(); await h.grant(['tabGroups.write']);
  const plan = await h.prepare('browser_update_tabs', [{ type: 'close', tab_id: 2 }]); await h.commit(plan);
  const undo = await h.call({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: plan.data.id } });
  assert.equal(undo.success, true, undo.error);
  const result = await h.commit(undo); assert.equal(result.data.status, 'applied', JSON.stringify(result));
  assert.equal(h.state.tabs.length, 3); assert.ok(h.state.tabs.some(t => t.url.includes('token=secret') && t.id !== 2));
  assert.equal((await h.call({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: plan.data.id } })).success, false);
});
test('Bookmark directory deletion undo restores the subtree and maps new IDs across steps', async () => {
  const h = harness(); await h.grant(['bookmarks.write']);
  const plan = await h.prepare('browser_manage_bookmarks', [{ type: 'update', id: '3', title: 'New title' }, { type: 'delete', id: '2' }]);
  assert.equal((await h.commit(plan)).data.status, 'applied'); assert.equal(h.state.bookmarks.length, 2);
  const undo = await h.call({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: plan.data.id } });
  assert.equal(undo.success, true, undo.error);
  const result = await h.commit(undo); assert.equal(result.data.status, 'applied', JSON.stringify(result));
  const bookmark = h.state.bookmarks.find(n => n.url); const folder = h.state.bookmarks.find(n => n.title === 'Folder');
  assert.equal(bookmark.title, 'Bookmark'); assert.equal(bookmark.parentId, folder.id); assert.notEqual(folder.id, '2');
});
test('Undo refuses external edits and tab IDs from another browser session', async () => {
  for (const cause of ['edit', 'restart']) {
    const h = harness(); await h.grant(['tabGroups.write']);
    const plan = await h.prepare('browser_update_tabs', [{ type: 'label', tab_id: 2, label: 'Note' }]); await h.commit(plan);
    if (cause === 'edit') h.state.tabs[1].url = 'https://changed.test/'; else { delete h.session['browser-agent-epoch']; h.reload(); }
    const undo = await h.call({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: plan.data.id } });
    assert.equal(undo.success, false);
  }
});

test('Cancelled previews remain cancelled across a backend restart', async () => {
  const h = harness(); await h.grant(['tabs.write']);
  const plan = await h.prepare('browser_update_tabs', [{ type: 'close', tab_id: 2 }]);
  await h.call({ action: 'cancel', planId: plan.data.id }); h.reload();
  assert.equal((await h.commit(plan)).success, false); assert.equal(h.state.mutations, 0);
});
test('Bookmark change pagination is independent of batch pagination', async () => {
  const h = harness(); await h.grant(['bookmarks.write']);
  const plan = await h.prepare('browser_manage_bookmarks', [{ type: 'delete', id: '2' }]); await h.commit(plan);
  const first = await h.call({ action: 'read', tool: 'browser_query_changes', params: { batch_id: plan.data.id, step_index: '0', limit: '1' } });
  const second = await h.call({ action: 'read', tool: 'browser_query_changes', params: { batch_id: plan.data.id, step_index: '0', limit: '1', offset: '1' } });
  assert.equal(second.data.items.length, 1); assert.notEqual(first.data.items[0].changes.items[0].id, second.data.items[0].changes.items[0].id);
});
test('Label undo works with tabs.write and never needs unrelated group writes', async () => {
  const h = harness(); await h.grant(['tabs.write']);
  const plan = await h.prepare('browser_update_tabs', [{ type: 'label', tab_id: 2, label: 'Note' }]); await h.commit(plan);
  const undo = await h.call({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: plan.data.id } });
  assert.equal(undo.success, true, undo.error); assert.equal((await h.commit(undo)).data.status, 'applied');
});
test('Group creation and ungrouping can be undone as approved layout changes', async () => {
  const h = harness(); await h.grant(['tabGroups.write']);
  const plan = await h.prepare('browser_manage_tab_groups', [{ type: 'create', tab_ids: [2, 3], title: 'Research', color: 'blue' }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  const undo = await h.call({ action: 'prepare', tool: 'browser_undo_changes', params: { batch_id: plan.data.id } });
  assert.equal(undo.success, true, undo.error); const result = await h.commit(undo);
  assert.equal(result.data.status, 'applied', JSON.stringify(result)); assert.equal(h.state.groups.length, 0);
});
test('Invalid or foreign extension messages cannot reach the browser executor', async () => {
  const h = harness(); await h.grant(['tabs.write']);
  assert.equal((await h.call({ action: 'read', tool: 'browser_list_tabs', params: {} }, { ...h.sender, id: 'other-extension' })).success, false);
  assert.equal((await h.call({ action: 'read', tool: 'browser_list_tabs', params: {} }, { ...h.sender, url: 'https://untrusted.test/' })).success, false);
  assert.equal((await h.call({ action: 'read', tool: 'execute_sql', params: { query: 'DELETE FROM browser_change_log' } })).success, false);
});
