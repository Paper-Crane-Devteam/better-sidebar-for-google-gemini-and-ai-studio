import { AutoHideInputFeature } from './AutoHideInputFeature';
import { AutoHideRunSettingsFeature } from './AutoHideRunSettingsFeature';
import { SlashCommandFeature } from './SlashCommandFeature';
import { AgentLoopFeature } from './AgentLoopFeature';
import { SaveSnippetFeature } from './SaveSnippetFeature';
import { SnippetDragDrawer } from '@/entrypoints/overlay.content/shared/modules/snippets/components/SnippetDragFolderView';
import { GlobalModal } from '@/shared/components/GlobalModal';
import { GlobalPopoverPicker } from '@/shared/components/GlobalPopoverPicker';
import { GlobalToast } from '@/shared/components/GlobalToast';
import { SnippetReaderDrawer } from '@/entrypoints/overlay.content/shared/modules/snippets/components/SnippetReaderDrawer';
import { WorkspaceFileDrawer } from '@/entrypoints/overlay.content/shared/modules/agent-tab/workspace/WorkspaceFileDrawer';
import { SettingsModal } from '@/entrypoints/overlay.content/shared/modules/settings/SettingsModal';
import { WhatsNewDialog } from '@/entrypoints/overlay.content/shared/modules/whats-new/WhatsNewDialog';
import { ProfilePickerDialog } from '@/entrypoints/overlay.content/shared/components/ProfilePickerDialog';
import { RatingPromptDialog } from '@/entrypoints/overlay.content/shared/modules/feedback/RatingPromptDialog';
import { UpdateAvailableToast } from '@/entrypoints/overlay.content/shared/modules/extension-update/UpdateAvailableToast';
import { PowerPackPaywall } from '@/shared/components/PowerPackPaywall';
import { HotkeyCheatsheet } from '@/entrypoints/overlay.content/shared/components/HotkeyCheatsheet';
import { CommandPalette } from '@/entrypoints/overlay.content/shared/modules/command-palette';
import { useHotkeyListener } from '@/shared/hooks/useHotkeyListener';
import { useAppStore } from '@/shared/lib/store';
import { useInitConversationMessages } from '@/shared/hooks/useInitConversationMessages';
import { useModelStream } from '@/shared/hooks/useModelStream';

/**
 * Container for all AI Studio enhanced features.
 * These features inject CSS/behavior into the native AI Studio page
 * and remain active regardless of whether the overlay sidebar is visible.
 */
export const AIStudioEnhancedFeatures = () => {
  const isSettingsOpen = useAppStore((s) => s.ui.overlay.isSettingsOpen);
  const setIsSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  // Shortcuts belong to this tree, not to the panel: the panel unmounts when the
  // user switches back to the original sidebar, and the shortcut that switches
  // back has to survive that. Registration is refcounted, so the copy in
  // OverlayPanel does not double up.
  useHotkeyListener();

  // Initialize the shared conversation messages store (DB fetch, interceptor, DOM observer)
  useInitConversationMessages();

  // Feed the in-flight generation into the live stream store. That store is what
  // lets the agent view show a reply while it is still being written, instead of
  // waiting for AI Studio to save the turn a few seconds after it finishes.
  useModelStream();

  return (
    <>
      <AutoHideInputFeature />
      <AutoHideRunSettingsFeature />
      <SlashCommandFeature />
      <AgentLoopFeature />
      <SaveSnippetFeature />
      <SnippetDragDrawer />
      <SnippetReaderDrawer />
      <WorkspaceFileDrawer />
      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <WhatsNewDialog />
      <ProfilePickerDialog />
      <RatingPromptDialog />
      <UpdateAvailableToast />
      <PowerPackPaywall />
      <HotkeyCheatsheet />
      <CommandPalette />
      <GlobalModal />
      <GlobalPopoverPicker />
      <GlobalToast />
    </>
  );
};
