import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import {
  Files,
  Star,
  Tag,
  MessageSquare,
  Settings,
  Image,
  LayoutGrid,
  Code2,
  LogOut,
  Search,
  ScrollText,
} from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { SqlExecutor } from '../shared/components/menu/SqlExecutor';
import { ExplorerTab } from '../shared/modules/explorer/ExplorerTab';
import { PromptsTab } from '../shared/modules/prompts/PromptsTab';
import { SearchTab } from '../shared/modules/search/SearchTab';
import { FavoritesTab } from '../shared/modules/favorites/FavoritesTab';
import { TagsTab } from '../shared/modules/tags/TagsTab';
import { FeedbackTab } from '../shared/modules/feedback/FeedbackTab';
import { SnippetsTab } from '../shared/modules/snippets/SnippetsTab';
import '@/index.scss';
import { useAppInit } from '../shared/hooks/useAppInit';
import { OverlayToggle } from '../shared/components/OverlayToggle';
import { toast } from '@/shared/lib/toast';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { useUrl } from '@/shared/hooks/useUrl';
import { useModuleConfig } from './useModuleConfig';
import { detectAccount } from '@/entrypoints/content/shared/detect-account';
import { Platform } from '@/shared/types/platform';
import { trace } from '@/shared/lib/trace';
import {
  IconBarContextMenu,
  IconBarGroup,
  useIconBar,
} from '../shared/modules/icon-bar';

export const OverlayPanel = ({ className }: { className?: string }) => {
  const moduleConfig = useModuleConfig();
  useAppInit();
  const { t } = useI18n();
  const { path } = useUrl();

  const [, setContainer] = useState<HTMLDivElement | null>(null);
  const { visible: visibleIcons } = useIconBar();
  const compactMode = useSettingsStore((state) => state.compactMode);
  const {
    fetchData,
    ui,
    setActiveTab,
    setIsScanning,
    setExplorerViewMode,
    setExplorerSortOrder,
    setSettingsOpen: setIsSettingsOpen,
    setOverlayOpen,
    setShowSqlInterface,
  } = useAppStore();

  const {
    isOpen: isUIVisible,
    activeTab,
    isSettingsOpen,
    showSqlInterface,
  } = ui.overlay;

  useEffect(() => {
    if (compactMode && activeTab !== 'files') setActiveTab('files');
  }, [compactMode, activeTab, setActiveTab]);

  useEffect(() => {
    // Initial fetch
    fetchData();

    // Initialize from settings store
    const settings = useSettingsStore.getState();
    setExplorerViewMode(settings.explorer.viewMode);
    setExplorerSortOrder(settings.explorer.sortOrder);

    // Listen for updates from background script
    const listener = (message: any) => {
      if (message.type === 'DATA_UPDATED') {
        // Only process in the active tab — background DB may belong to another profile
        if (document.visibilityState !== 'visible') return;

        fetchData(true);

        // Handle specific update types with payload
        if (message.updateType === 'SCAN_COMPLETE' && message.payload) {
          // Only set isScanning to false when scan actually completes
          setIsScanning(false);

          const count = message.payload.count || 0;
          console.log(`Scan completed, imported ${count} items`);
          if (count > 0) {
            toast.success(t('toast.imported', { count }));
          } else {
            toast.info(t('toast.scanComplete'));
          }
        }
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  // Handle tab activation/visibility change to sync data
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        trace('Tab became visible, syncing profile and refreshing...');
        try {
          const username = await detectAccount(Platform.CHATGPT);
          if (username) {
            await browser.runtime.sendMessage({
              type: 'DETECT_ACCOUNT',
              payload: { platform: Platform.CHATGPT, username },
            });
          }
        } catch (e) {
          console.warn('Profile re-sync failed on visibility change:', e);
        }
        fetchData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const handleTabChange = (
    tab:
      | 'files'
      | 'favorites'
      | 'tags'
      | 'feedback'
      | 'settings'
      | 'search'
      | 'prompts'
      | 'snippets',
  ) => {
    if (tab === 'settings') {
      setIsSettingsOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  const handleNavigation = (url: string) => {
    navigate(url);
  };

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank');
  };

  // Conditional rendering based on UI state
  if (!isUIVisible) {
    return <OverlayToggle onToggle={() => setOverlayOpen(true)} />;
  }

  /**
   * Every button the rail can hold, keyed by the ids in the icon-bar registry.
   * Which of them show, and in what order, is the registry's and the user's
   * business; this map only says what each one is and does.
   */
  const iconNodes: Record<string, React.ReactNode> = {
    files: (
      <SimpleTooltip content={t('tabs.files')}>
        <Button
          variant={activeTab === 'files' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('files')}
          className="sidebar-btn transition-all"
        >
          <Files className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    search: (
      <SimpleTooltip content={t('tabs.search')}>
        <Button
          variant={activeTab === 'search' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('search')}
          className="sidebar-btn transition-all"
        >
          <Search className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    prompts: (
      <SimpleTooltip content={t('tabs.prompts')}>
        <Button
          variant={activeTab === 'prompts' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('prompts')}
          className="sidebar-btn transition-all"
        >
          <UIcon icon="tabler:blockquote" className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    favorites: (
      <SimpleTooltip content={t('tabs.favorites')}>
        <Button
          variant={activeTab === 'favorites' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('favorites')}
          className="sidebar-btn transition-all"
        >
          <Star className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    snippets: (
      <SimpleTooltip content={t('tabs.snippets')}>
        <Button
          variant={activeTab === 'snippets' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('snippets')}
          className="sidebar-btn transition-all"
        >
          <ScrollText className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    tags: (
      <SimpleTooltip content={t('tabs.tags')}>
        <Button
          variant={activeTab === 'tags' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('tags')}
          className="sidebar-btn transition-all"
        >
          <Tag className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    images: (
      <SimpleTooltip content={t('shortcuts.images')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleNavigation('/images')}
          className="sidebar-btn transition-all"
        >
          <Image className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    apps: (
      <SimpleTooltip content={t('shortcuts.apps')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleNavigation('/apps')}
          className="sidebar-btn transition-all"
        >
          <LayoutGrid className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    codex: (
      <SimpleTooltip content={t('shortcuts.codex')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleExternalLink('https://chatgpt.com/codex')}
          className="sidebar-btn transition-all"
        >
          <Code2 className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    originalUI: (
      <SimpleTooltip content={t('shortcuts.originalUI')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOverlayOpen(false)}
          className="sidebar-btn transition-all"
        >
          <LogOut className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    feedback: (
      <SimpleTooltip content={t('tabs.feedback')}>
        <Button
          variant={activeTab === 'feedback' ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('feedback')}
          className="sidebar-btn transition-all"
        >
          <MessageSquare className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
    settings: (
      <SimpleTooltip content={t('tabs.settings')}>
        <Button
          variant={isSettingsOpen ? 'secondary' : 'ghost'}
          size="icon"
          onClick={() => handleTabChange('settings')}
          className="sidebar-btn transition-all"
        >
          <Settings className="sidebar-icon" />
        </Button>
      </SimpleTooltip>
    ),
  };

  return (
    <div
      ref={setContainer}
      className={`flex bg-background text-foreground ${className || 'h-full'} relative`}
    >
      {/* Sidebar Tabs */}
      <IconBarContextMenu>
        <div
          className={`sidebar-nav flex flex-col items-center bg-muted/20 shrink-0 ${
            compactMode ? 'hidden' : ''
          }`}
        >
          <IconBarGroup ids={visibleIcons.main} nodes={iconNodes} />
          {!!visibleIcons.links?.length && <div className="h-2" />}

          <IconBarGroup ids={visibleIcons.links} nodes={iconNodes} />

          <div className="flex-1" />

          <IconBarGroup ids={visibleIcons.bottom} nodes={iconNodes} />
        </div>
      </IconBarContextMenu>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeTab === 'files' ? (
          <ExplorerTab
            onNewChat={moduleConfig.explorer.onNewChat}
            filterTypes={moduleConfig.explorer.filterTypes}
            menuActions={moduleConfig.general.menuActions}
          />
        ) : activeTab === 'search' ? (
          <SearchTab
            extraHeaderButtons={moduleConfig.search.extraHeaderButtons}
            menuActions={moduleConfig.general.menuActions}
            onNavigate={moduleConfig.search.onNavigate}
          />
        ) : activeTab === 'prompts' ? (
          <PromptsTab
            menuActions={{
              ...moduleConfig.general.menuActions,
              ...moduleConfig.prompts.menuActions,
            }}
          />
        ) : activeTab === 'favorites' ? (
          <FavoritesTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'snippets' ? (
          <SnippetsTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'tags' ? (
          <TagsTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'feedback' ? (
          <FeedbackTab />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            {t('overlay.settingsPageComingSoon')}
          </div>
        )}
      </div>

      {showSqlInterface && <SqlExecutor onClose={() => setShowSqlInterface(false)} />}
    </div>
  );
};
