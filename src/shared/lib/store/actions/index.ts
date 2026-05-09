import type { SetState, GetState } from '../types';
import { createOverlayActions } from './overlay';
import { createExplorerActions } from './explorer';
import { createFavoritesActions } from './favorites';
import { createSearchActions } from './search';
import { createDataActions } from './data';
import { createTagActions } from './tags';
import { createPromptsActions } from './prompts';
import { createGemsActions } from './gems';
import { createNotebooksActions } from './notebooks';

export function createAllActions(set: SetState, get: GetState) {
  return {
    ...createOverlayActions(set),
    ...createExplorerActions(set, get),
    ...createFavoritesActions(set),
    ...createSearchActions(set, get),
    ...createDataActions(set, get),
    ...createTagActions(get),
    ...createPromptsActions(set, get),
    ...createGemsActions(set, get),
    ...createNotebooksActions(set, get),
  };
}
