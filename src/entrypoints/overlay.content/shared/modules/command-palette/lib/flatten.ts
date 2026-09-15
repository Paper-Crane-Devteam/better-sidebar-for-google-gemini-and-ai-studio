import type { CommandGroup, CommandItem } from '../types';

/** Row order as the user sees it, so arrow keys can walk across group borders. */
export function flattenItems(groups: CommandGroup[]): CommandItem[] {
  return groups.flatMap((group) => group.items);
}

/**
 * Index of the first row of each group, aligned with `groups`. Lets a group
 * render its rows with their flat-list index without counting as it goes.
 */
export function groupOffsets(groups: CommandGroup[]): number[] {
  const offsets: number[] = [];
  let running = 0;
  for (const group of groups) {
    offsets.push(running);
    running += group.items.length;
  }
  return offsets;
}
