import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '../shared/components/ui/button';
import { Separator } from '../shared/components/ui/separator';
import {
  Files,
  Star,
  Tag,
  MessageSquare,
  Settings,
  Hammer,
  LayoutDashboard,
  BookOpen,
  LogOut,
  Search,
  Sparkles,
  Menu,
  Library,
  Gem,
  SquarePen,
} from 'lucide-react';
import { SqlExecutor } from '../shared/components/menu/SqlExecutor';
import { ExplorerTab } from '../shared/modules/explorer/ExplorerTab';
import { PromptsTab } from '../shared/modules/prompts/PromptsTab';
import { SearchTab } from '../shared/modules/search/SearchTab';
import { FavoritesTab } from '../shared/modules/favorites/FavoritesTab';
import { TagsTab } from '../shared/modules/tags/TagsTab';
import { FeedbackTab } from '../shared/modules/feedback/FeedbackTab';
import { SettingsModal } from '../shared/modules/settings/SettingsModal';
import { WhatsNewDialog } from '../shared/modules/whats-new/WhatsNewDialog';
import '@/index.scss';
import { GlobalModal } from '@/shared/components/GlobalModal';
import { ProfilePickerDialog } from '../shared/components/ProfilePickerDialog';
import { GlobalToast } from '@/shared/components/GlobalToast';
import { useAppInit } from '../shared/hooks/useAppInit';
import { OverlayToggle } from '../shared/components/OverlayToggle';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { useUrl } from '@/shared/hooks/useUrl';
import { useModuleConfig } from './useModuleConfig';
import { toast } from '@/shared/lib/toast';
import { detectAccount } from '@/entrypoints/content/shared/detect-account';
import { Platform } from '@/shared/types/platform';
import { RatingPromptDialog } from '../shared/modules/feedback/RatingPromptDialog';

export const OverlayPanel = ({ className }: { className?: string }) => {
  const moduleConfig = useModuleConfig();
  useAppInit();
  const { t } = useI18n();
  const { path } = useUrl();

  const [, setContainer] = useState<HTMLDivElement | null>(null);
  const layoutDensity = useSettingsStore((state) => state.layoutDensity);
  const shortcuts = useSettingsStore((state) => state.shortcuts);
  const {
    fetchData,
    ui,
    setOverlayOpen: setIsFeatureEnabled,
    setSidebarExpanded,
    setActiveTab,
    setIsScanning,
    setShowSqlInterface,
    setExplorerViewMode,
    setExplorerSortOrder,
    setSettingsOpen: setIsSettingsOpen,
  } = useAppStore();

  const {
    isOpen: isFeatureEnabled,
    isSidebarExpanded,
    activeTab,
    showSqlInterface,
    isSettingsOpen,
  } = ui.overlay;

  const [localIsVisible, setLocalIsVisible] = useState(isSidebarExpanded);

  const updateLocalVisibility = (visible: boolean) => {
    if (visible) {
      // Opening: add delay
      setTimeout(() => {
        setLocalIsVisible(true);
      }, 100);
    } else {
      // Closing: hide immediately
      setLocalIsVisible(false);
    }
  };

  // Sync local state with global state
  useEffect(() => {
    updateLocalVisibility(isSidebarExpanded);
  }, [isSidebarExpanded]);

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

        console.log('Received DATA_UPDATED signal, refreshing...');
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
        console.log('Tab became visible, syncing profile and refreshing...');
        try {
          const username = await detectAccount(Platform.GEMINI);
          if (username) {
            await browser.runtime.sendMessage({
              type: 'DETECT_ACCOUNT',
              payload: { platform: Platform.GEMINI, username },
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
      | 'prompts',
  ) => {
    if (tab === 'settings') {
      setIsSettingsOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  const handleMainMenuClick = () => {
    const nextState = !isSidebarExpanded;

    updateLocalVisibility(nextState);

    const menuBtn = document.querySelector(
      '.mdc-icon-button[aria-label="Main menu"]',
    ) as HTMLElement;
    if (menuBtn) {
      menuBtn.click();
    } else {
      console.warn('Main menu button not found');
      // If button not found, revert local state to avoid getting stuck
      // We need to handle the timeout case too if we want to be perfectly safe,
      // but typically if button is missing we have bigger problems.
      // For now just syncing back to source of truth is enough.
      setLocalIsVisible(isSidebarExpanded);
    }
  };

  if (!isFeatureEnabled) {
    return <OverlayToggle onToggle={() => setIsFeatureEnabled(true)} />;
  }

  if (showSqlInterface) {
    return <SqlExecutor onClose={() => setShowSqlInterface(false)} />;
  }

  return (
    <div
      ref={setContainer}
      className={`flex bg-background text-foreground ${className || 'h-full'} relative`}
      data-density={layoutDensity}
    >
      {/* Sidebar Tabs */}
      <div className="sidebar-nav border-r flex flex-col items-center bg-muted/20 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          title="Toggle Menu"
          onClick={handleMainMenuClick}
          className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
        >
          <Menu className="sidebar-icon" />
        </Button>
        <Separator className="w-8 my-1" />

        {!isSidebarExpanded ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              title={t('tooltip.newChat')}
              onClick={() => moduleConfig.explorer.onNewChat()}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <SquarePen className="sidebar-icon" />
            </Button>
            <div className="flex-1" />

            <Button
              variant={isSettingsOpen ? 'secondary' : 'ghost'}
              size="icon"
              title={t('tabs.settings')}
              onClick={() => handleTabChange('settings')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <Settings className="sidebar-icon" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={activeTab === 'files' ? 'secondary' : 'ghost'}
              size="icon"
              title={t('tabs.files')}
              onClick={() => handleTabChange('files')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <Files className="sidebar-icon" />
            </Button>
            <Button
              variant={activeTab === 'search' ? 'secondary' : 'ghost'}
              size="icon"
              title={t('tabs.search')}
              onClick={() => handleTabChange('search')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <Search className="sidebar-icon" />
            </Button>
            <Button
              variant={activeTab === 'prompts' ? 'secondary' : 'ghost'}
              size="icon"
              title={t('tabs.prompts')}
              onClick={() => handleTabChange('prompts')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <Sparkles className="sidebar-icon" />
            </Button>
            {shortcuts?.favorites && (
              <Button
                variant={activeTab === 'favorites' ? 'secondary' : 'ghost'}
                size="icon"
                title={t('tabs.favorites')}
                onClick={() => handleTabChange('favorites')}
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
              >
                <Star className="sidebar-icon" />
              </Button>
            )}
            <Button
              variant={activeTab === 'tags' ? 'secondary' : 'ghost'}
              size="icon"
              title={t('tabs.tags')}
              onClick={() => handleTabChange('tags')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <Tag className="sidebar-icon" />
            </Button>

            {((shortcuts?.myStuff ?? true) || (shortcuts?.gems ?? true)) && (
              <Separator className="w-8 my-1" />
            )}

            {(shortcuts?.myStuff ?? true) && (
              <Button
                variant="ghost"
                size="icon"
                title={t('shortcuts.myStuff')}
                onClick={() => navigate('https://gemini.google.com/mystuff')}
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
              >
                <Library className="sidebar-icon" />
              </Button>
            )}

            {(shortcuts?.gems ?? true) && (
              <Button
                variant="ghost"
                size="icon"
                title={t('shortcuts.gems')}
                onClick={() => navigate('https://gemini.google.com/gems/view')}
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
              >
                <Gem className="sidebar-icon" />
              </Button>
            )}

            <div className="flex-1" />

            {shortcuts?.originalUI && (
              <Button
                variant="ghost"
                size="icon"
                title={t('shortcuts.originalUI')}
                onClick={() => setIsFeatureEnabled(false)}
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
              >
                <LogOut className="sidebar-icon" />
              </Button>
            )}

            <Button
              variant={activeTab === 'feedback' ? 'secondary' : 'ghost'}
              size="icon"
              title={t('tabs.feedback')}
              onClick={() => handleTabChange('feedback')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <MessageSquare className="sidebar-icon" />
            </Button>
            <Button
              variant={isSettingsOpen ? 'secondary' : 'ghost'}
              size="icon"
              title={t('tabs.settings')}
              onClick={() => handleTabChange('settings')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <Settings className="sidebar-icon" />
            </Button>
          </>
        )}
      </div>

      {/* Main Content Area */}
      <div
        className={`flex flex-col min-w-0 transition-opacity duration-300 ease-in-out ${
          localIsVisible
            ? 'flex-1 opacity-100'
            : 'w-0 opacity-0 overflow-hidden'
        }`}
      >
        {activeTab === 'files' ? (
          <ExplorerTab
            onNewChat={moduleConfig.explorer.onNewChat}
            filterTypes={moduleConfig.explorer.filterTypes}
            extraHeaderButtons={moduleConfig.explorer.extraHeaderButtons}
            visibleFilters={moduleConfig.explorer.visibleFilters}
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
          <FavoritesTab
            menuActions={moduleConfig.general.menuActions}
            visibleFilters={moduleConfig.favorites.visibleFilters}
          />
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
      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <WhatsNewDialog />
      <GlobalModal />
      <ProfilePickerDialog />
      <RatingPromptDialog />
      <GlobalToast />
    </div>
  );
};
