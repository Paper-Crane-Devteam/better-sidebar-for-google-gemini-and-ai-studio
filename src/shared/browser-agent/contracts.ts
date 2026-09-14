export const CAPABILITIES = ['tabs.read', 'tabs.write', 'tabGroups.read', 'tabGroups.write', 'bookmarks.read', 'bookmarks.write'] as const;
export type Capability = typeof CAPABILITIES[number];
export type AgentKind = 'data' | 'browser';
export interface BrowserSettings { capabilities: Capability[]; shareFullUrls: boolean }
export const DEFAULT_SETTINGS: BrowserSettings = { capabilities: [], shareFullUrls: true };
export const READ_TOOLS = ['browser_list_tabs', 'browser_list_tab_groups', 'browser_list_bookmarks', 'browser_query_changes'] as const;
export const WRITE_TOOLS = ['browser_update_tabs', 'browser_manage_tab_groups', 'browser_manage_bookmarks', 'browser_undo_changes'] as const;
export const BROWSER_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
export const isBrowserTool = (name: string) => (BROWSER_TOOLS as readonly string[]).includes(name);
export const isBrowserWrite = (name: string) => (WRITE_TOOLS as readonly string[]).includes(name);
export const isChromeBuild = () => import.meta.env.BROWSER === 'chrome';

export function dependencies(cap: Capability): Capability[] {
  if (cap === 'tabs.write') return ['tabs.read', 'tabGroups.read', cap];
  if (cap === 'tabGroups.write') return ['tabs.read', 'tabGroups.read', 'tabs.write', cap];
  if (cap === 'bookmarks.write') return ['bookmarks.read', cap];
  return [cap];
}
export function permissionsFor(caps: Capability[]): ('tabs' | 'tabGroups' | 'bookmarks')[] {
  return [...new Set(caps.map(c => c.split('.')[0] as 'tabs' | 'tabGroups' | 'bookmarks'))];
}
export function toolCapability(name: string): Capability | undefined {
  const map: Record<string, Capability> = {
    browser_list_tabs: 'tabs.read', browser_update_tabs: 'tabs.write',
    browser_list_tab_groups: 'tabGroups.read', browser_manage_tab_groups: 'tabGroups.write',
    browser_list_bookmarks: 'bookmarks.read', browser_manage_bookmarks: 'bookmarks.write',
  };
  return map[name];
}

export type Operation = { type: string; [key: string]: string | number | boolean | number[] | undefined };
const FIELDS: Record<string, Record<string, string[]>> = {
  browser_update_tabs: {
    create: ['url', 'window_id', 'index'], activate: ['tab_id'], move: ['tab_id', 'window_id', 'index'],
    pin: ['tab_id', 'pinned'], close: ['tab_id'], label: ['tab_id', 'label'],
  },
  browser_manage_tab_groups: {
    create: ['tab_ids', 'title', 'color'], update: ['group_id', 'title', 'color', 'collapsed'],
    move: ['group_id', 'window_id', 'index'], ungroup: ['tab_ids'],
  },
  browser_manage_bookmarks: {
    create: ['parent_id', 'title', 'url', 'index'], update: ['id', 'title'],
    move: ['id', 'parent_id', 'index'], delete: ['id'],
  },
};
const COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
export function parseOperations(tool: string, json: string): Operation[] {
  const input: unknown = JSON.parse(json);
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) throw new Error('A batch needs 1–30 operations.');
  return input.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid operation.');
    const op = raw as Operation;
    const fields = FIELDS[tool]?.[op.type];
    if (!fields || Object.keys(op).some(k => k !== 'type' && !fields.includes(k))) throw new Error('Unknown operation or field.');
    for (const [k, v] of Object.entries(op)) {
      if (['tab_id', 'group_id', 'window_id', 'index'].includes(k) && (!Number.isSafeInteger(v) || (v as number) < (k === 'index' ? -1 : 0))) throw new Error(`Invalid ${k}.`);
      if (['pinned', 'collapsed'].includes(k) && typeof v !== 'boolean') throw new Error(`Invalid ${k}.`);
      if (['type', 'title', 'url', 'label', 'id', 'parent_id', 'color'].includes(k) && (typeof v !== 'string' || v.length > (k === 'url' ? 8192 : 500))) throw new Error(`Invalid ${k}.`);
      if (k === 'tab_ids' && (!Array.isArray(v) || !v.length || v.length > 100 || v.some(id => !Number.isSafeInteger(id) || id < 0) || new Set(v).size !== v.length)) throw new Error('Invalid tab_ids.');
    }
    const required = tool === 'browser_update_tabs'
      ? (op.type === 'create' ? ['url'] : ['tab_id', ...(op.type === 'pin' ? ['pinned'] : op.type === 'label' ? ['label'] : op.type === 'move' ? ['index'] : [])])
      : tool === 'browser_manage_tab_groups'
        ? (['create', 'ungroup'].includes(op.type) ? ['tab_ids'] : ['group_id', ...(op.type === 'move' ? ['index'] : [])])
        : (op.type === 'create' ? ['parent_id', 'title'] : ['id', ...(op.type === 'move' ? ['parent_id'] : op.type === 'update' ? ['title'] : [])]);
    if (required.some(k => op[k] === undefined)) throw new Error(`Required fields: ${required.join(', ')}.`);
    if (op.color && !COLORS.includes(String(op.color))) throw new Error('Invalid group color.');
    if (op.type === 'create' && op.index !== undefined && Number(op.index) < 0) throw new Error('Creation index must be non-negative.');
    if (op.url !== undefined) {
      const url = new URL(String(op.url));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) URLs without credentials are supported.');
    }
    return { ...op };
  });
}

export function redactUrl(url: string): string {
  try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? `${u.protocol}//${u.host}/…` : '[hidden URL]'; }
  catch { return '[hidden URL]'; }
}
/** Also sanitize URLs embedded in titles/errors; raw recovery records never leave the backend. */
export function publicData<T>(value: T, full: boolean): T {
  if (full) return value;
  const walk = (v: unknown, key = ''): unknown => {
    if (typeof v === 'string') return /url/i.test(key) ? redactUrl(v) : v.replace(/(?:https?|file|chrome|chrome-extension):\/\/[^\s<>"']+/gi, redactUrl);
    if (Array.isArray(v)) return v.map(x => walk(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value) as T;
}

export interface Snapshot { tabs?: TabState[]; groups?: GroupState[]; bookmarks?: BookmarkState[] }
export interface TabState { id: number; windowId: number; index: number; url: string; title: string; pinned: boolean; active: boolean; groupId: number; label: string }
export interface GroupState { id: number; windowId: number; title: string; color: string; collapsed: boolean }
export interface BookmarkState { id: string; parentId?: string; index?: number; title: string; url?: string; unmodifiable?: string }
export interface Step { operation: Operation; before: Snapshot; after?: Snapshot; status: 'applying' | 'applied' | 'unknown'; changes?: EntityChange[] }
export interface EntityChange { kind: string; id: string; before?: unknown; after?: unknown }
export interface Batch {
  id: string; owner: number; epoch: string; tool: string; operations: Operation[]; before: Snapshot;
  createdAt: number; status: 'prepared' | 'applying' | 'applied' | 'failed' | 'unknown' | 'undone';
  steps: Step[]; error?: string; undoOf?: string; undoneBy?: string;
}
export interface PlanPreview { id: string; count: number; items: unknown[]; warning: string }
export type BrowserRequest =
  | { action: 'open-settings' }
  | { action: 'settings' }
  | { action: 'configure'; settings: BrowserSettings }
  | { action: 'read'; tool: string; params: Record<string, string> }
  | { action: 'prepare'; tool: string; params: Record<string, string> }
  | { action: 'commit'; planId: string }
  | { action: 'cancel'; planId: string };
