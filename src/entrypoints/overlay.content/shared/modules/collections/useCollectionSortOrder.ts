import { useSettingsStore } from '@/shared/lib/settings-store';
import type { CollectionSortOrder } from '@/shared/lib/store/types';
import type { CollectionScope } from '@/shared/types/db';

const DEFAULT_SORT: CollectionSortOrder = 'alpha';

/** The persisted sort mode of one panel, and its setter. */
export function useCollectionSortOrder(
  scope: CollectionScope,
): [CollectionSortOrder, (order: CollectionSortOrder) => void] {
  const order = useSettingsStore((s) => s.collectionSortOrder?.[scope]) ?? DEFAULT_SORT;
  const setOrder = useSettingsStore((s) => s.setCollectionSortOrder);
  return [order, (next) => setOrder(scope, next)];
}

/** Non-hook read, for event handlers. */
export function getCollectionSortOrder(scope: CollectionScope): CollectionSortOrder {
  return useSettingsStore.getState().collectionSortOrder?.[scope] ?? DEFAULT_SORT;
}
