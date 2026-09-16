/**
 * What the sidebar icon bar can contain, per platform.
 *
 * The rail used to be hardcoded JSX in each platform's `OverlayPanel`, with a
 * handful of `shortcuts.foo &&` guards sprinkled through it. That made order a
 * property of the source file, so it could never be user-controlled. This module
 * is the single description of *which* icons exist, *which block* they belong to
 * and *whether they can be hidden*; the panels keep owning what each icon does
 * and how it renders, and simply look their nodes up by id.
 *
 * Platforms differ enough that a shared list would be wrong on all of them:
 * Gemini has Gems and Notebooks, AI Studio has Build and the API dashboard,
 * ChatGPT has Images and Codex, and only Gemini/AI Studio have an account chip.
 * Hence one spec per platform. The persisted state is already per-platform —
 * `settings-store` picks a different storage key for each host — so nothing here
 * needs to key by platform a second time.
 */

import {
  BookOpen,
  Bot,
  CircleUserRound,
  Code2,
  Files,
  Hammer,
  Image,
  LayoutDashboard,
  LayoutGrid,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  ScrollText,
  Settings,
  Sparkles,
  Star,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { Platform } from '@/shared/types/platform';
import { isSparkAvailable } from '../spark/SparkTab';

/**
 * The rail's visual blocks, top to bottom. Blank space separates them on screen,
 * and reordering is confined to within a block — dragging Gems up among the tabs
 * would move it across a gap the user reads as meaningful.
 *
 * `top` is the collapse/menu toggle's own block. It is a block of its own rather
 * than the first entry of `main` because on Gemini it lives outside the part of
 * the rail that swaps between collapsed and expanded.
 */
export type IconBarGroupId = 'top' | 'main' | 'links' | 'bottom';

export interface IconBarItemDef {
  /** Stable id. Persisted, so renaming one silently resets that icon. */
  id: string;
  group: IconBarGroupId;
  /** i18n key for the label shown in the context menu and the customizer. */
  labelKey: string;
  /** Preview glyph for the customizer rows. */
  icon?: LucideIcon;
  /** Iconify name, for the few icons that are not Lucide. Wins over `icon`. */
  iconify?: string;
  /**
   * Cannot be hidden. Reserved for the three icons that are the way back to
   * everything else: the collapse toggle, the Library tab and Settings. Losing
   * any of them would leave no in-sidebar route to undo the change.
   */
  locked?: boolean;
  /**
   * Whether the host page currently offers this feature. Unavailable items are
   * dropped from the rail *and* from the menus, so the user is never offered a
   * checkbox for something that would not appear either way.
   */
  available?: () => boolean;
}

export interface IconBarGroupDef {
  id: IconBarGroupId;
  labelKey: string;
}

export interface IconBarSpec {
  groups: IconBarGroupDef[];
  items: IconBarItemDef[];
}

const GROUPS: Record<IconBarGroupId, IconBarGroupDef> = {
  top: { id: 'top', labelKey: 'iconBar.groupTop' },
  main: { id: 'main', labelKey: 'iconBar.groupMain' },
  links: { id: 'links', labelKey: 'iconBar.groupLinks' },
  bottom: { id: 'bottom', labelKey: 'iconBar.groupBottom' },
};

const groupList = (...ids: IconBarGroupId[]) => ids.map((id) => GROUPS[id]);

const GEMINI_SPEC: IconBarSpec = {
  groups: groupList('top', 'main', 'links', 'bottom'),
  items: [
    {
      id: 'menu',
      group: 'top',
      labelKey: 'tooltip.toggleMenu',
      icon: Menu,
      locked: true,
    },
    {
      id: 'files',
      group: 'main',
      labelKey: 'tabs.files',
      icon: Files,
      locked: true,
    },
    { id: 'search', group: 'main', labelKey: 'tabs.search', icon: Search },
    {
      id: 'prompts',
      group: 'main',
      labelKey: 'tabs.prompts',
      iconify: 'tabler:blockquote',
    },
    { id: 'agent', group: 'main', labelKey: 'tabs.agent', icon: Bot },
    { id: 'tags', group: 'main', labelKey: 'tabs.tags', icon: Tag },
    { id: 'favorites', group: 'main', labelKey: 'tabs.favorites', icon: Star },
    {
      id: 'snippets',
      group: 'main',
      labelKey: 'tabs.snippets',
      icon: ScrollText,
    },
    {
      id: 'gems',
      group: 'links',
      labelKey: 'tabs.gems',
      iconify: 'tabler:diamond',
    },
    {
      id: 'notebooks',
      group: 'links',
      labelKey: 'tabs.notebooks',
      iconify: 'tabler:notebook',
    },
    {
      id: 'spark',
      group: 'links',
      labelKey: 'tabs.spark',
      icon: Sparkles,
      available: isSparkAvailable,
    },
    {
      id: 'myStuff',
      group: 'links',
      labelKey: 'shortcuts.myStuff',
      icon: Library,
    },
    {
      id: 'originalUI',
      group: 'bottom',
      labelKey: 'shortcuts.originalUI',
      icon: LogOut,
    },
    {
      id: 'feedback',
      group: 'bottom',
      labelKey: 'tabs.feedback',
      icon: MessageSquare,
    },
    {
      id: 'settings',
      group: 'bottom',
      labelKey: 'tabs.settings',
      icon: Settings,
      locked: true,
    },
    {
      id: 'account',
      group: 'bottom',
      labelKey: 'tooltip.account',
      icon: CircleUserRound,
    },
  ],
};

const AISTUDIO_SPEC: IconBarSpec = {
  groups: groupList('top', 'main', 'links', 'bottom'),
  items: [
    {
      id: 'collapse',
      group: 'top',
      labelKey: 'tooltip.collapseSidebar',
      icon: Menu,
      locked: true,
    },
    {
      id: 'files',
      group: 'main',
      labelKey: 'tabs.files',
      icon: Files,
      locked: true,
    },
    { id: 'search', group: 'main', labelKey: 'tabs.search', icon: Search },
    {
      id: 'prompts',
      group: 'main',
      labelKey: 'tabs.prompts',
      iconify: 'tabler:blockquote',
    },
    { id: 'agent', group: 'main', labelKey: 'tabs.agent', icon: Bot },
    { id: 'favorites', group: 'main', labelKey: 'tabs.favorites', icon: Star },
    {
      id: 'snippets',
      group: 'main',
      labelKey: 'tabs.snippets',
      icon: ScrollText,
    },
    { id: 'tags', group: 'main', labelKey: 'tabs.tags', icon: Tag },
    { id: 'build', group: 'links', labelKey: 'shortcuts.build', icon: Hammer },
    {
      id: 'dashboard',
      group: 'links',
      labelKey: 'shortcuts.dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'documentation',
      group: 'links',
      labelKey: 'shortcuts.documentation',
      icon: BookOpen,
    },
    {
      id: 'originalUI',
      group: 'bottom',
      labelKey: 'shortcuts.originalUI',
      icon: LogOut,
    },
    {
      id: 'feedback',
      group: 'bottom',
      labelKey: 'tabs.feedback',
      icon: MessageSquare,
    },
    {
      id: 'settings',
      group: 'bottom',
      labelKey: 'tabs.settings',
      icon: Settings,
      locked: true,
    },
    {
      id: 'account',
      group: 'bottom',
      labelKey: 'tooltip.account',
      icon: CircleUserRound,
    },
  ],
};

const CHATGPT_SPEC: IconBarSpec = {
  groups: groupList('main', 'links', 'bottom'),
  items: [
    {
      id: 'files',
      group: 'main',
      labelKey: 'tabs.files',
      icon: Files,
      locked: true,
    },
    { id: 'search', group: 'main', labelKey: 'tabs.search', icon: Search },
    {
      id: 'prompts',
      group: 'main',
      labelKey: 'tabs.prompts',
      iconify: 'tabler:blockquote',
    },
    { id: 'favorites', group: 'main', labelKey: 'tabs.favorites', icon: Star },
    {
      id: 'snippets',
      group: 'main',
      labelKey: 'tabs.snippets',
      icon: ScrollText,
    },
    { id: 'tags', group: 'main', labelKey: 'tabs.tags', icon: Tag },
    { id: 'images', group: 'links', labelKey: 'shortcuts.images', icon: Image },
    { id: 'apps', group: 'links', labelKey: 'shortcuts.apps', icon: LayoutGrid },
    { id: 'codex', group: 'links', labelKey: 'shortcuts.codex', icon: Code2 },
    {
      id: 'originalUI',
      group: 'bottom',
      labelKey: 'shortcuts.originalUI',
      icon: LogOut,
    },
    {
      id: 'feedback',
      group: 'bottom',
      labelKey: 'tabs.feedback',
      icon: MessageSquare,
    },
    {
      id: 'settings',
      group: 'bottom',
      labelKey: 'tabs.settings',
      icon: Settings,
      locked: true,
    },
  ],
};

const SPECS: Partial<Record<Platform, IconBarSpec>> = {
  [Platform.GEMINI]: GEMINI_SPEC,
  [Platform.AI_STUDIO]: AISTUDIO_SPEC,
  [Platform.CHATGPT]: CHATGPT_SPEC,
};

export function getIconBarSpec(platform: Platform): IconBarSpec | null {
  return SPECS[platform] ?? null;
}

/**
 * Reconcile a persisted order with the current spec.
 *
 * Persisted orders go stale in both directions: an icon we removed is still in
 * the array, and an icon we added is missing from it. Unknown ids are dropped;
 * new ids land right after whichever of their default predecessors survived, so
 * a newly shipped icon appears where it was designed to appear instead of being
 * exiled to the end of the block.
 */
function mergeOrder(defaults: string[], saved: string[]): string[] {
  const known = new Set(defaults);
  const result = saved.filter((id) => known.has(id));
  defaults.forEach((id, index) => {
    if (result.includes(id)) return;
    let anchor = -1;
    for (let before = index - 1; before >= 0; before--) {
      const at = result.indexOf(defaults[before]);
      if (at !== -1) {
        anchor = at;
        break;
      }
    }
    result.splice(anchor + 1, 0, id);
  });
  return result;
}

export interface IconBarPreferences {
  hidden: string[];
  order: Partial<Record<string, string[]>>;
}

export interface ResolvedIconBarGroup {
  id: IconBarGroupId;
  labelKey: string;
  /** Every available item in the block, in the user's order. */
  items: IconBarItemDef[];
  /** The subset that is actually rendered on the rail. */
  visibleIds: string[];
}

/** Turn spec + saved preferences into the exact blocks the rail should render. */
export function resolveIconBar(
  spec: IconBarSpec,
  prefs: IconBarPreferences,
): ResolvedIconBarGroup[] {
  const hidden = new Set(prefs.hidden ?? []);

  return spec.groups.map((group) => {
    const available = spec.items.filter(
      (item) => item.group === group.id && (item.available?.() ?? true),
    );
    const byId = new Map(available.map((item) => [item.id, item]));
    const order = mergeOrder(
      available.map((item) => item.id),
      prefs.order?.[group.id] ?? [],
    );
    const items = order.map((id) => byId.get(id)!).filter(Boolean);

    return {
      id: group.id,
      labelKey: group.labelKey,
      items,
      visibleIds: items
        .filter((item) => item.locked || !hidden.has(item.id))
        .map((item) => item.id),
    };
  });
}
