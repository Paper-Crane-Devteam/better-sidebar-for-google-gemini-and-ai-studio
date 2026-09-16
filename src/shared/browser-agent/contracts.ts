/**
 * What the user can switch on, and what each switch costs them if it goes wrong.
 *
 * ⚠️ Closing tabs and deleting bookmarks are **their own capabilities**, not the write
 * half of `tabs`/`bookmarks`. They are the only destructive things on this side, and
 * they are also what "organize my tabs" is most easily read as meaning — so behind one
 * switch with reordering, a user has no way to say "tidy up, but don't throw anything
 * away", which is the common request. See §3 of the technical design.
 *
 * ⚠️ The prefix is the Chrome permission name (`permissionsFor` derives one from the
 * other), so a capability cannot be renamed without renaming a permission.
 */
export const CAPABILITIES = ['tabs.read', 'tabs.arrange', 'tabs.close', 'tabGroups.read', 'tabGroups.write', 'bookmarks.read', 'bookmarks.arrange', 'bookmarks.delete'] as const;
export type Capability = typeof CAPABILITIES[number];
export interface BrowserSettings { capabilities: Capability[]; shareFullUrls: boolean }
export const DEFAULT_SETTINGS: BrowserSettings = { capabilities: [], shareFullUrls: true };
/**
 * How much of a decision one batch is: nothing, something reversible, or something gone.
 *
 * Derived from the capability a tool needs, and never maintained as a per-operation risk
 * table — a batch's tier is the highest tier among its operations, and since every
 * destructive operation now has a tool of its own, that is just the tool's tier.
 */
export type Tier = 'read' | 'low' | 'lossy';
const CAPABILITY_TIERS: Record<Capability, Tier> = {
  'tabs.read': 'read', 'tabs.arrange': 'low', 'tabs.close': 'lossy',
  'tabGroups.read': 'read', 'tabGroups.write': 'low',
  'bookmarks.read': 'read', 'bookmarks.arrange': 'low', 'bookmarks.delete': 'lossy',
};
export const isWriteCapability = (cap: Capability) => CAPABILITY_TIERS[cap] !== 'read';
export const READ_TOOLS = ['browser_list_tabs', 'browser_list_tab_groups', 'browser_list_bookmarks', 'browser_query_changes'] as const;
/**
 * ⚠️ Destructive operations are separate **tools**, not an operation type inside a
 * general one. That way the tier is readable from the tool name alone: the approval UI
 * does not have to parse `operations` before it knows whether it may offer "allow for
 * this task", permission injection is one capability per tool, and mixing five closes
 * into a batch of moves to borrow the lower bar is impossible at the protocol level.
 * The tool name is also the most visible thing in the prompt — harder for a model to
 * skim past than a `"type":"close"` buried in JSON.
 */
export const WRITE_TOOLS = ['browser_arrange_tabs', 'browser_close_tabs', 'browser_manage_tab_groups', 'browser_arrange_bookmarks', 'browser_delete_bookmarks', 'browser_undo_changes'] as const;
export const BROWSER_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];
export const isBrowserTool = (name: string) => (BROWSER_TOOLS as readonly string[]).includes(name);
export const isBrowserWrite = (name: string) => (WRITE_TOOLS as readonly string[]).includes(name);
export const isChromeBuild = () => import.meta.env.BROWSER === 'chrome';

export function dependencies(cap: Capability): Capability[] {
  // Arranging or closing tabs reads group membership too: a tab that moves in or out of
  // a group has to be recorded that way, or the change cannot be described or undone.
  if (cap === 'tabs.arrange' || cap === 'tabs.close') return ['tabs.read', 'tabGroups.read', cap];
  if (cap === 'tabGroups.read') return ['tabs.read', cap];
  if (cap === 'tabGroups.write') return ['tabs.read', 'tabGroups.read', 'tabs.arrange', cap];
  if (cap === 'bookmarks.arrange' || cap === 'bookmarks.delete') return ['bookmarks.read', cap];
  return [cap];
}
export function permissionsFor(caps: readonly Capability[]): ('tabs' | 'tabGroups' | 'bookmarks')[] {
  return [...new Set(caps.map(c => c.split('.')[0] as 'tabs' | 'tabGroups' | 'bookmarks'))];
}
/**
 * The switches the settings window shows, and the capabilities each one grants.
 *
 * The list above stays at eight because the *tool layer* needs that granularity: a tier
 * comes from a capability, and permission injection is one capability per tool. What the
 * user is asked is a different question, and eight checkboxes answered it badly — three of
 * them only granted *reading*, and read access is not a feature anyone turns on by itself.
 * Nothing can be organized or deleted without first being read either, so the read
 * capabilities are not a choice at all; they are `dependencies()` of the two that are.
 *
 * What is left is the only distinction worth a switch: rearranging things, versus throwing
 * them away.
 *
 * ⚠️ The two are independent. "Delete" pulls its own read dependencies, so turning
 * "Organize" off does not silently disarm it — a user who allows closing tabs but not
 * reordering them gets exactly that.
 */
export const CAPABILITY_GROUPS = {
  organize: ['tabs.arrange', 'tabGroups.write', 'bookmarks.arrange'],
  remove: ['tabs.close', 'bookmarks.delete'],
} as const satisfies Record<string, readonly Capability[]>;
export type CapabilityGroup = keyof typeof CAPABILITY_GROUPS;
export const CAPABILITY_GROUP_IDS = Object.keys(CAPABILITY_GROUPS) as CapabilityGroup[];
/** Every capability a set of switches grants, read dependencies included. */
export const capabilitiesForGroups = (groups: readonly CapabilityGroup[]): Capability[] =>
  [...new Set(groups.flatMap(g => CAPABILITY_GROUPS[g] as readonly Capability[]).flatMap(dependencies))];
/**
 * Which switches a stored capability list reads as.
 *
 * All-or-nothing on purpose: a switch counts as on only when every capability it grants is
 * present. A list written by the build that offered read access on its own therefore reads
 * as *off*, which is the honest answer — two switches cannot describe it — and the page
 * narrows the stored list to match instead of drawing a switch that lies about what the
 * agent may do.
 */
export const groupsOf = (caps: readonly Capability[]): CapabilityGroup[] =>
  CAPABILITY_GROUP_IDS.filter(g => capabilitiesForGroups([g]).every(c => caps.includes(c)));
/** The read capability that also governs seeing a write capability's history. */
export const readCapability = (cap: Capability) => `${cap.split('.')[0]}.read` as Capability;
const BOOKMARK_WRITE_TOOLS: readonly string[] = ['browser_arrange_bookmarks', 'browser_delete_bookmarks'];
/**
 * Whether a batch of this tool works on tabs (and therefore on ids only this browser
 * session understands) or on bookmarks (which survive a restart).
 *
 * Same question `snapshot()` answers by choosing what to capture, asked from the tool
 * name alone so the history list can decide whether a batch is still undoable without
 * loading its snapshot.
 */
export const isTabTool = (tool: string) => !BOOKMARK_WRITE_TOOLS.includes(tool);

export function toolCapability(name: string): Capability | undefined {
  const map: Record<string, Capability> = {
    browser_list_tabs: 'tabs.read', browser_arrange_tabs: 'tabs.arrange', browser_close_tabs: 'tabs.close',
    browser_list_tab_groups: 'tabGroups.read', browser_manage_tab_groups: 'tabGroups.write',
    browser_list_bookmarks: 'bookmarks.read', browser_arrange_bookmarks: 'bookmarks.arrange',
    browser_delete_bookmarks: 'bookmarks.delete',
  };
  return map[name];
}
/**
 * A tool's tier.
 *
 * `browser_undo_changes` has none of its own: undoing a move is a move, but undoing a
 * creation is a deletion — and the folders it would delete may have things in them by
 * now. So the backend decides that one per plan, from what the original batch created,
 * and this answers `low` only as the floor for a tool with no capability.
 */
export function tierOf(tool: string): Tier {
  const cap = toolCapability(tool);
  return cap ? CAPABILITY_TIERS[cap] : isBrowserWrite(tool) ? 'low' : 'read';
}

export type Operation = { type: string; [key: string]: string | number | boolean | number[] | undefined };
/**
 * Every operation each tool accepts, and every field each operation accepts.
 *
 * Read as the whole protocol: a tool cannot be asked for an operation missing from its
 * row, which is what makes `browser_close_tabs` the *only* way to close a tab and
 * `browser_delete_bookmarks` the only way to delete one.
 *
 * ⚠️ No `label`. A note only the extension could see, keyed on a tab id, gone at the
 * next browser restart — absent exactly when the user would go looking for it, while
 * costing a write, an approval, an audit row and an undo path. It comes back if it gets a
 * durable carrier (keyed by URL, or Firefox's `sessions.setTabValue`). See §1.
 */
const FIELDS: Record<string, Record<string, string[]>> = {
  browser_arrange_tabs: {
    create: ['url', 'window_id', 'index'], activate: ['tab_id'],
    move: ['tab_id', 'window_id', 'index'], pin: ['tab_id', 'pinned'],
  },
  browser_close_tabs: { close: ['tab_id'] },
  browser_manage_tab_groups: {
    create: ['tab_ids', 'title', 'color'], update: ['group_id', 'title', 'color', 'collapsed'],
    move: ['group_id', 'window_id', 'index'], ungroup: ['tab_ids'],
  },
  browser_arrange_bookmarks: {
    create: ['parent_id', 'title', 'url', 'index'], update: ['id', 'title'],
    move: ['id', 'parent_id', 'index'],
  },
  browser_delete_bookmarks: { delete: ['id'] },
};
/** Fields without which an operation is not a request, per tool and type. */
const REQUIRED: Record<string, Record<string, string[]>> = {
  browser_arrange_tabs: { create: ['url'], activate: ['tab_id'], move: ['tab_id', 'index'], pin: ['tab_id', 'pinned'] },
  browser_close_tabs: { close: ['tab_id'] },
  browser_manage_tab_groups: { create: ['tab_ids'], ungroup: ['tab_ids'], update: ['group_id'], move: ['group_id', 'index'] },
  browser_arrange_bookmarks: { create: ['parent_id', 'title'], update: ['id', 'title'], move: ['id', 'parent_id'] },
  browser_delete_bookmarks: { delete: ['id'] },
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
      if (['type', 'title', 'url', 'id', 'parent_id', 'color'].includes(k) && (typeof v !== 'string' || v.length > (k === 'url' ? 8192 : 500))) throw new Error(`Invalid ${k}.`);
      if (k === 'tab_ids' && (!Array.isArray(v) || !v.length || v.length > 100 || v.some(id => !Number.isSafeInteger(id) || id < 0) || new Set(v).size !== v.length)) throw new Error('Invalid tab_ids.');
    }
    const required = REQUIRED[tool]?.[op.type] ?? [];
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
export interface TabState { id: number; windowId: number; index: number; url: string; title: string; pinned: boolean; active: boolean; groupId: number }
export interface GroupState { id: number; windowId: number; title: string; color: string; collapsed: boolean }
export interface BookmarkState { id: string; parentId?: string; index?: number; title: string; url?: string; unmodifiable?: string }
export interface Step { operation: Operation; before: Snapshot; after?: Snapshot; status: 'applying' | 'applied' | 'unknown'; changes?: EntityChange[] }
export interface EntityChange { kind: string; id: string; before?: unknown; after?: unknown }
export interface Batch {
  id: string; owner: number; epoch: string; tool: string; operations: Operation[]; before: Snapshot;
  createdAt: number; status: 'prepared' | 'applying' | 'applied' | 'failed' | 'unknown' | 'undone';
  steps: Step[]; error?: string; undoOf?: string; undoneBy?: string;
}
/**
 * A batch as the history list needs it: everything except the snapshots.
 *
 * The list used to be built by loading every batch in full and reading four fields off
 * each one. With before/after states per step that is the largest read in the module,
 * performed to render a dozen lines of text.
 */
export interface BatchSummary {
  id: string; epoch: string; tool: string; status: Batch['status']; createdAt: number;
  error?: string; undoOf?: string; undoneBy?: string;
  /** Operations planned, steps recorded, and of those the ones that definitely applied. */
  planned: number; steps: number; applied: number;
  touchesTabs: boolean;
}
/**
 * Where an object sits, said without a single id.
 *
 * ⚠️ **No field here is an id, and none may become one.** Chrome's tab, window, group and
 * bookmark ids are how the engine keeps an approval bound to the objects it was granted
 * for; they describe nothing. The card used to print them raw — `#66 · was at 7 · was in
 * 1` — which asked the user to authorise a change to an object named by three numbers they
 * had never seen and could not look up. Every field below is instead something they can
 * see for themselves: a folder has a name, a window has an ordinal, a position counts
 * from 1. The resolution happens in the background, against `Batch.before`, which holds
 * the whole bookmark tree and every non-incognito tab — so it is exact, not a guess.
 */
export interface Placement {
  /** 1-based ordinal among the windows in the snapshot. Omitted when there is only one. */
  window?: number;
  /** Set when that window is the one the sidebar is in — friendlier than any ordinal. */
  hostWindow?: boolean;
  /** Tab group name. Present but empty for a group the user never named. */
  group?: string;
  /** Containing bookmark folder, by name. */
  folder?: string;
  /** 1-based position in its window or folder. */
  position?: number;
  pinned?: boolean;
  url?: string;
}
export interface PreviewTarget extends Placement { title: string }
/** One object an undo would put back: where it is now, and where it would end up. */
export interface PreviewChange { title: string; from?: Placement; to?: Placement }
export interface PreviewItem {
  /** Operation type — `close`, `move`, `create`, … Translated by the card. */
  type: string;
  /**
   * The operation's own parameters, as a person should read them: ids already resolved to
   * names, positions counted from 1, and the ones that only repeated `targets` dropped.
   */
  details: Record<string, string | number | boolean>;
  targets: PreviewTarget[];
  /** How many objects the operation touches. `targets` itself is capped at 100. */
  targetCount: number;
  undo?: boolean;
  changes?: PreviewChange[];
}
/**
 * A batch as the approval UI shows it: the real objects each operation would touch.
 *
 * ⚠️ `undo` and `tier` rather than a `warning` sentence. The closing warning used to be
 * composed in the service worker and shipped as literal text, which put two paragraphs of
 * user-facing prose in the one context that has no locale. The preview only has to say
 * *which* warning applies; the wording belongs with every other string the user reads.
 */
export interface PlanPreview { id: string; count: number; items: PreviewItem[]; undo: boolean; tier: Tier }
export type BrowserRequest =
  | { action: 'open-settings' }
  | { action: 'settings' }
  | { action: 'configure'; settings: BrowserSettings }
  | { action: 'read'; tool: string; params: Record<string, string> }
  | { action: 'prepare'; tool: string; params: Record<string, string> }
  | { action: 'commit'; planId: string }
  | { action: 'cancel'; planId: string };
