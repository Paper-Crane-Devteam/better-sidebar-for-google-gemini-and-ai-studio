import { useState, useMemo, useCallback } from 'react';
import { Plus, ScanSearch, Loader2 } from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { navigate } from '@/shared/lib/navigation';
import { useModalStore } from '@/shared/lib/modal';
import { usePopoverPickerStore } from '@/shared/lib/popover-picker';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '@/shared/components/ui/button';
import { toast } from '@/shared/lib/toast';
import type { Gem } from '@/shared/types/db';
import { useShallow } from 'zustand/react/shallow';
import { CollectionPicker } from '../../collections/CollectionPicker';

interface GemPickerContentProps {
  lastSelectedGemId?: string | null;
  /**
   * Close the surrounding modal when a gem is picked. Default true.
   * Set to false when the picker is opened *from inside* a modal that
   * should stay open after the selection (e.g. folder settings).
   */
  closeModalOnSelect?: boolean;
  /**
   * Remember the picked gem as "last selected". Default true.
   * Set to false when the pick is not about starting a chat (e.g. binding
   * a gem to a folder), so the New Chat shortcut isn't hijacked.
   */
  recordLastSelected?: boolean;
  /** Gem IDs to hide from the list */
  excludeIds?: string[];
  /** Show each gem's current default folder as a hint on the right */
  showDefaultFolderHint?: boolean;
}

export const GemPickerContent = ({
  closeModalOnSelect = true,
  recordLastSelected = true,
  excludeIds,
  showDefaultFolderHint,
}: GemPickerContentProps) => {
  const { t } = useI18n();
  const { gems, folders, fetchData } = useAppStore(
    useShallow((s) => ({
      gems: s.gems,
      folders: s.folders,
      fetchData: s.fetchData,
    })),
  );
  const close = useModalStore((s) => s.close);
  const closePopover = usePopoverPickerStore((s) => s.close);
  const [isScanning, setIsScanning] = useState(false);

  const candidates = useMemo(
    () => (excludeIds?.length ? gems.filter((g) => !excludeIds.includes(g.id)) : gems),
    [gems, excludeIds],
  );

  // Library folder names, for the default-folder hint
  const folderNameById = useMemo(() => {
    if (!showDefaultFolderHint) return null;
    return new Map(folders.map((f) => [f.id, f.name]));
  }, [folders, showDefaultFolderHint]);

  const handleSelect = useCallback(
    (gem: Gem) => {
      if (recordLastSelected) useSettingsStore.getState().setLastSelectedGemId(gem.id);
      if (closeModalOnSelect) close();
      usePopoverPickerStore.getState().resolve(gem);
    },
    [close, closeModalOnSelect, recordLastSelected],
  );

  const handleCreateGem = useCallback(() => {
    close();
    closePopover();
    navigate('https://gemini.google.com/gems/create');
  }, [close, closePopover]);

  const handleScanGems = useCallback(async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'START_GEM_SCAN',
      });
      if (response?.success) {
        await fetchData(true);
      } else {
        toast.error(response?.error || t('gems.scanFailed'));
      }
    } catch (err) {
      console.error('Gem scan error:', err);
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, fetchData, t]);

  return (
    <CollectionPicker<Gem>
      scope="gems"
      items={candidates}
      onPick={handleSelect}
      searchPlaceholder={t('gems.searchGems')}
      renderIcon={(gem) =>
        gem.icon_url ? (
          <img src={gem.icon_url} alt="" className="h-4 w-4 shrink-0 rounded-sm object-cover" />
        ) : (
          <UIcon icon="tabler:diamond" className="h-4 w-4 text-muted-foreground shrink-0" />
        )
      }
      renderHint={(gem) =>
        folderNameById && gem.default_folder_id && folderNameById.has(gem.default_folder_id) ? (
          <span className="shrink-0 max-w-[45%] truncate text-xs font-normal text-muted-foreground">
            {folderNameById.get(gem.default_folder_id)}
          </span>
        ) : null
      }
      renderEmpty={() => (
        <div className="flex flex-col items-center justify-center text-center text-muted-foreground text-sm py-6 gap-3">
          <span>{t('gems.noGems')}</span>
          {gems.length === 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCreateGem}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('gems.createGem')}
              </Button>
              <Button variant="outline" size="sm" disabled={isScanning} onClick={handleScanGems}>
                {isScanning ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <ScanSearch className="h-3.5 w-3.5 mr-1" />
                )}
                {t('gems.scanGems')}
              </Button>
            </div>
          )}
        </div>
      )}
    />
  );
};
