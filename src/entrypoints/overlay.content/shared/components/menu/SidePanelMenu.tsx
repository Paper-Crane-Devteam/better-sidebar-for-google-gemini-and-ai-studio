import React from 'react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '../ui/button';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { navigate } from '@/shared/lib/navigation';
import { MoreVertical, Settings, Database, History, Layout, RefreshCw, FolderPlus, ListCollapse, ArrowDownAZ, Clock, Calendar, Folder, Upload, Gem, Eye } from 'lucide-react';

interface SidePanelMenuProps {
  onNewFolder?: () => void;
  onCollapseAll?: () => void;
  onSort?: () => void;
  sortOrder?: 'alpha' | 'date';
  onToggleViewMode?: () => void;
  viewMode?: 'tree' | 'timeline';
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    handleScanLibrary?: () => void;
    onImportAiStudioSystem?: () => void;
    onViewGems?: () => void;
    onScanGems?: () => void;
  };
}

export const SidePanelMenu = ({ 
  onNewFolder,
  onCollapseAll,
  onSort,
  sortOrder,
  onToggleViewMode,
  viewMode,
  menuActions,
}: SidePanelMenuProps) => {
  const { t } = useI18n();
  const { 
    ui, 
    setIsScanning, 
    setShowSqlInterface, 
    setSettingsOpen, 
    setOverlayOpen 
  } = useAppStore();
  const { isScanning } = ui.overlay;

  const handleScanLibrary = menuActions?.handleScanLibrary;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
            <MoreVertical className="h-4 w-4" />
          </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[9999]">
        {/* Section 1: Folder/Tree Actions */}
        {onNewFolder && (
            <DropdownMenuItem onClick={onNewFolder}>
                <FolderPlus className="mr-2 h-4 w-4" />
                <span>{t('menu.newFolder')}</span>
            </DropdownMenuItem>
        )}
        {onCollapseAll && (
            <DropdownMenuItem onClick={onCollapseAll}>
                <ListCollapse className="mr-2 h-4 w-4" />
                <span>{t('menu.collapseAll')}</span>
            </DropdownMenuItem>
        )}
        {onSort && (
            <DropdownMenuItem onClick={onSort}>
                {sortOrder === 'alpha' ? <ArrowDownAZ className="mr-2 h-4 w-4" /> : <Clock className="mr-2 h-4 w-4" />}
                <span>{sortOrder === 'alpha' ? t('menu.sortByDate') : t('menu.sortAlphabetically')}</span>
            </DropdownMenuItem>
        )}
        
        {(onNewFolder || onCollapseAll || onSort) && <DropdownMenuSeparator />}
        
        {/* Section 2: View Modes & Import AI Studio System */}
        {onToggleViewMode && (
            <DropdownMenuItem onClick={onToggleViewMode}>
                {viewMode === 'tree' ? <Calendar className="mr-2 h-4 w-4" /> : <Folder className="mr-2 h-4 w-4" />}
                <span>{viewMode === 'tree' ? t('menu.switchToTimelineView') : t('menu.switchToFolderView')}</span>
            </DropdownMenuItem>
        )}
        {menuActions?.onImportAiStudioSystem && (
            <DropdownMenuItem onClick={() => void menuActions.onImportAiStudioSystem?.()}>
                <Upload className="mr-2 h-4 w-4" />
                <span>{t('prompts.importAiStudioSystem')}</span>
            </DropdownMenuItem>
        )}
        {handleScanLibrary && (
            <DropdownMenuItem onClick={handleScanLibrary} disabled={isScanning}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? t('menu.scanning') : t('menu.scanChatList')}</span>
            </DropdownMenuItem>
        )}
        
        {(onToggleViewMode || menuActions?.onImportAiStudioSystem || handleScanLibrary || menuActions?.onViewGems || menuActions?.onScanGems) && <DropdownMenuSeparator />}
        
        {/* Gem Actions */}
        {menuActions?.onViewGems && (
            <DropdownMenuItem onClick={menuActions.onViewGems}>
                <Eye className="mr-2 h-4 w-4" />
                <span>{t('gems.viewGems')}</span>
            </DropdownMenuItem>
        )}
        {menuActions?.onScanGems && (
            <DropdownMenuItem onClick={menuActions.onScanGems}>
                <RefreshCw className="mr-2 h-4 w-4" />
                <span>{t('gems.scanGems')}</span>
            </DropdownMenuItem>
        )}
        
        {(menuActions?.onViewGems || menuActions?.onScanGems) && <DropdownMenuSeparator />}
        {menuActions?.onViewHistory && (
          <DropdownMenuItem onClick={menuActions.onViewHistory}>
            <History className="mr-2 h-4 w-4" />
            <span>{t('menu.viewHistory')}</span>
          </DropdownMenuItem>
        )}

        {menuActions?.onSwitchToOriginalUI && (
          <DropdownMenuItem onClick={menuActions.onSwitchToOriginalUI}>
            <Layout className="mr-2 h-4 w-4" />
            <span>{t('menu.switchToOriginalUI')}</span>
          </DropdownMenuItem>
        )}

        {import.meta.env.DEV && (
          <DropdownMenuItem onClick={() => setShowSqlInterface(true)}>
            <Database className="mr-2 h-4 w-4" />
            <span>{t('menu.sqlQuery')}</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-2 h-4 w-4" />
          <span>{t('menu.settings')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
