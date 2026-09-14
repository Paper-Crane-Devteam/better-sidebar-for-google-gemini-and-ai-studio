import React from 'react';
import { GlobalPopoverPicker } from '@/shared/components/GlobalPopoverPicker';
import { GlobalToast } from '@/shared/components/GlobalToast';
import { PowerPackPaywall } from '@/shared/components/PowerPackPaywall';
import { ProfilePickerDialog } from '@/entrypoints/overlay.content/shared/components/ProfilePickerDialog';
import { RatingPromptDialog } from '@/entrypoints/overlay.content/shared/modules/feedback/RatingPromptDialog';

/**
 * Container for all ChatGPT overlay/modal/dialog/toast components.
 * Mounted directly in document.body stacking context to avoid clipping issues.
 */
export const ChatGPTEnhancedFeatures = () => {
  return (
    <>
      <ProfilePickerDialog />
      <RatingPromptDialog />
      <PowerPackPaywall />
      <GlobalPopoverPicker />
      <GlobalToast />
    </>
  );
};
