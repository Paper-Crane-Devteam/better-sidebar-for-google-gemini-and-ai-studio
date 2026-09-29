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
export const WRITE_TOOLS = ['browser_arrange_tabs', 'browser_close_tabs', 'browser_manage_tab_groups', 'browser_arrange_bookmarks', 'browser_delete_bookmarks', 'browser_restore_state'] as const;
/** The tool that puts a recorded state back. Never stored as a batch's own `tool`. */
export const RESTORE_TOOL = 'browser_restore_state';
/**
 * Which of a batch's two snapshots to restore: the state it started from, or the one it
 * produced. Both are offered, because the second is what someone wants after they have
 * undone a batch by hand and changed their mind.
 */
export const RESTORE_SIDES = ['before', 'after'] as const;
export type RestoreSide = typeof RESTORE_SIDES[number];
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
 * user is asked is a different question, and only two of the eight are a real choice —
 * read access is not a feature anyone turns on by itself, and nothing can be organized or
 * deleted without first being read, so the read capabilities are `dependencies()` of the
 * two that are.
 *
 * What is left is two distinctions worth a switch: rearranging things versus throwing them
 * away, and tabs versus bookmarks. The second one matters because the two are different
 * Chrome permissions guarding very different data — someone who wants their tabs grouped
 * has no reason to hand over their whole bookmark tree, and the reverse.
 *
 * ⚠️ All four are independent. A "remove" switch pulls its own read dependencies, so
 * turning "organize" off does not silently disarm it — a user who allows closing tabs but
 * not reordering them gets exactly that. And no tab switch grants anything under
 * `bookmarks.*`, or vice versa, so each side requests only its own Chrome permission.
 *
 * ⚠️ Every capability belongs to exactly one switch. A list stored by the older two-switch
 * build (`organize` = both arranges + group writes, `remove` = both deletes) is a union of
 * these four, so `groupsOf` reads it back without losing anything.
 */
export const CAPABILITY_GROUPS = {
  tabsOrganize: ['tabs.arrange', 'tabGroups.write'],
  tabsRemove: ['tabs.close'],
  bookmarksOrganize: ['bookmarks.arrange'],
  bookmarksRemove: ['bookmarks.delete'],
} as const satisfies Record<string, readonly Capability[]>;
export type CapabilityGroup = keyof typeof CAPABILITY_GROUPS;
export const CAPABILITY_GROUP_IDS = Object.keys(CAPABILITY_GROUPS) as CapabilityGroup[];
/** How the settings window lays the switches out: one section per kind of object. */
export const CAPABILITY_SECTIONS = {
  tabs: ['tabsOrganize', 'tabsRemove'],
  bookmarks: ['bookmarksOrganize', 'bookmarksRemove'],
} as const satisfies Record<string, readonly CapabilityGroup[]>;
export type CapabilitySection = keyof typeof CAPABILITY_SECTIONS;
export const CAPABILITY_SECTION_IDS = Object.keys(CAPABILITY_SECTIONS) as CapabilitySection[];
/** Every capability a set of switches grants, read dependencies included. */
export const capabilitiesForGroups = (groups: readonly CapabilityGroup[]): Capability[] =>
  [...new Set(groups.flatMap(g => CAPABILITY_GROUPS[g] as readonly Capability[]).flatMap(dependencies))];
/**
 * Which switches a stored capability list reads as.
 *
 * All-or-nothing on purpose: a switch counts as on only when every capability it grants is
 * present. A stored list holding only some of them reads as *off*, which is the honest
 * answer — the switches cannot describe it — and the page narrows the stored list to match
 * rather than drawing a switch that lies about what the agent may do.
 */
export const groupsOf = (caps: readonly Capability[]): CapabilityGroup[] =>
  CAPABILITY_GROUP_IDS.filter(g => capabilitiesForGroups([g]).every(c => caps.includes(c)));
/** The read capability that also governs seeing a write capability's history. */
export const readCapability = (cap: Capability) => `${cap.split('.')[0]}.read` as Capability;
const BOOKMARK_WRITE_TOOLS: readonly string[] = ['browser_arrange_bookmarks', 'browser_delete_bookmarks'];
/**
 * Whether a batch of this tool works on tabs and groups or on bookmarks.
 *
 * The same question `snapshot()` answers by choosing what to capture, asked from the tool
 * name alone — which is also what decides whether a snapshot's ids are the per-session
 * kind, and so how a restore has to recognise its objects (see `resolveRestore`).
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
 * `RESTORE_TOOL` is `low` unconditionally, and that is a property of what restoring does:
 * it puts recorded objects back and never removes one, so there is nothing it can destroy.
 * A batch stored for a restore carries an `arrange` tool name, so the capability check and
 * the tier both come out of the same place every other batch gets them from.
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
/**
 * One operation's verdict.
 *
 * A step carries no snapshot of its own. What a batch is worth keeping for is the two
 * states it sits between, and those are on the batch — so a step only has to answer
 * "did this one land", which is what turns a partial batch into something a person can
 * read.
 */
export interface Step { operation: Operation; status: 'applying' | 'applied' | 'unknown' }
/**
 * One batch, and the two states it sits between.
 *
 * `before` and `after` are full snapshots: every non-incognito tab and group, or the
 * whole bookmark tree. They are what the journal is for. Both are restorable, both are
 * what the detail view draws, and `before` is also what the preview resolves ids against
 * so the approval card can name objects instead of numbering them.
 *
 * `after` is absent until the batch stops. A batch interrupted mid-run therefore has one
 * snapshot, which is the honest answer — nobody knows what state it ended in.
 */
export interface Batch {
  id: string; owner: number; epoch: string; tool: string; operations: Operation[];
  before: Snapshot; after?: Snapshot;
  createdAt: number; status: 'prepared' | 'applying' | 'applied' | 'failed' | 'unknown';
  steps: Step[]; error?: string;
  /** Set when this batch restored another one's snapshot, naming which side. */
  restoreOf?: string; restoreSide?: RestoreSide;
}
/** A batch as the history list needs it: metadata and counts, never a snapshot. */
export interface BatchSummary {
  id: string; epoch: string; tool: string; status: Batch['status']; createdAt: number;
  error?: string; restoreOf?: string; restoreSide?: RestoreSide;
  /** Operations planned, steps recorded, and of those the ones that definitely applied. */
  planned: number; steps: number; applied: number;
  /** Whether an `after` snapshot was recorded, and so whether that side can be restored. */
  hasAfter: boolean;
}
/**
 * Where an object sits, said without a single id.
 *
 * ⚠️ **No field here is an id, and none may become one.** Chrome's tab, window, group and
 * bookmark ids are how the engine keeps an approval bound to the objects it was granted
 * for; they describe nothing, and a user asked to authorise a change to `#66` has been
 * shown a number they cannot look up. Every field below is something they can see for
 * themselves: a folder has a name, a window has an ordinal, a position counts from 1. The
 * resolution happens in the background against `Batch.before`, which holds the whole
 * bookmark tree and every non-incognito tab — so it is exact, not a guess.
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
}

/**
 * A recorded state, shaped the way the browser shows it: windows containing groups
 * containing tabs, or folders containing bookmarks.
 *
 * A tree rather than a list of changed fields, because that is the question a person
 * actually has — "what did my browser look like" — and it is the one shape that can be
 * checked at a glance against the browser sitting next to it. It also removes the last
 * reason to mention an id: a container is a node the user can see, not a number that
 * would have to stand in for one.
 *
 * Built in the background from a whole `Snapshot`, so every parent is present. The
 * component renders it and composes no facts of its own.
 */
export type TreeNodeKind = 'window' | 'pinned' | 'group' | 'folder' | 'tab' | 'bookmark';
/** What a restore would do to one node. Absent when the tree is being shown, not applied. */
export type TreeEffect = 'keep' | 'restore' | 'reopen' | 'create';
export interface TreeNode {
  /** Render key. Derived from ids, never displayed. */
  key: string;
  kind: TreeNodeKind;
  /** The object's own name. Absent for a window; empty for a group with no name. */
  title?: string;
  url?: string;
  /** Windows only: 1-based ordinal, omitted when this is the window the sidebar is in. */
  window?: number;
  hostWindow?: boolean;
  /** Groups only, as Chrome's colour name. */
  color?: string;
  effect?: TreeEffect;
  children?: TreeNode[];
}
/**
 * What restoring a snapshot would come to, in objects.
 *
 * `extra` is the one that has to be shown: it counts what exists now and is *not* in the
 * snapshot, and restoring leaves every one of it alone. That is the whole difference
 * between this and making the browser equal to the tree on screen, and a user who is not
 * told the number will read the tree as a promise that it is the latter.
 */
export interface RestoreEffects { restore: number; reopen: number; create: number; keep: number; extra: number }

/** A batch as the approval UI shows it: the real objects each operation would touch. */
export interface OperationsPlan {
  id: string; kind: 'operations'; tier: Tier; count: number; items: PreviewItem[];
  /**
   * Objects of the same kind that no operation in this batch names.
   *
   * The *scope* of the batch, and it has to be shown. "32 of your 84 tabs are not being
   * touched" and "52 tabs are being touched" are not the same information: only the first
   * tells the user whether the agent understood how much of their browser is in play.
   */
  untouched: number;
}
/**
 * A restore as the approval UI shows it: the state being restored, and what it costs.
 *
 * No operation list, because a restore is one decision — the tree *is* the thing being
 * approved. `tier` is fixed rather than derived: restoring only puts objects back.
 */
export interface RestorePlan {
  id: string; kind: 'restore'; tier: 'low'; side: RestoreSide;
  tree: TreeNode[]; effects: RestoreEffects;
  /**
   * Set when the recorded state puts the host tab in a group it is not in — or takes it out
   * of one it is in — and the restore is therefore leaving its group alone (§13).
   *
   * ⚠️ Has to be said on the card. The tree draws the host inside the group the snapshot
   * recorded, so without this line the user approves a picture that is accurate about
   * everything except the one tab they are looking at the panel from.
   */
  hostGroupKept?: boolean;
}
export type PlanPreview = OperationsPlan | RestorePlan;
export type BrowserRequest =
  | { action: 'open-settings' }
  | { action: 'settings' }
  | { action: 'configure'; settings: BrowserSettings }
  | { action: 'read'; tool: string; params: Record<string, string> }
  /** Both of a batch's recorded states, as trees, for the journal's detail view. */
  | { action: 'trees'; batchId: string }
  | { action: 'prepare'; tool: string; params: Record<string, string> }
  | { action: 'commit'; planId: string }
  | { action: 'cancel'; planId: string };
/** The reply to `trees`. `after` is absent for a batch that never finished. */
export interface BatchTrees { before: TreeNode[]; after?: TreeNode[] }
