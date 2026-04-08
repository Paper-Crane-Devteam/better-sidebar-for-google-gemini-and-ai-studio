import React, { useState, useEffect } from 'react';
import { Separator } from '../../../components/ui/separator';
import { Button } from '../../../components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { FolderTree, List, ArrowDownAZ, Calendar } from 'lucide-react';
import { Switch } from '@/shared/components/ui/switch';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { useI18n } from '@/shared/hooks/useI18n';

export const ExplorerSettings = () => {
  const { t } = useI18n();
  const {
    explorer,
    setExplorerViewMode,
    setExplorerSortOrder,
    setExplorerIgnoredFolders,
    setExplorerEnableRightClickRename,
  } = useSettingsStore();

  const { viewMode, sortOrder, ignoredFolders, enableRightClickRename } =
    explorer;

  // Local state for the input to avoid aggressive formatting while typing
  const [localIgnored, setLocalIgnored] = useState(ignoredFolders.join(', '));

  // Update local state when store changes (e.g. hydration)
  useEffect(() => {
    setLocalIgnored(ignoredFolders.join(', '));
  }, [ignoredFolders]);

  const handleIgnoredBlur = () => {
    const folders = localIgnored
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setExplorerIgnoredFolders(folders);
    setLocalIgnored(folders.join(', '));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-medium">
          {t('explorerSettings.viewOptions')}
        </h3>
        <Separator />
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">
                {t('explorerSettings.defaultViewMode')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('explorerSettings.defaultViewModeDescription')}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
              <SimpleTooltip content={t('explorerSettings.treeView')}>
                <Button
                  variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 gap-2"
                  onClick={() => setExplorerViewMode('tree')}
                >
                  <FolderTree className="h-3.5 w-3.5" />
                  <span className="text-xs">{t('explorerSettings.tree')}</span>
                </Button>
              </SimpleTooltip>
              <SimpleTooltip content={t('explorerSettings.timelineView')}>
                <Button
                  variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 gap-2"
                  onClick={() => setExplorerViewMode('timeline')}
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="text-xs">
                    {t('explorerSettings.timeline')}
                  </span>
                </Button>
              </SimpleTooltip>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">
                {t('explorerSettings.defaultSortOrder')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('explorerSettings.defaultSortOrderDescription')}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border">
              <Button
                variant={sortOrder === 'date' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 gap-2"
                onClick={() => setExplorerSortOrder('date')}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-xs">{t('explorerSettings.date')}</span>
              </Button>
              <Button
                variant={sortOrder === 'alpha' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 gap-2"
                onClick={() => setExplorerSortOrder('alpha')}
              >
                <ArrowDownAZ className="h-3.5 w-3.5" />
                <span className="text-xs">{t('explorerSettings.name')}</span>
              </Button>
            </div>
          </div>

          {/* <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium">{t('explorerSettings.enableRightClickRename')}</label>
                            <p className="text-xs text-muted-foreground">{t('explorerSettings.enableRightClickRenameDescription')}</p>
                        </div>
                        <Switch 
                            checked={enableRightClickRename} 
                            onCheckedChange={setExplorerEnableRightClickRename} 
                        />
                    </div> */}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-medium">
          {t('explorerSettings.filteringExclusion')}
        </h3>
        <Separator />
        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">
                {t('explorerSettings.ignoredFolders')}
              </label>
              <p className="text-xs text-muted-foreground">
                {t('explorerSettings.ignoredFoldersDescription')}
              </p>
            </div>
            <input
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={t('explorerSettings.ignoredFoldersPlaceholder')}
              value={localIgnored}
              onChange={(e) => setLocalIgnored(e.target.value)}
              onBlur={handleIgnoredBlur}
              maxLength={200}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
