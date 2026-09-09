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
  ScrollText,
  Bot,
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
import { AgentTab } from '../shared/modules/agent-tab';
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
import { useBadge } from '@/shared/lib/badge-store';
import { FeatureBadge } from '@/shared/components/ui/badge-dot';
import { useHotkeyListener } from '@/shared/hooks/useHotkeyListener';
import {
  AccountButton,
  AISTUDIO_ACCOUNT,
} from '../shared/components/AccountButton';


export const OverlayPanel = ({ className }: { className?: string }) => {
  const moduleConfig = useModuleConfig();
  useAppInit();
  useHotkeyListener();
  const { t } = useI18n();
  const { path } = useUrl();

  const [, setContainer] = useState<HTMLDivElement | null>(null);
  const shortcuts = useSettingsStore((state) => state.shortcuts);
  const compactMode = useSettingsStore((state) => state.compactMode);
  const agentBadge = useBadge('tab.agent');
  const {
    fetchData,
    ui,
    setOverlayOpen: setIsUIVisible,
    setActiveTab,
    setIsScanning,
    setShowSqlInterface,
    setExplorerViewMode,
    setExplorerSortOrder,
    setTempHiddenToken,
    setSettingsOpen: setIsSettingsOpen,
    setOverlayOpen
  } = useAppStore();

  const {
    isOpen: isUIVisible,
    activeTab,
    isScanning,
    showSqlInterface,
    tempHiddenToken,
    isSettingsOpen,
  } = ui.overlay;

  useEffect(() => {
    if (compactMode && activeTab !== 'files') setActiveTab('files');
  }, [compactMode, activeTab, setActiveTab]);

  // Handle auto-switching UI based on URL
  useEffect(() => {
    // If returning to main chat area (new chat or root) and we have a hidden token,
    // restore the custom sidebar and clear the token.
    if (
      (path === '/' || path.includes('/prompts/new_chat')) &&
      tempHiddenToken
    ) {
      setIsUIVisible(true);
      setTempHiddenToken(null);
    }
  }, [path, isUIVisible, setIsUIVisible, tempHiddenToken, setTempHiddenToken]);

  // 1. Handle UI Toggle Side Effects
  useEffect(() => {
    const navbarHider = document.getElementById(
      'better-sidebar-for-google-ai-studio-navbar-hider',
    ) as HTMLStyleElement;
    const navbars = Array.from(
      document.querySelectorAll('ms-navbar, ms-navbar-v2'),
    ) as HTMLElement[];
    const wrapper = document.getElementById(
      'better-sidebar-for-google-ai-studio-sidebar-wrapper',
    );

    if (isUIVisible) {
      // Show Enhanced UI, Hide Original
      if (navbarHider) navbarHider.disabled = false;
      navbars.forEach((navbar) => {
        navbar.style.display = 'none';
        navbar.style.position = 'absolute';
        navbar.style.left = '-9999px';
      });
      if (wrapper) wrapper.style.display = 'block';
    } else {
      // Hide Enhanced UI, Show Original
      if (navbarHider) navbarHider.disabled = true;
      navbars.forEach((navbar) => {
        navbar.style.display = ''; // Reset to default
        navbar.style.position = '';
        navbar.style.left = '';
      });
      if (wrapper) wrapper.style.display = 'none';
    }
  }, [isUIVisible]);

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
        // Re-detect account to ensure background DB matches this tab's profile
        try {
          const username = await detectAccount(Platform.AI_STUDIO);
          if (username) {
            await browser.runtime.sendMessage({
              type: 'DETECT_ACCOUNT',
              payload: { platform: Platform.AI_STUDIO, username },
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
      | 'snippets'
      | 'agent',
  ) => {
    if (tab === 'settings') {
      setIsSettingsOpen(true);
      return;
    }
    if (tab === 'agent') agentBadge.dismiss();
    setActiveTab(tab);
  };

  if (!isUIVisible) {
    return <OverlayToggle onToggle={() => setIsUIVisible(true)} />;
  }



  const handleNavigation = (url: string) => {
    const token = Math.random().toString(36).substring(7);
    setTempHiddenToken(token);
    navigate(url);
    // As requested: switch to original UI when navigating to these pages
    setIsUIVisible(false);
  };

  const handleExternalLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div
      ref={setContainer}
      className={`flex bg-background text-foreground ${className || 'h-full'} relative`}
    >
      {/* Sidebar Tabs */}
      <div
        className={`sidebar-nav flex flex-col items-center bg-muted/20 shrink-0 ${
          compactMode ? 'hidden' : ''
        }`}
      >
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
        <SimpleTooltip content="Agent">
          <Button
            variant={activeTab === 'agent' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => handleTabChange('agent')}
            className="sidebar-btn transition-all relative"
          >
            <Bot className="sidebar-icon" />
            <FeatureBadge badgeKey="tab.agent" />
          </Button>
        </SimpleTooltip>
        {shortcuts?.favorites && (
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
        )}
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

        {(shortcuts?.build ||
          shortcuts?.dashboard ||
          shortcuts?.documentation) && <div className="h-2" />}

        {shortcuts?.build && (
          <SimpleTooltip content={t('shortcuts.build')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleNavigation('/apps')}
              className="sidebar-btn transition-all"
            >
              <Hammer className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
        )}

        {shortcuts?.dashboard && (
          <SimpleTooltip content={t('shortcuts.dashboard')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleNavigation('/api-keys')}
              className="sidebar-btn transition-all"
            >
              <LayoutDashboard className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
        )}

        {shortcuts?.documentation && (
          <SimpleTooltip content={t('shortcuts.documentation')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                handleExternalLink('https://ai.google.dev/gemini-api/docs')
              }
              className="sidebar-btn transition-all"
            >
              <BookOpen className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
        )}

        <div className="flex-1" />

        {shortcuts?.originalUI && (
          <SimpleTooltip content={t('shortcuts.originalUI')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsUIVisible(false)}
              className="sidebar-btn transition-all"
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
          >
            <Settings className="sidebar-icon" />
            <FeatureBadge badgeKey="settings." group />
          </Button>
        </SimpleTooltip>
        <AccountButton config={AISTUDIO_ACCOUNT} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 px-1 pt-1">
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
          <FavoritesTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'snippets' ? (
          <SnippetsTab menuActions={moduleConfig.general.menuActions} />
        ) : activeTab === 'agent' ? (
          <AgentTab />
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
