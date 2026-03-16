import React from 'react';
import { DefaultModelFeature } from './DefaultModelFeature';
import { GeminiUIControl } from './GeminiUIControl';
import { TopBarTagFeature } from './TopBarTagFeature';
import { ZenModeFeature } from './ZenModeFeature';
import { SmartScrollbarFeature } from './SmartScrollbar/SmartScrollbarFeature';

/**
 * Container for all Gemini enhanced features.
 * Mounted independently from the OverlayPanel so features remain
 * active even when the overlay is disabled.
 */
export const GeminiEnhancedFeatures = () => {
  return (
    <>
      <DefaultModelFeature />
      <TopBarTagFeature />
      <GeminiUIControl />
      <ZenModeFeature />
      <SmartScrollbarFeature />
    </>
  );
};
