import { ArrowDownAZ, Clock, FolderPlus, GripVertical } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import type { CollectionSortOrder } from '@/shared/lib/store/types';
import type { CollectionScope } from '@/shared/types/db';
import { useCollectionSortOrder } from './useCollectionSortOrder';

// alpha → date → custom → alpha. Leaving custom keeps the stored ranks, so
// coming back restores the arrangement.
const NEXT_SORT: Record<CollectionSortOrder, CollectionSortOrder> = {
  alpha: 'date',
  date: 'custom',
  custom: 'alpha',
};

/** Sort-mode toggle and "new folder" for the Gems / Notebooks panel header. */
export const CollectionHeaderButtons = ({
  scope,
  onNewFolder,
}: {
  scope: CollectionScope;
  onNewFolder: () => void;
}) => {
  const { t } = useI18n();
  const [sortOrder, setSortOrder] = useCollectionSortOrder(scope);

  // Describes the order currently applied, matching the icon, not the next one.
  const tooltip: Record<CollectionSortOrder, string> = {
    alpha: t('menu.sortedAlphabetically'),
    date: t('menu.sortedByDate'),
    custom: t('menu.sortedCustom'),
  };

  return (
    <>
      <SimpleTooltip content={tooltip[sortOrder]}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setSortOrder(NEXT_SORT[sortOrder] ?? 'alpha')}
        >
          {sortOrder === 'alpha' ? (
            <ArrowDownAZ className="h-4 w-4" />
          ) : sortOrder === 'custom' ? (
            <GripVertical className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
        </Button>
      </SimpleTooltip>

      <SimpleTooltip content={t('menu.newFolder')}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewFolder}>
          <FolderPlus className="h-4 w-4" />
        </Button>
      </SimpleTooltip>
    </>
  );
};
