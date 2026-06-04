import React from 'react';
// [DEPRECATED] import { DefaultModelFeature } from './DefaultModelFeature';
import { GeminiUIControl } from './GeminiUIControl';
// [DEPRECATED] import { TopBarTagFeature } from './TopBarTagFeature';
import { ZenModeFeature } from './ZenModeFeature';
import { SmartScrollbarFeature } from './SmartScrollbar/SmartScrollbarFeature';
import { QuickResendFeature } from './QuickResendFeature';
import { AutoHideInputFeature } from './AutoHideInputFeature';
import { SlashCommandFeature } from './SlashCommandFeature';
import { GlobalModal } from '@/shared/components/GlobalModal';

/**
 * Container for all Gemini enhanced features.
 * Mounted independently from the OverlayPanel so features remain
 * active even when the overlay is disabled.
 */
export const GeminiEnhancedFeatures = () => {
  return (
    <>
      {/* [DEPRECATED] DefaultModelFeature - removed due to Gemini UI redesign */}
      {/* <DefaultModelFeature /> */}
      {/* [DEPRECATED] TopBarTagFeature - removed due to Gemini UI redesign */}
      {/* <TopBarTagFeature /> */}
      <GeminiUIControl />
      <ZenModeFeature />
      <SmartScrollbarFeature />
      <QuickResendFeature />
      <AutoHideInputFeature />
      <SlashCommandFeature />
      <GlobalModal />
    </>
  );
};
