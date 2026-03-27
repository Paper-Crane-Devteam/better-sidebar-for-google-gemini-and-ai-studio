import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { Button } from '../shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
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
import { GemsTab } from '../shared/modules/gems/GemsTab';
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
import { GuidedTour } from '../shared/modules/guided-tour/GuidedTour';
import { TourPromptDialog } from '../shared/modules/guided-tour/TourPromptDialog';
import { useGuidedTour } from '../shared/modules/guided-tour/useGuidedTour';
import { GEMINI_TOUR_STEPS } from '../shared/modules/guided-tour/tour-steps';

export const OverlayPanel = ({ className }: { className?: string }) => {
  const moduleConfig = useModuleConfig();
  useAppInit();
  const guidedTour = useGuidedTour();
  const { t } = useI18n();
  const { path } = useUrl();

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
      | 'prompts'
      | 'gems',
  ) => {
    if (tab === 'settings') {
      setIsSettingsOpen(true);
      return;
    }
    setActiveTab(tab);
  };

  const handleMainMenuClick = () => {
    const menuBtn = document.querySelector(
      '.mdc-icon-button[aria-label="Main menu"]',
    ) as HTMLElement;
    if (menuBtn) {
      menuBtn.click();
    } else {
      console.warn('Main menu button not found');
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
      className={`flex bg-background text-foreground ${className || 'h-full'} relative overflow-hidden`}
      data-density={layoutDensity}
    >
      {/* Sidebar Tabs */}
      <div className="sidebar-nav border-r flex flex-col items-center bg-muted/20 shrink-0">
        <SimpleTooltip content={t('tooltip.toggleMenu')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMainMenuClick}
            className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
          >
            <Menu className="sidebar-icon" />
          </Button>
        </SimpleTooltip>
        <Separator className="w-8 my-1" />

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
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
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
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
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
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
            >
              <Settings className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
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
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
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
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
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
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
              data-tour-id="tour-prompts"
            >
              <Sparkles className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
          {shortcuts?.favorites && (
            <SimpleTooltip content={t('tabs.favorites')}>
              <Button
                variant={activeTab === 'favorites' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleTabChange('favorites')}
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
                data-tour-id="tour-favorites"
              >
                <Star className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}
          <SimpleTooltip content={t('tabs.tags')}>
            <Button
              variant={activeTab === 'tags' ? 'secondary' : 'ghost'}
              size="icon"
              onClick={() => handleTabChange('tags')}
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
              data-tour-id="tour-tags"
            >
              <Tag className="sidebar-icon" />
            </Button>
          </SimpleTooltip>

          {((shortcuts?.myStuff ?? true) || (shortcuts?.gems ?? true)) && (
            <Separator className="w-8 my-1" />
          )}

          {(shortcuts?.myStuff ?? true) && (
            <SimpleTooltip content={t('shortcuts.myStuff')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('https://gemini.google.com/mystuff')}
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
                data-tour-id="tour-mystuff"
              >
                <Library className="sidebar-icon" />
              </Button>
            </SimpleTooltip>
          )}

          {(shortcuts?.gems ?? true) && (
            <SimpleTooltip content={t('tabs.gems')}>
              <Button
                variant={activeTab === 'gems' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => handleTabChange('gems')}
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
                data-tour-id="tour-gems"
              >
                <Gem className="sidebar-icon" />
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
                className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
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
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
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
              className="sidebar-btn rounded-xl transition-all hover:rounded-xl"
              data-tour-id="tour-settings"
            >
              <Settings className="sidebar-icon" />
            </Button>
          </SimpleTooltip>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={`flex flex-col transition-opacity duration-300 ease-in-out ${
          isSidebarExpanded
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        style={{
          width:
            'calc(var(--bard-sidenav-open-width, 360px) - var(--bard-sidenav-closed-width, 64px))',
          flexShrink: 0,
        }}
      >
        {activeTab === 'files' ? (
          <ExplorerTab
            onNewChat={moduleConfig.explorer.onNewChat}
            newChatDropdownItems={moduleConfig.explorer.newChatDropdownItems}
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
        ) : activeTab === 'gems' ? (
          <GemsTab menuActions={moduleConfig.general.menuActions} />
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
      {guidedTour.showPrompt && isSidebarExpanded && (
        <TourPromptDialog
          isOpen={guidedTour.showPrompt}
          onStartTour={guidedTour.acceptTour}
          onSkip={guidedTour.dismissPrompt}
        />
      )}
      {guidedTour.isActive && isSidebarExpanded && (
        <GuidedTour
          steps={GEMINI_TOUR_STEPS}
          currentStep={guidedTour.currentStep}
          isActive={guidedTour.isActive}
          onNext={guidedTour.nextStep}
          onPrev={guidedTour.prevStep}
          onSkip={guidedTour.skipTour}
        />
      )}
    </div>
  );
};
