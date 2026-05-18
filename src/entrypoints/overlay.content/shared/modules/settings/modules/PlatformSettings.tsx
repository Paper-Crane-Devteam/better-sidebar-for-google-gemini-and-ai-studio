import React from 'react';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { GeminiPlatformSettings } from './platform/GeminiPlatformSettings';

/**
 * Platform-specific settings tab.
 * Renders different content based on the current platform.
 * Currently only Gemini has platform-specific settings.
 * Extensible: add new platform components as needed.
 */
export const PlatformSettings = () => {
  const platform = detectPlatform();

  switch (platform) {
    case Platform.GEMINI:
      return <GeminiPlatformSettings />;
    // Future platforms can be added here:
    // case Platform.AI_STUDIO:
    //   return <AIStudioPlatformSettings />;
    default:
      return null;
  }
};
