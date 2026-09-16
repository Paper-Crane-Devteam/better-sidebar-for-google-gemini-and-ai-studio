import { useMemo } from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { detectPlatform } from '@/shared/types/platform';
import {
  getIconBarSpec,
  resolveIconBar,
  type IconBarGroupId,
} from './registry';

/**
 * The icon bar as the current user has arranged it, plus the writes that change
 * it. Single source for the rail itself, its context menu and the settings panel,
 * so the three can never disagree about what is on or in what order.
 */
export function useIconBar() {
  const iconBar = useSettingsStore((state) => state.iconBar);
  const setIconVisible = useSettingsStore((state) => state.setIconVisible);
  const setIconBarOrder = useSettingsStore((state) => state.setIconBarOrder);
  const resetIconBar = useSettingsStore((state) => state.resetIconBar);

  const spec = useMemo(() => getIconBarSpec(detectPlatform()), []);

  /*
    Deliberately not memoised. Availability probes read the live DOM — Spark only
    exists once Gemini's mode switcher has rendered — so a result cached against
    the preferences object would pin the rail to whatever the page looked like on
    first render and never let Spark appear. The work is a handful of array
    operations and at most one `querySelector`, which is what the hardcoded rail
    did on every render anyway.
  */
  const groups = spec
    ? resolveIconBar(spec, {
        hidden: iconBar?.hidden ?? [],
        order: iconBar?.order ?? {},
      })
    : [];

  /**
   * Ids to render, per block. Partial because blocks are per-platform: ChatGPT
   * has no collapse toggle, so it has no `top` block at all.
   */
  const visible: Partial<Record<IconBarGroupId, string[]>> = {};
  for (const group of groups) visible[group.id] = group.visibleIds;

  const isVisible = (id: string) => {
    for (const group of groups) {
      if (group.visibleIds.includes(id)) return true;
      if (group.items.some((item) => item.id === id)) return false;
    }
    // Not in this platform's spec at all: leave the caller's own guard in charge
    // rather than hiding something we know nothing about.
    return true;
  };

  /** Move `id` so it sits at `toIndex` within its own block. */
  const move = (group: IconBarGroupId, id: string, toIndex: number) => {
    const target = groups.find((g) => g.id === group);
    if (!target) return;
    const ids = target.items.map((item) => item.id);
    const from = ids.indexOf(id);
    if (from === -1 || from === toIndex || toIndex < 0 || toIndex >= ids.length)
      return;
    ids.splice(from, 1);
    ids.splice(toIndex, 0, id);
    setIconBarOrder(group, ids);
  };

  return {
    /** Null on platforms with no customisable rail. */
    spec,
    groups,
    visible,
    isVisible,
    setIconVisible,
    move,
    resetIconBar,
  };
}
