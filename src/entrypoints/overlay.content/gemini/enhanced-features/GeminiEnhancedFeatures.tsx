import React from 'react';
// [DEPRECATED] import { DefaultModelFeature } from './DefaultModelFeature';
import { useGeminiUI } from './GeminiUIControl/useGeminiUI';
// [DEPRECATED] import { TopBarTagFeature } from './TopBarTagFeature';
import { ZenModeFeature } from './ZenModeFeature';
import { SmartScrollbarFeature } from './SmartScrollbar/SmartScrollbarFeature';
import { AutoHideInputFeature } from './AutoHideInputFeature';
import { SlashCommandFeature } from './SlashCommandFeature';
import { AgentLoopFeature } from './AgentLoopFeature';
import { SaveSnippetFeature } from './SaveSnippetFeature';
import { SelectionToolbarFeature } from './SelectionToolbar/SelectionToolbarFeature';
import { SnippetDragDrawer } from '@/entrypoints/overlay.content/shared/modules/snippets/components/SnippetDragFolderView';
import { GlobalModal } from '@/shared/components/GlobalModal';
import { GlobalPopoverPicker } from '@/shared/components/GlobalPopoverPicker';
import { GlobalToast } from '@/shared/components/GlobalToast';
import { SnippetReaderDrawer } from '@/entrypoints/overlay.content/shared/modules/snippets/components/SnippetReaderDrawer';
import { WorkspaceFileDrawer } from '@/entrypoints/overlay.content/shared/modules/agent-tab/workspace/WorkspaceFileDrawer';
import { SettingsModal } from '@/entrypoints/overlay.content/shared/modules/settings/SettingsModal';
import { WhatsNewDialog } from '@/entrypoints/overlay.content/shared/modules/whats-new/WhatsNewDialog';
import { useAppStore } from '@/shared/lib/store';
import { useInitConversationMessages } from '@/shared/hooks/useInitConversationMessages';
import { useModelStream } from '@/shared/hooks/useModelStream';
import { ProfilePickerDialog } from '@/entrypoints/overlay.content/shared/components/ProfilePickerDialog';
import { RatingPromptDialog } from '@/entrypoints/overlay.content/shared/modules/feedback/RatingPromptDialog';
import { PowerPackPaywall } from '@/shared/components/PowerPackPaywall';
import { HotkeyCheatsheet } from '@/entrypoints/overlay.content/shared/components/HotkeyCheatsheet';
import { CommandPalette } from '@/entrypoints/overlay.content/shared/modules/command-palette';
import { useHotkeyListener } from '@/shared/hooks/useHotkeyListener';
import { TourPromptDialog } from '@/entrypoints/overlay.content/shared/modules/guided-tour/TourPromptDialog';
import { GuidedTour } from '@/entrypoints/overlay.content/shared/modules/guided-tour/GuidedTour';
import { useGuidedTour } from '@/entrypoints/overlay.content/shared/modules/guided-tour/useGuidedTour';
import { GEMINI_TOUR_STEPS } from '@/entrypoints/overlay.content/shared/modules/guided-tour/tour-steps';

/**
 * Container for all Gemini enhanced features.
 * Mounted independently from the OverlayPanel so features remain
 * active even when the overlay is disabled.
 */
export const GeminiEnhancedFeatures = () => {
  const isSettingsOpen = useAppStore((s) => s.ui.overlay.isSettingsOpen);
  const setIsSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const isSidebarExpanded = useAppStore((s) => s.ui.overlay.isSidebarExpanded);
  const guidedTour = useGuidedTour();

  // Shortcuts belong to this tree, not to the panel: the panel unmounts when the
  // user switches back to the original sidebar, and the shortcut that switches
  // back has to survive that. Registration is refcounted, so the copy in
  // OverlayPanel does not double up.
  useHotkeyListener();

  // Initialize the shared conversation messages store (DB fetch, interceptor, DOM observer)
  useInitConversationMessages();

  // Feed the in-flight generation into the live stream store. On Gemini the agent view
  // still reads the DOM for its transcript, so this is not (yet) about rendering — it
  // is what gives the agent loop the model's own bytes to parse instead of the ones the
  // markdown renderer left behind. See `model-stream-store`.
  useModelStream();

  // Keep GeminiUI side-effects running (CSS injection, top-bar-actions offset, etc.)
  // even though the control panel UI is hidden.
  useGeminiUI();

  return (
    <>
      {/* [DEPRECATED] DefaultModelFeature - removed due to Gemini UI redesign */}
      {/* <DefaultModelFeature /> */}
      {/* [DEPRECATED] TopBarTagFeature - removed due to Gemini UI redesign */}
      {/* <TopBarTagFeature /> */}
      <ZenModeFeature />
      <SmartScrollbarFeature />
      <AutoHideInputFeature />
      <SlashCommandFeature />
      <AgentLoopFeature />
      <SaveSnippetFeature />
      <SelectionToolbarFeature />
      <SnippetDragDrawer />
      <SnippetReaderDrawer />
      <WorkspaceFileDrawer />
      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <WhatsNewDialog />
      <ProfilePickerDialog />
      <RatingPromptDialog />
      <PowerPackPaywall />
      <HotkeyCheatsheet />
      <CommandPalette />
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
      <GlobalModal />
      <GlobalPopoverPicker />
      <GlobalToast />
    </>
  );
};
