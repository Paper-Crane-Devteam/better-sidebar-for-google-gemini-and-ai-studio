import React from 'react';
import { useSettingsStore } from '@/shared/lib/settings-store';
import { SmartScrollbar } from './index';

/**
 * Feature wrapper that reads the showSmartScrollbar setting
 * and conditionally renders the SmartScrollbar component.
 */
export const SmartScrollbarFeature = () => {
  const showSmartScrollbar = useSettingsStore(
    (s) => s.enhancedFeatures.gemini.showSmartScrollbar,
  );

  if (!showSmartScrollbar) return null;

  return <SmartScrollbar />;
};
