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
  Hammer,
  LayoutDashboard,
  BookOpen,
  LogOut,
  Search,
  Menu,
  Library,
  SquarePen,
  ScrollText,
  Bot,
  Sparkles,
} from 'lucide-react';
import { UIcon } from '@/shared/components/ui/icon';
import { SqlExecutor } from '../shared/components/menu/SqlExecutor';
import { ExplorerTab } from '../shared/modules/explorer/ExplorerTab';
import { PromptsTab } from '../shared/modules/prompts/PromptsTab';
import { SearchTab } from '../shared/modules/search/SearchTab';
import { FavoritesTab } from '../shared/modules/favorites/FavoritesTab';
import { TagsTab } from '../shared/modules/tags/TagsTab';
import { FeedbackTab } from '../shared/modules/feedback/FeedbackTab';
import { GemsTab } from '../shared/modules/gems/GemsTab';
import { NotebooksTab } from '../shared/modules/notebooks/NotebooksTab';
import { SnippetsTab } from '../shared/modules/snippets/SnippetsTab';
import { SparkTab, isSparkAvailable } from '../shared/modules/spark/SparkTab';
import { AgentTab } from '../shared/modules/agent-tab';
import '@/index.scss';
import { useAppInit } from '../shared/hooks/useAppInit';
import { OverlayToggle } from '../shared/components/OverlayToggle';
import { useI18n } from '@/shared/hooks/useI18n';
import { navigate } from '@/shared/lib/navigation';
import { useUrl } from '@/shared/hooks/useUrl';
import { useModuleConfig } from './useModuleConfig';
import { toast } from '@/shared/lib/toast';
import { detectAccount } from '@/entrypoints/content/shared/detect-account';
import { Platform } from '@/shared/types/platform';
import { trace } from '@/shared/lib/trace';
import { useBadge } from '@/shared/lib/badge-store';
import { FeatureBadge } from '@/shared/components/ui/badge-dot';

import { useHotkeyListener } from '@/shared/hooks/useHotkeyListener';

import { toggleGeminiSidebar } from '@/shared/lib/dom-selectors';
import {
  AccountButton,
  GEMINI_ACCOUNT,
} from '../shared/components/AccountButton';

export const OverlayPanel = ({ className }: { className?: string }) => {
  const moduleConfig = useModuleConfig();
  useAppInit();
  useHotkeyListener();
  const { t } = useI18n();
  const { path } = useUrl();

  const shortcuts = useSettingsStore((state) => state.shortcuts);
  const compactMode = useSettingsStore((state) => state.compactMode);
  const sparkAvailable = isSparkAvailable();
  const agentBadge = useBadge('tab.agent');

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
      | 'prompts'
      | 'gems'
      | 'notebooks'
      | 'snippets'
      | 'agent'
      | 'spark',
  ) => {
    if (tab === 'settings') {
      setIsSettingsOpen(true);
      return;
    }
    if (tab === 'agent') agentBadge.dismiss();
    setActiveTab(tab);
  };

  const handleMainMenuClick = () => {
    toggleGeminiSidebar();
  };

  if (!isFeatureEnabled) {
    return <OverlayToggle onToggle={() => setIsFeatureEnabled(true)} />;
  }



  return (
    <div
      className={`flex bg-background text-foreground ${className || 'h-full'} relative overflow-hidden`}
    >
      {/* Sidebar Tabs — hidden in expanded view when the user opts for a
          clutter-free tree. Kept in collapsed view since it is the only
          entry point there. */}
      <div
        className={`sidebar-nav flex flex-col items-center shrink-0 ${
          isSidebarExpanded && compactMode ? 'hidden' : ''
        }`}
      >
        <SimpleTooltip content={t('tooltip.toggleMenu')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMainMenuClick}
            className="sidebar-btn transition-all"
          >
            <Menu className="sidebar-icon" />
          </Button>
        </SimpleTooltip>
        <div className="h-2" />

        <div
          className={
            !isSidebarExpanded
              ? 'flex flex-col flex-1 h-full items-center w-full gap-2 pb-2'
              : 'hidden'
          }
        >
          <SimpleTooltip content={t('tooltip.newChat')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => moduleConfig.explorer.onNewChat()}
              className="sidebar-btn transition-all"
            >
              <SquarePen className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
          <div className="flex-1" />
          {shortcuts?.originalUI && (
            <SimpleTooltip content={t('shortcuts.originalUI')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFeatureEnabled(false)}
                className="sidebar-btn transition-all"
              >
                <LogOut className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}
          <SimpleTooltip content={t('tabs.settings')}>
            <Button
              variant={isSettingsOpen ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('settings')}
              className="sidebar-btn transition-all relative"
            >
              <Settings className="sidebar-icon" />
              <FeatureBadge badgeKey="settings." group />
            </Button>
          </SimpleTooltip>
          <AccountButton config={GEMINI_ACCOUNT} />
        </div>

        <div
          className={
            isSidebarExpanded
              ? 'flex flex-col flex-1 h-full items-center w-full gap-2 pb-2'
              : 'hidden'
          }
        >
          <SimpleTooltip content={t('tabs.files')}>
            <Button
              variant={activeTab === 'files' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('files')}
              className="sidebar-btn transition-all"
              data-tour-id="tour-files"
            >
              <Files className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('tabs.search')}>
            <Button
              variant={activeTab === 'search' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('search')}
              className="sidebar-btn transition-all"
              data-tour-id="tour-search"
            >
              <Search className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('tabs.prompts')}>
            <Button
              variant={activeTab === 'prompts' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('prompts')}
              className="sidebar-btn transition-all"
              data-tour-id="tour-prompts"
            >
              <UIcon icon="tabler:blockquote" className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content="Agent">
            <Button
              variant={activeTab === 'agent' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('agent')}
              className="sidebar-btn transition-all relative"
              data-tour-id="tour-agent"
            >
              <Bot className="sidebar-icon" />
              <FeatureBadge badgeKey="tab.agent" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('tabs.tags')}>
            <Button
              variant={activeTab === 'tags' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('tags')}
              className="sidebar-btn transition-all"
              data-tour-id="tour-tags"
            >
              <Tag className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
          {shortcuts?.favorites && (
            <SimpleTooltip content={t('tabs.favorites')}>
              <Button
                variant={activeTab === 'favorites' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleTabChange('favorites')}
                className="sidebar-btn transition-all"
                data-tour-id="tour-favorites"
              >
                <Star className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}

          <SimpleTooltip content={t('tabs.snippets')}>
            <Button
              variant={activeTab === 'snippets' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('snippets')}
              className="sidebar-btn transition-all"
              data-tour-id="tour-snippets"
            >
              <ScrollText className="sidebar-icon" />
            </Button>
          </SimpleTooltip>

          {((shortcuts?.gems ?? true) || (shortcuts?.notebooks ?? true) || (shortcuts?.myStuff ?? true)) && (
            <div className="h-2" />
          )}

          {(shortcuts?.gems ?? true) && (
            <SimpleTooltip content={t('tabs.gems')}>
              <Button
                variant={activeTab === 'gems' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleTabChange('gems')}
                className="sidebar-btn transition-all"
                data-tour-id="tour-gems"
              >
                <UIcon icon="tabler:diamond" className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}

          {(shortcuts?.notebooks ?? true) && (
            <SimpleTooltip content={t('tabs.notebooks')}>
              <Button
                variant={activeTab === 'notebooks' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleTabChange('notebooks')}
                className="sidebar-btn transition-all"
                data-tour-id="tour-notebooks"
              >
                <UIcon icon="tabler:notebook" className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}

          {sparkAvailable && (
            <SimpleTooltip content={t('tabs.spark')}>
              <Button
                variant={activeTab === 'spark' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleTabChange('spark')}
                className="sidebar-btn transition-all"
                data-tour-id="tour-spark"
              >
                <Sparkles className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}

          {(shortcuts?.myStuff ?? true) && (
            <SimpleTooltip content={t('shortcuts.myStuff')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('https://gemini.google.com/mystuff')}
                className="sidebar-btn transition-all"
                data-tour-id="tour-mystuff"
              >
                <Library className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}

          <div className="flex-1" />

          {shortcuts?.originalUI && (
            <SimpleTooltip content={t('shortcuts.originalUI')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFeatureEnabled(false)}
                className="sidebar-btn transition-all"
                data-tour-id="tour-original-ui"
              >
                <LogOut className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}

          <SimpleTooltip content={t('tabs.feedback')}>
            <Button
              variant={activeTab === 'feedback' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('feedback')}
              className="sidebar-btn transition-all"
              data-tour-id="tour-feedback"
            >
              <MessageSquare className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip content={t('tabs.settings')}>
            <Button
              variant={isSettingsOpen ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('settings')}
              className="sidebar-btn transition-all relative"
              data-tour-id="tour-settings"
            >
              <Settings className="sidebar-icon" />
              <FeatureBadge badgeKey="settings." group />
            </Button>
          </SimpleTooltip>
          <AccountButton config={GEMINI_ACCOUNT} />
        </div>
      </div>

      {/* Main Content Area.
          With the icon bar hidden, useGeminiUI already shrank
          --bard-sidenav-open-width by the icon bar's width, so taking the full
          open width here yields the exact same content width as the
          `open - closed` expression below. Net effect: the tree keeps its
          width and only the sidebar's right edge moves. */}
      <div
        className={`flex flex-col px-1 pt-1`}
        style={{
          width:
            isSidebarExpanded && compactMode
              ? 'var(--bard-sidenav-open-width, 360px)'
              : 'calc(var(--bard-sidenav-open-width, 360px) - var(--bard-sidenav-closed-width, 64px))',
          flexShrink: 0,
        }}
      >
        {activeTab === 'files' ? (
          <ExplorerTab
            onNewChat={moduleConfig.explorer.onNewChat}
            newChatButton={moduleConfig.explorer.newChatButton}
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
          <FavoritesTab
            menuActions={moduleConfig.general.menuActions}
            visibleFilters={moduleConfig.favorites.visibleFilters}
          />
        ) : activeTab === 'tags' ? (
          <TagsTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'gems' ? (
          <GemsTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'notebooks' ? (
          <NotebooksTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'snippets' ? (
          <SnippetsTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'spark' ? (
          <SparkTab />
        ) : activeTab === 'agent' ? (
          <AgentTab />
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
