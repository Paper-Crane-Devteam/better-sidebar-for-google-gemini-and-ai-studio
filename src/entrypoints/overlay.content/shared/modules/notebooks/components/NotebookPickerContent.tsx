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
import type { Notebook } from '@/shared/types/db';
import { useShallow } from 'zustand/react/shallow';
import { CollectionPicker } from '../../collections/CollectionPicker';

interface NotebookPickerContentProps {
  lastSelectedNotebookId?: string | null;
  /**
   * Close the surrounding modal when a notebook is picked. Default true.
   * Set to false when the picker is opened *from inside* a modal that
   * should stay open after the selection (e.g. folder settings).
   */
  closeModalOnSelect?: boolean;
  /**
   * Remember the picked notebook as "last selected". Default true.
   * Set to false when the pick is not about starting a chat (e.g. binding
   * a notebook to a folder), so the New Chat shortcut isn't hijacked.
   */
  recordLastSelected?: boolean;
  /** Notebook IDs to hide from the list */
  excludeIds?: string[];
  /** Show each notebook's current default folder as a hint on the right */
  showDefaultFolderHint?: boolean;
}

export const NotebookPickerContent = ({
  closeModalOnSelect = true,
  recordLastSelected = true,
  excludeIds,
  showDefaultFolderHint,
}: NotebookPickerContentProps) => {
  const { t } = useI18n();
  const { notebooks, folders, fetchData } = useAppStore(
    useShallow((s) => ({
      notebooks: s.notebooks,
      folders: s.folders,
      fetchData: s.fetchData,
    })),
  );
  const close = useModalStore((s) => s.close);
  const closePopover = usePopoverPickerStore((s) => s.close);
  const [isScanning, setIsScanning] = useState(false);

  const candidates = useMemo(
    () => (excludeIds?.length ? notebooks.filter((n) => !excludeIds.includes(n.id)) : notebooks),
    [notebooks, excludeIds],
  );

  // Library folder names, for the default-folder hint
  const folderNameById = useMemo(() => {
    if (!showDefaultFolderHint) return null;
    return new Map(folders.map((f) => [f.id, f.name]));
  }, [folders, showDefaultFolderHint]);

  const handleSelect = useCallback(
    (notebook: Notebook) => {
      if (recordLastSelected) useSettingsStore.getState().setLastSelectedNotebookId(notebook.id);
      if (closeModalOnSelect) close();
      usePopoverPickerStore.getState().resolve(notebook);
    },
    [close, closeModalOnSelect, recordLastSelected],
  );

  const handleCreateNotebook = useCallback(() => {
    close();
    closePopover();
    navigate('https://gemini.google.com/notebooks/create');
  }, [close, closePopover]);

  const handleScanNotebooks = useCallback(async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const response = await browser.runtime.sendMessage({
        type: 'START_NOTEBOOK_SCAN',
      });
      if (response?.success) {
        await fetchData(true);
      } else {
        toast.error(response?.error || t('notebooks.scanNotebooks'));
      }
    } catch (err) {
      console.error('Notebook scan error:', err);
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, fetchData, t]);

  return (
    <CollectionPicker<Notebook>
      scope="notebooks"
      items={candidates}
      onPick={handleSelect}
      searchPlaceholder={t('notebooks.searchNotebooks')}
      renderIcon={() => (
        <UIcon icon="tabler:notebook" className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      renderHint={(notebook) =>
        folderNameById &&
        notebook.default_folder_id &&
        folderNameById.has(notebook.default_folder_id) ? (
          <span className="shrink-0 max-w-[45%] truncate text-xs font-normal text-muted-foreground">
            {folderNameById.get(notebook.default_folder_id)}
          </span>
        ) : null
      }
      renderEmpty={() => (
        <div className="flex flex-col items-center justify-center text-center text-muted-foreground text-sm py-6 gap-3">
          <span>{t('notebooks.noNotebooks')}</span>
          {notebooks.length === 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleCreateNotebook}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('notebooks.newNotebook')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isScanning}
                onClick={handleScanNotebooks}
              >
                {isScanning ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <ScanSearch className="h-3.5 w-3.5 mr-1" />
                )}
                {t('notebooks.scanNotebooks')}
              </Button>
            </div>
          )}
        </div>
      )}
    />
  );
};
