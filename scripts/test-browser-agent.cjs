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

/**
 * A real SQLite database, and the real repository on top of it.
 *
 * The journal used to be a hand-rolled IndexedDB, which the tests replaced with a Map —
 * so the storage layer was never executed here at all. Now that it is SQL in the
 * extension's own database, running it for real is cheap (`node:sqlite`, in memory) and
 * covers the DDL, every statement, and the retention query. `runMigrations` is applied
 * in full rather than the two CREATE TABLEs in isolation: the point is that the schema
 * arrives the same way it does in a browser, as one step among many.
 */
/**
 * The real DDL, read out of the real migration.
 *
 * Not a copy kept in the test: a schema the tests agree with and the extension does not
 * is worse than no test. Running `runMigrations` whole would be closer still, but it is
 * async and every migration before this one needs tables this database has never had —
 * so the statements are lifted from the one step instead. A rename breaks this loudly,
 * which is the intended failure mode.
 */
const BROWSER_AGENT_DDL = (() => {
  const source = fs.readFileSync(path.resolve('src/shared/workers/migrations.ts'), 'utf8');
  const block = source.split("await step('create browser agent audit tables'")[1]?.split('await step(')[0];
  const statements = block?.match(/db\.run\(\s*(?:`[^`]*`|'[^']*')/g)
    ?.map(call => call.replace(/^db\.run\(\s*/, '').slice(1, -1));
  if (!statements?.length) throw new Error('Could not find the browser agent migration step.');
  return statements;
})();

function journal() {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  let failWrite = false;
  const exec = (sql, bind = []) => {
    // `prepare` takes one statement; migrations pass whole scripts.
    if (!bind.length && /;\s*\S/.test(sql.trim().replace(/;\s*$/, ''))) { db.exec(sql); return []; }
    return db.prepare(sql).all(...bind);
  };
  const write = (sql, bind) => { if (failWrite) throw new Error('Disk full'); return exec(sql, bind); };
  for (const statement of BROWSER_AGENT_DDL) db.exec(statement);
  const { browserAuditRepo } = moduleFrom('src/shared/db/operations/browserAgent.ts', {
    '../index': { runQuery: async (sql, bind) => exec(sql, bind), runCommand: async (sql, bind) => { write(sql, bind); } },
    '@/shared/browser-agent/contracts': contracts,
  });
  return { repo: browserAuditRepo, exec, setDiskFailure: value => failWrite = value };
}

function harness() {
  const sql = journal();
  let nextId = 100;
  let onMutation;
  let queryHook;
  // Chrome reports a tab that has not committed its navigation as `url: ''` plus a
  // `pendingUrl`, and swaps them in a moment later. Modelling that is the point: with a
  // synchronous `url` the backend never sees a tab change address on its own, so every
  // snapshot comparison looked stable in tests and derailed in a real browser.
  let queries = 0;
  let instant;
  const redirects = new Map();
  function settleNavigations() {
    for (const tab of state.tabs) {
      if (tab.pendingUrl === undefined || queries <= tab.settleAt) continue;
      tab.url = redirects.get(tab.pendingUrl) ?? tab.pendingUrl;
      delete tab.pendingUrl; delete tab.settleAt;
    }
  }
  const granted = new Set(['tabs', 'tabGroups', 'bookmarks']);
  // `session` is emptied when the browser closes, `local` is not — the two lifetimes the
  // labels and the settings respectively need, which is why neither is in the database.
  const session = {};
  const local = {};
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
  const chrome = {
    runtime: { id: 'extension-id', getURL: p => `chrome-extension://extension-id/${p}` },
    permissions: { contains: async ({ permissions }) => permissions.every(p => granted.has(p)) },
    storage: {
      session: { get: async k => ({ [k]: session[k] }), set: async v => Object.assign(session, v) },
      local: { get: async k => ({ [k]: local[k] }), set: async v => Object.assign(local, v) },
    },
    windows: {
      get: async id => { if (!state.tabs.some(t => t.windowId === id)) throw new Error('No window'); return { incognito: false }; },
      getAll: async () => [], update: async () => {},
      // Modelled rather than stubbed, because restoring a state recorded before a browser
      // restart *builds* the windows it named — every window id changed, so there is
      // nothing left to move the tabs into. Both shapes the backend uses are here: an
      // existing tab moved into a window of its own, and an address opened in one.
      // Window ids come out of the same counter as tab and group ids so that a test can
      // never pass by two id spaces coincidentally agreeing.
      create: async (p = {}) => {
        const id = nextId++;
        if (p.type === 'popup') return { id, incognito: false, tabs: [] };
        if (p.tabId !== undefined) {
          const tab = getTab(p.tabId);
          tab.windowId = id; tab.index = 0; reindexTabs(); mutation();
          return { id, incognito: false, tabs: [clone(tab)] };
        }
        if (p.url === undefined) return { id, incognito: false, tabs: [] };
        const tab = { id: nextId++, title: '', windowId: id, index: 0, active: true, pinned: false, groupId: -1, incognito: false,
          ...(instant ? { url: redirects.get(p.url) ?? p.url } : { url: '', pendingUrl: p.url, settleAt: queries + 1 }) };
        state.tabs.push(tab); mutation();
        return { id, incognito: false, tabs: [clone(tab)] };
      },
    },
    tabs: {
      onRemoved: { addListener() {} }, onUpdated: { addListener() {} }, get: async id => clone(getTab(id)),
      query: async q => {
        queries++; settleNavigations();
        // Lands an external change in a specific gap between two of the backend's own
        // observations. Counted in queries because that is what the backend does between
        // the checks a test needs to slip between: one snapshot per check.
        if (queryHook && --queryHook.remaining <= 0) { const { fn } = queryHook; queryHook = undefined; fn(); }
        return clone(state.tabs.filter(t => q.windowId === undefined || t.windowId === q.windowId));
      },
      create: async p => {
        if (!state.tabs.some(t => t.windowId === p.windowId)) throw new Error('No window');
        const tabs = state.tabs.filter(t => t.windowId === p.windowId);
        const index = p.index ?? tabs.length;
        tabs.filter(t => t.index >= index).forEach(t => t.index++);
        const tab = { id: nextId++, title: '', windowId: p.windowId, index, active: !!p.active, pinned: !!p.pinned, groupId: -1, incognito: false,
          // `instant` is the fast case: the navigation (and any redirect) has already
          // committed by the time anyone looks. `settleAt` is the slow one — the first
          // observation still shows the pending address, the next one shows the real one.
          ...(instant ? { url: redirects.get(p.url) ?? p.url } : { url: '', pendingUrl: p.url, settleAt: queries + 1 }) };
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
  // The real storage module, not a stand-in: it is thin, and what it does is decide which
  // of the three stores each kind of state belongs in — the thing worth checking.
  const store = moduleFrom('src/shared/browser-agent/local-store.ts', {
    '@/shared/db/operations': { browserAuditRepo: sql.repo }, './contracts': contracts,
  }, { chrome, indexedDB: { deleteDatabase() {} } });
  let backend;
  const reload = () => { backend = moduleFrom('src/entrypoints/background/handlers/browser-agent.ts', {
    '@/shared/browser-agent/contracts': contracts, '@/shared/browser-agent/local-store': store,
    // The journal lives in the profile database, so the handler opens it and switches to
    // the sender tab's profile before touching it. Both are no-ops here.
    '../db': { ensureDbReady: async () => {} },
    '../tab-profile-map': { ensureDbForTab: async () => false, getCurrentDbName: () => 'test-profile' },
  }, { chrome, crypto: webcrypto, indexedDB: { deleteDatabase() {} } }); };
  reload();
  const call = (payload, from = sender) => backend.handleBrowserAgent(payload, from);
  const grant = async caps => {
    const result = await call({ action: 'configure', settings: { capabilities: caps, shareFullUrls: true } });
    assert.equal(result.success, true, result.error);
  };
  const prepare = (tool, operations) => call({ action: 'prepare', tool, params: { operations: JSON.stringify(operations) } });
  const commit = plan => call({ action: 'commit', planId: plan.data.id });
  return { state, granted, call, grant, prepare, commit, reload, sender, session,
    setDiskFailure: sql.setDiskFailure, onMutation: fn => onMutation = fn,
    onQueries: (n, fn) => queryHook = { remaining: n, fn },
    /** The stored row, straight out of SQLite — what a database export would carry. */
    row: id => sql.exec('SELECT * FROM browser_agent_batches WHERE id = ?', [id])[0],
    steps: id => sql.exec('SELECT * FROM browser_agent_steps WHERE batch_id = ? ORDER BY step_index', [id]),
    setStatus: (id, status) => sql.exec('UPDATE browser_agent_batches SET status = ? WHERE id = ?', [status, id]),
    setAge: (id, createdAt) => sql.exec('UPDATE browser_agent_batches SET created_at = ? WHERE id = ?', [createdAt, id]),
    orphanSteps: () => sql.exec('SELECT COUNT(*) AS n FROM browser_agent_steps WHERE batch_id NOT IN (SELECT id FROM browser_agent_batches)')[0].n,
    /** New tabs commit immediately, landing on `to` instead of the requested address. */
    instantNavigation: (from, to) => { instant = true; if (from) redirects.set(from, to); },
    address: tab => tab.url || tab.pendingUrl || '' };
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
  const parse = op => contracts.parseOperations('browser_arrange_tabs', JSON.stringify([op]));
  for (const op of [{ type: 'move', tab_id: '2' }, { type: 'create', url: 'javascript:alert(1)' }, { type: 'move', tab_id: 2 }, { type: 'pin', tab_id: 2, pinned: true, approved: true }, { type: 'pin', tab_id: 2, pinned: 'false' }]) assert.throws(() => parse(op));
  assert.equal(parse({ type: 'move', tab_id: 2, index: 0 }).length, 1);
});
test('Destructive operations exist only in their own tool, and the tier reads off the name', () => {
  const parse = (tool, op) => contracts.parseOperations(tool, JSON.stringify([op]));
  // The protocol, not a validation nicety: closing has no home inside an organizing tool,
  // so five closes cannot ride along in a batch of moves to borrow its lower bar — and the
  // approval UI never has to parse `operations` to find out which bar applies.
  assert.throws(() => parse('browser_arrange_tabs', { type: 'close', tab_id: 2 }));
  assert.throws(() => parse('browser_arrange_bookmarks', { type: 'delete', id: '3' }));
  // And the destructive tools do only their one thing.
  assert.throws(() => parse('browser_close_tabs', { type: 'move', tab_id: 2, index: 0 }));
  assert.throws(() => parse('browser_delete_bookmarks', { type: 'move', id: '3', parent_id: '1' }));
  // The tab note is gone with no replacement: it expired with the browser session, which
  // is when someone would go looking for it (§1).
  assert.throws(() => parse('browser_arrange_tabs', { type: 'label', tab_id: 2, label: 'Read later' }));
  assert.equal(parse('browser_close_tabs', { type: 'close', tab_id: 2 }).length, 1);
  for (const [tool, tier] of [['browser_list_tabs', 'read'], ['browser_arrange_tabs', 'low'],
    ['browser_manage_tab_groups', 'low'], ['browser_arrange_bookmarks', 'low'],
    ['browser_close_tabs', 'lossy'], ['browser_delete_bookmarks', 'lossy']]) {
    assert.equal(contracts.tierOf(tool), tier, tool);
  }
});
test('Organizing and removing are separate grants, in both directions', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  // The point of the split: "tidy up, but do not throw anything away" is expressible.
  assert.equal((await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }])).success, false);
  assert.equal((await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }])).success, true);
  const other = harness(); await other.grant(['tabs.close']);
  assert.equal((await other.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }])).success, false);
  const plan = await other.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }]);
  assert.equal(plan.success, true, plan.error);
  // Chrome has one `tabs` permission for both, so this line is the extension's own gate.
  assert.equal(plan.data.tier, 'lossy');
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
  const h = harness(); await h.grant(['tabs.arrange']);
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'move', tab_id: 3, index: 1 }]);
  assert.equal(plan.success, true, plan.error); assert.equal(h.state.mutations, 0);
  assert.equal((await h.call({ action: 'commit', planId: plan.data.id }, { ...h.sender, tab: { ...h.sender.tab, id: 2 } })).success, false);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 3).index, 1);
  assert.equal((await h.commit(plan)).success, false); assert.equal(h.state.mutations, 1);
});
test('External navigation and permission revocation after preview block execution', async () => {
  for (const cause of ['navigation', 'permission']) {
    const h = harness(); await h.grant(['tabs.close']);
    const plan = await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }]);
    if (cause === 'navigation') h.state.tabs[1].url = 'https://different.test/'; else h.granted.delete('tabs');
    assert.equal((await h.commit(plan)).success, false); assert.equal(h.state.mutations, 0);
  }
});
test('Browser activity the plan does not depend on no longer invalidates it', async () => {
  for (const churn of ['focus', 'other window', 'context navigation']) {
    const h = harness(); await h.grant(['tabs.arrange']);
    h.state.tabs.push({ id: 4, windowId: 11, index: 0, title: 'Elsewhere', url: 'https://elsewhere.test/', active: true, pinned: false, groupId: -1, incognito: false });
    const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
    // Clicking over to a tab to see what it is, before approving, is the most likely thing
    // to happen in this gap — and it used to be enough to void the approval.
    if (churn === 'focus') { h.state.tabs[0].active = false; h.state.tabs[2].active = true; }
    if (churn === 'other window') h.state.tabs[3].url = 'https://elsewhere.test/elsewhere';
    if (churn === 'context navigation') h.state.tabs[2].url = 'https://other.test/redirected';
    const result = await h.commit(plan);
    assert.equal(result.data.status, 'applied', `${churn}: ${JSON.stringify(result)}`);
    assert.equal(h.state.tabs.find(t => t.id === 2).pinned, true);
  }
});
test('A close is bound to the page that was in the tab; nothing else is bound to a URL', async () => {
  // Closing is about what is *in* the tab. Someone who approved closing a page has not
  // approved closing whatever it navigated to in the meantime, and that is the one
  // operation where being a navigation late destroys something.
  const h = harness(); await h.grant(['tabs.close', 'tabs.arrange']);
  const close = await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }]);
  h.state.tabs[1].url = 'https://different.test/';
  assert.equal((await h.commit(close)).success, false);
  assert.equal(h.state.mutations, 0);
  // Refused before anything is journalled: nothing was attempted, so there is no verdict.
  assert.equal(h.steps(close.data.id).length, 0);
  // A move means *that tab*, so the same churn plus a new tab in the window is not a conflict.
  const move = await h.prepare('browser_arrange_tabs', [{ type: 'move', tab_id: 3, index: 0 }]);
  h.state.tabs.push({ id: 5, windowId: 10, index: 3, title: 'New', url: 'https://new.test/', active: false, pinned: false, groupId: -1, incognito: false });
  h.state.tabs[2].url = 'https://other.test/redirected';
  assert.equal((await h.commit(move)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 3).index, 0);
});
test('Host tab, incognito tabs and invalid bookmark parent cycles are protected', async () => {
  const h = harness(); await h.grant(['tabs.close', 'bookmarks.arrange', 'bookmarks.delete']);
  assert.equal((await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 1 }])).success, false);
  h.state.tabs[1].incognito = true;
  assert.equal((await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }])).success, false);
  assert.equal((await h.prepare('browser_arrange_bookmarks', [{ type: 'move', id: '2', parent_id: '2' }])).success, false);
  assert.equal((await h.prepare('browser_delete_bookmarks', [{ type: 'delete', id: '1' }])).success, false);
  assert.equal(h.state.mutations, 0);
});
test('URL switch redacts lists, execution differences and historical changes', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  const commit = await h.commit(plan); assert.equal(commit.data.status, 'applied');
  // The commit result is a verdict per step and nothing else — no object payload, so no
  // addresses either way. The detail is fetched on demand, and *that* is where the switch
  // has to hold.
  assert.doesNotMatch(JSON.stringify(commit), /token=secret|\/private/);
  const open = await h.call({ action: 'trees', batchId: plan.data.id });
  assert.match(JSON.stringify(open), /token=secret/);
  await h.call({ action: 'configure', settings: { capabilities: ['tabs.arrange'], shareFullUrls: false } });
  // The trees carry every address in the snapshot, so the switch has to hold there too —
  // it is the largest payload the journal hands out.
  for (const payload of [
    { action: 'read', tool: 'browser_list_tabs', params: {} },
    { action: 'read', tool: 'browser_query_changes', params: { batch_id: plan.data.id } },
    { action: 'trees', batchId: plan.data.id },
  ]) { const result = await h.call(payload); assert.equal(result.success, true); assert.doesNotMatch(JSON.stringify(result), /token=secret|\/private/); }
  // Redaction is applied on the way out, never on the way in: the journal has to hold the
  // real address or it cannot reopen the tab it closed.
  assert.match(JSON.stringify(h.row(plan.data.id)), /token=secret/);
});
test('Both recorded states are offered as trees, and never with an id in them', async () => {
  const h = harness(); await h.grant(['tabGroups.write']);
  const plan = await h.prepare('browser_manage_tab_groups', [{ type: 'create', tab_ids: [2, 3], title: 'Research', color: 'blue' }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  const trees = await h.call({ action: 'trees', batchId: plan.data.id });
  assert.equal(trees.success, true, trees.error);
  // One window, so no ordinal: "window 1" is noise when there is no window 2.
  const [before] = trees.data.before;
  assert.equal(before.kind, 'window');
  assert.equal(before.hostWindow, true);
  assert.equal(before.window, undefined);
  // The group exists only in the second tree, and it is a container holding its members
  // rather than a line mentioning them.
  assert.ok(!JSON.stringify(trees.data.before).includes('"group"'));
  const group = trees.data.after.flatMap(w => w.children).find(n => n.kind === 'group');
  assert.equal(group.title, 'Research');
  assert.equal(group.color, 'blue');
  assert.equal(group.children.length, 2);
  // Keys exist for rendering; nothing the user reads is an id.
  for (const node of [before, group]) {
    assert.equal(node.id, undefined);
    assert.equal(node.groupId, undefined);
    assert.equal(node.index, undefined);
  }
});
test('A batch that never finished records one state, and only that one can be restored', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  // Refused in the preflight, so no step ran and there is nothing to call an end state.
  h.granted.delete('tabs');
  assert.equal((await h.commit(plan)).success, false);
  h.granted.add('tabs');
  assert.equal(h.row(plan.data.id).after_state, null);
  const [entry] = (await h.call({ action: 'read', tool: 'browser_query_changes', params: { batch_id: plan.data.id } })).data.items;
  assert.equal(entry.can_restore_before, true);
  assert.equal(entry.can_restore_after, false);
  const trees = await h.call({ action: 'trees', batchId: plan.data.id });
  assert.equal(trees.data.after, undefined);
  assert.equal((await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id, side: 'after' } })).success, false);
});
test('No write occurs when durable preflight logging fails', async () => {
  const h = harness(); await h.grant(['tabs.close']); h.setDiskFailure(true);
  assert.equal((await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }])).success, false);
  assert.equal(h.state.mutations, 0);
});
test('Cancellation stops remaining steps and reports partial execution', async () => {
  const h = harness(); await h.grant(['tabs.close']);
  for (const id of [4, 5, 6]) h.state.tabs.push({ id, windowId: 10, index: h.state.tabs.length, title: `Tab ${id}`, url: `https://tab${id}.test/`, active: false, pinned: false, groupId: -1, incognito: false });
  const plan = await h.prepare('browser_close_tabs', [2, 3, 4, 5, 6].map(tab_id => ({ type: 'close', tab_id })));
  h.onMutation(() => { void h.call({ action: 'cancel', planId: plan.data.id }); });
  const result = await h.commit(plan);
  // "Stop" promises not to start another step, not to interrupt one already in flight, so
  // the count is a range: something ran, and not everything did.
  assert.equal(result.data.status, 'failed');
  assert.ok(result.data.completed >= 1 && result.data.completed < 5, `completed ${result.data.completed}`);
  assert.equal(h.state.tabs.length, 6 - result.data.completed);
});
test('An ambiguous API failure is journaled as unknown and never retried', async () => {
  const h = harness(); await h.grant(['tabGroups.write']);
  h.state.groups.push({ id: 20, windowId: 10, title: 'Group', color: 'blue', collapsed: false }); h.state.tabs[1].groupId = 20;
  const plan = await h.prepare('browser_manage_tab_groups', [{ type: 'move', group_id: 20, index: 0 }]);
  assert.equal((await h.commit(plan)).data.status, 'unknown');
  assert.equal((await h.commit(plan)).success, false);
  // The batch is never retried, but its recorded start state is exactly what someone wants
  // after an uncertain outcome — an unknown verdict is a reason to offer the way back, not
  // to withhold it.
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(restore.success, true, restore.error);
});
test('Backend restart marks an unfinished journal unknown', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  h.setStatus(plan.data.id, 'applying'); h.reload();
  // `settings` no longer touches the journal, so the sweep happens on the first request
  // that does. That is the point of the split: the permission window must not have to
  // wait for a database to open.
  assert.equal((await h.call({ action: 'settings' })).success, true);
  assert.equal(h.row(plan.data.id).status, 'applying');
  assert.equal((await h.commit(plan)).success, false);
  assert.equal(h.row(plan.data.id).status, 'unknown');
});
test('Restoring the state before a close reopens the tab, and repeating it changes nothing', async () => {
  const h = harness(); await h.grant(['tabs.close', 'tabs.arrange']);
  const plan = await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(restore.success, true, restore.error);
  // Putting objects back never removes one, so there is no tier decision to make.
  assert.equal(restore.data.kind, 'restore');
  assert.equal(restore.data.tier, 'low');
  assert.equal(restore.data.effects.reopen, 1);
  assert.equal((await h.commit(restore)).data.status, 'applied');
  assert.equal(h.state.tabs.length, 3);
  assert.ok(h.state.tabs.some(t => h.address(t).includes('token=secret') && t.id !== 2));
  /*
    Asked for again, the same state is now already standing: the reopened tab wears the
    recorded address, so it is adopted rather than opened a second time. Without that,
    every repeat would leave another copy behind.
  */
  const again = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(again.success, true, again.error);
  assert.equal(again.data.effects.reopen, 0);
  assert.equal((await h.commit(again)).data.status, 'applied');
  assert.equal(h.state.tabs.length, 3);
});
test('Restoring leaves everything newer alone, and says how much that is', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'move', tab_id: 3, index: 0 }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  // Two tabs opened afterwards, one of them pinned — the case that decides where the
  // restored tabs can go at all, since Chrome keeps pinned tabs at the front.
  h.state.tabs.push({ id: 6, windowId: 10, index: 3, title: 'Later', url: 'https://later.test/', active: false, pinned: false, groupId: -1, incognito: false });
  h.state.tabs.push({ id: 7, windowId: 10, index: 0, title: 'Sticky', url: 'https://sticky.test/', active: false, pinned: true, groupId: -1, incognito: false });
  h.state.tabs.filter(t => t.id !== 7).forEach(t => t.index++);
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(restore.success, true, restore.error);
  assert.equal(restore.data.effects.extra, 2);
  assert.equal(restore.data.effects.reopen, 0);
  assert.equal((await h.commit(restore)).data.status, 'applied');
  // Nothing was closed, and the recorded tabs are back in their recorded order — after the
  // pinned newcomer, which cannot be displaced.
  assert.equal(h.state.tabs.length, 5);
  assert.ok(h.state.tabs.some(t => t.id === 6));
  const order = h.state.tabs.slice().sort((a, b) => a.index - b.index).map(t => t.id);
  assert.deepEqual(order.slice(0, 4), [7, 1, 2, 3]);
});
test('A restore that lands leaves no record of its own; changing your mind is the other side', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal((await h.commit(restore)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 2).pinned, false);
  /*
    The journal answers "what did the extension change about my browser". Putting a recorded
    state back is the answer to that, not another instance of it — a row per undo doubles the
    list with the inverse of the entry above it, two more full snapshots each.
  */
  assert.equal(h.row(restore.data.id), undefined);
  assert.equal(h.steps(restore.data.id).length, 0);
  assert.equal(h.orphanSteps(), 0);
  const list = (await h.call({ action: 'read', tool: 'browser_query_changes', params: {} })).data.items;
  assert.deepEqual(list.map(i => i.batch_id), [plan.data.id]);
  // Changing your mind again costs one click all the same: both sides of the original batch
  // are still recorded, so it is restoring the other one.
  const back = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id, side: 'after' } });
  assert.equal(back.success, true, back.error);
  assert.equal((await h.commit(back)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 2).pinned, true);
});
test('A restore that did not land keeps its record, because nothing else knows what happened', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  h.state.tabs.push({ id: 9, windowId: 10, index: 3, title: 'Settings', url: 'chrome://settings', active: false, pinned: false, groupId: -1, incognito: false });
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  // Between the approval and the click, the user closes a tab whose address an extension is
  // not allowed to open. The restore gets partway and then cannot finish.
  h.state.tabs = h.state.tabs.filter(t => t.id !== 9);
  const result = await h.commit(restore);
  assert.equal(result.data.status, 'unknown');
  const row = h.row(restore.data.id);
  assert.ok(row, 'a restore left half-done is the only record of where the browser ended up');
  assert.equal(row.restore_of, plan.data.id);
  assert.equal(row.restore_side, 'before');
  // The tool recorded is the one whose permission the restore actually spent, not the one
  // of the batch it came from.
  assert.equal(row.tool, 'browser_arrange_tabs');
});
test('Undoing a close needs organizing, not closing', async () => {
  // The capability a restore spends is the one it uses: reopening and positioning tabs is
  // arranging them. Asking for tabs.close to undo a close would be asking for the wrong thing.
  const h = harness(); await h.grant(['tabs.close']);
  const plan = await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  assert.equal((await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } })).success, false);
  await h.grant(['tabs.close', 'tabs.arrange']);
  assert.equal((await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } })).success, true);
});
test('A tab committing its navigation is not mistaken for a different page', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  // Chrome reports a freshly created tab as `url: ''` with the destination in `pendingUrl`,
  // then swaps them. A snapshot that read `url` alone would give the tab one identity for a
  // few hundred milliseconds and another afterwards.
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'create', url: 'https://new.test/page' }, { type: 'move', tab_id: 3, index: 0 }]);
  const result = await h.commit(plan);
  assert.equal(result.data.status, 'applied', JSON.stringify(result));
  assert.equal(result.data.completed, 2);
  // The recorded end state holds the destination, not the empty string, so the created tab
  // is recognisable in it.
  const trees = await h.call({ action: 'trees', batchId: plan.data.id });
  assert.match(JSON.stringify(trees.data.after), /new\.test\/page/);
});
test('A window the recorded state used is built again rather than its tabs going elsewhere', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  h.state.tabs.push({ id: 8, windowId: 11, index: 0, title: 'Elsewhere', url: 'https://elsewhere.test/', active: true, pinned: false, groupId: -1, incognito: false });
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'move', tab_id: 8, window_id: 11, index: 0 }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  // The user closes that whole window. Its tab is gone with it, so the restore has to
  // reopen the page *and* have somewhere to put it — piling it into the host's window
  // would be inventing a layout the browser was never in.
  h.state.tabs = h.state.tabs.filter(t => t.windowId !== 11);
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id, side: 'after' } });
  assert.equal(restore.success, true, restore.error);
  assert.equal(restore.data.effects.reopen, 1);
  const result = await h.commit(restore);
  assert.equal(result.data.status, 'applied', JSON.stringify(result));
  const reopened = h.state.tabs.find(t => h.address(t) === 'https://elsewhere.test/');
  assert.ok(reopened);
  // A window of its own, and not one of the two that were already there.
  assert.equal(h.state.tabs.filter(t => t.windowId === reopened.windowId).length, 1);
  assert.ok(![10, 11].includes(reopened.windowId));
  // And the host tab stayed exactly where it was.
  assert.equal(h.state.tabs.find(t => t.id === 1).windowId, 10);
});
test('Restoring a deleted bookmark subtree rebuilds it, parents first', async () => {
  const h = harness(); await h.grant(['bookmarks.delete', 'bookmarks.arrange']);
  const plan = await h.prepare('browser_delete_bookmarks', [{ type: 'delete', id: '3' }, { type: 'delete', id: '2' }]);
  assert.equal(plan.data.tier, 'lossy');
  assert.equal((await h.commit(plan)).data.status, 'applied'); assert.equal(h.state.bookmarks.length, 2);
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(restore.success, true, restore.error);
  assert.equal(restore.data.tier, 'low');
  // The folder and the bookmark inside it: both gone, both rebuilt, parent first.
  assert.equal(restore.data.effects.create, 2);
  const result = await h.commit(restore); assert.equal(result.data.status, 'applied', JSON.stringify(result));
  const bookmark = h.state.bookmarks.find(n => n.url); const folder = h.state.bookmarks.find(n => n.title === 'Folder');
  assert.equal(bookmark.title, 'Bookmark'); assert.equal(bookmark.parentId, folder.id); assert.notEqual(folder.id, '2');
  // Repeating it adopts what is standing rather than building a second copy.
  const again = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(again.data.effects.create, 0);
  assert.equal((await h.commit(again)).data.status, 'applied');
  assert.equal(h.state.bookmarks.filter(n => n.title === 'Folder').length, 1);
});
test('A tab state survives a browser restart: new ids, same pages, same layout', async () => {
  const tabs = harness(); await tabs.grant(['tabs.arrange']);
  const moved = await tabs.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  await tabs.commit(moved);
  /*
    The browser restarts: the epoch is gone and every tab and window comes back under a
    different id. Nothing in the record names anything any more — which is exactly the case
    this used to refuse, on the grounds that a recorded tab says which window it is in with
    a raw window id.
  */
  delete tabs.session['browser-agent-epoch'];
  tabs.state.tabs = tabs.state.tabs.map((t, i) => ({ ...t, id: 200 + i, windowId: 42, pinned: false }));
  tabs.sender.tab.id = 200;
  tabs.reload();
  const [entry] = (await tabs.call({ action: 'read', tool: 'browser_query_changes', params: { batch_id: moved.data.id } })).data.items;
  assert.equal(entry.can_restore_before, true);
  const restore = await tabs.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: moved.data.id, side: 'after' } });
  assert.equal(restore.success, true, restore.error);
  // Every page is standing, just under another id, so they are adopted rather than reopened.
  assert.equal(restore.data.effects.reopen, 0);
  assert.equal((await tabs.commit(restore)).data.status, 'applied');
  // The recorded state had tab 2 pinned. Its page is now tab 201, and that is what got pinned.
  assert.equal(tabs.state.tabs.find(t => t.id === 201).pinned, true);
  // The host tab did not move: no new window, and the sidebar is still in the one it was in.
  assert.deepEqual([...new Set(tabs.state.tabs.map(t => t.windowId))], [42]);

  const marks = harness(); await marks.grant(['bookmarks.arrange']);
  const renamed = await marks.prepare('browser_arrange_bookmarks', [{ type: 'update', id: '3', title: 'Renamed' }]);
  await marks.commit(renamed);
  delete marks.session['browser-agent-epoch']; marks.reload();
  const rename = await marks.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: renamed.data.id } });
  assert.equal(rename.success, true, rename.error);
  assert.equal((await marks.commit(rename)).data.status, 'applied');
  assert.equal(marks.state.bookmarks.find(n => n.id === '3').title, 'Bookmark');
});
test('Across a restart the second window is rebuilt, and the sidebar stays in the one it is in', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  h.state.tabs.push({ id: 8, windowId: 11, index: 0, title: 'Elsewhere', url: 'https://elsewhere.test/', active: true, pinned: false, groupId: -1, incognito: false });
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  /*
    The restart, as the user meets it: a fresh epoch, every id different, and only one of the
    two windows reopened. The recorded state names four tabs across two windows and not one
    of those numbers means anything now.
  */
  delete h.session['browser-agent-epoch'];
  h.state.tabs = [
    { id: 300, windowId: 42, index: 0, title: 'Agent', url: 'https://gemini.google.com/app', active: true, pinned: false, groupId: -1, incognito: false },
    { id: 301, windowId: 42, index: 1, title: 'Vague title', url: 'https://example.com/private?token=secret#fragment', active: false, pinned: false, groupId: -1, incognito: false },
  ];
  h.sender.tab.id = 300;
  h.reload();
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id, side: 'after' } });
  assert.equal(restore.success, true, restore.error);
  // Two pages are standing and get adopted by address; the other two are reopened.
  assert.equal(restore.data.effects.reopen, 2);
  assert.equal((await h.commit(restore)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 300).windowId, 42, 'the sidebar never moved');
  // The tab that belonged to the host's window came back into it; the one that belonged to
  // the window that is gone got a window of its own rather than being piled in beside it.
  assert.equal(h.state.tabs.find(t => h.address(t) === 'https://other.test/path').windowId, 42);
  assert.notEqual(h.state.tabs.find(t => h.address(t) === 'https://elsewhere.test/').windowId, 42);
});
test('The host tab keeps its group instead of the whole restore being refused', async () => {
  const h = harness(); await h.grant(['tabGroups.write']);
  const plan = await h.prepare('browser_manage_tab_groups', [{ type: 'create', tab_ids: [2, 3], title: 'Research', color: 'blue' }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  /*
    The user groups the host tab afterwards. The recorded state has it ungrouped, and pulling
    it out is the one thing no batch may do to it — but the host is not in the organizing
    scope at all (§13), so that part of the snapshot does not apply to it rather than
    invalidating everything else the user wanted back.
  */
  const group = h.state.groups[0].id;
  h.state.tabs[0].groupId = group;
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(restore.success, true, restore.error);
  // Said on the card: the tree draws the host outside the group, and that row is the one
  // thing the tree is about to be wrong about.
  assert.equal(restore.data.hostGroupKept, true);
  assert.equal((await h.commit(restore)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 1).groupId, group, 'the host stayed in its group');
  // Everything else did go back: the two tabs the batch grouped are ungrouped again.
  assert.equal(h.state.tabs.find(t => t.id === 2).groupId, -1);
  assert.equal(h.state.tabs.find(t => t.id === 3).groupId, -1);
});
test('Restoring still refuses to move the host tab to another window', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  h.state.tabs.push({ id: 8, windowId: 11, index: 0, title: 'Elsewhere', url: 'https://elsewhere.test/', active: false, pinned: false, groupId: -1, incognito: false });
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  // The user drags the sidebar's tab into the other window. Unlike a group, this cannot be
  // skipped: every other tab of the recorded window is going somewhere the host is not.
  h.state.tabs.find(t => t.id === 1).windowId = 11;
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(restore.success, false);
  assert.match(restore.error, /window/i);
});
test('Restoring group membership needs group organizing; restoring a plain layout does not', async () => {
  const grouped = harness(); await grouped.grant(['tabGroups.write']);
  const plan = await grouped.prepare('browser_manage_tab_groups', [{ type: 'create', tab_ids: [2, 3], title: 'Research', color: 'blue' }]);
  assert.equal((await grouped.commit(plan)).data.status, 'applied');
  // The state being restored has tabs in a group, so putting it back means grouping tabs —
  // asked of the target state, not of what the original batch happened to do.
  const after = await grouped.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id, side: 'after' } });
  assert.equal(after.success, true, after.error);
  await grouped.grant(['tabs.arrange']);
  assert.equal((await grouped.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id, side: 'after' } })).success, false);
  // The state before it has no groups at all, so arranging is enough.
  const before = await grouped.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id, side: 'before' } });
  assert.equal(before.success, true, before.error);
  assert.equal((await grouped.commit(before)).data.status, 'applied');
  assert.equal(grouped.state.groups.length, 0);
});
test('A restore refused before it starts leaves the batch restorable', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  const plan = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  const restore = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(restore.success, true, restore.error);
  // Revoked between the approval and the first step.
  h.granted.delete('tabs');
  assert.equal((await h.commit(restore)).success, false);
  assert.equal(h.steps(restore.data.id).length, 0);
  h.granted.add('tabs');
  // There is no single attempt to spend: a recorded state stays available for as long as it
  // is in the journal.
  const retry = await h.call({ action: 'prepare', tool: 'browser_restore_state', params: { batch_id: plan.data.id } });
  assert.equal(retry.success, true, retry.error);
  assert.equal((await h.commit(retry)).data.status, 'applied');
  assert.equal(h.state.tabs.find(t => t.id === 2).pinned, false);
});
test('Cancelled previews remain cancelled across a backend restart', async () => {
  const h = harness(); await h.grant(['tabs.close']);
  const plan = await h.prepare('browser_close_tabs', [{ type: 'close', tab_id: 2 }]);
  await h.call({ action: 'cancel', planId: plan.data.id }); h.reload();
  assert.equal((await h.commit(plan)).success, false); assert.equal(h.state.mutations, 0);
});
test('The journal list pages independently of the steps it can expand', async () => {
  const h = harness(); await h.grant(['bookmarks.arrange']);
  const plan = await h.prepare('browser_arrange_bookmarks', [
    { type: 'update', id: '3', title: 'One' }, { type: 'update', id: '2', title: 'Two' },
  ]);
  assert.equal((await h.commit(plan)).data.status, 'applied');
  const list = await h.call({ action: 'read', tool: 'browser_query_changes', params: { limit: '1' } });
  // Steps arrive only when one batch was asked for: the list is a dozen lines of text and
  // must not pay for anything larger.
  assert.equal(list.data.items.length, 1);
  assert.equal(list.data.items[0].steps, undefined);
  const one = await h.call({ action: 'read', tool: 'browser_query_changes', params: { batch_id: plan.data.id } });
  assert.deepEqual(one.data.items[0].steps.map(s => s.step_index), [0, 1]);
  assert.deepEqual(one.data.items[0].steps.map(s => s.status), ['applied', 'applied']);
});
test('Retention drops expired previews and orphaned steps', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  const applied = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 2, pinned: true }]);
  assert.equal((await h.commit(applied)).data.status, 'applied');
  const abandoned = await h.prepare('browser_arrange_tabs', [{ type: 'pin', tab_id: 3, pinned: true }]);
  // A preview nobody approved is dead weight once it can no longer be committed; the plan
  // expiry and the retention cut use the same number, so this is exactly the window.
  h.setAge(abandoned.data.id, Date.now() - 700_000);
  h.reload(); await h.call({ action: 'read', tool: 'browser_query_changes', params: {} });
  assert.equal(h.row(abandoned.data.id), undefined);
  assert.ok(h.row(applied.data.id));
  assert.ok(h.steps(applied.data.id).length > 0);
  assert.equal(h.orphanSteps(), 0);
});
test('Invalid or foreign extension messages cannot reach the browser executor', async () => {
  const h = harness(); await h.grant(['tabs.arrange']);
  assert.equal((await h.call({ action: 'read', tool: 'browser_list_tabs', params: {} }, { ...h.sender, id: 'other-extension' })).success, false);
  assert.equal((await h.call({ action: 'read', tool: 'browser_list_tabs', params: {} }, { ...h.sender, url: 'https://untrusted.test/' })).success, false);
  assert.equal((await h.call({ action: 'read', tool: 'execute_sql', params: { query: 'DELETE FROM browser_change_log' } })).success, false);
});
