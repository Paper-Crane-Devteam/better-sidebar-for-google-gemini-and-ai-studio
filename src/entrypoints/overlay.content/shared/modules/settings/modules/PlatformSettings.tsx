import React from 'react';
import { detectPlatform, Platform } from '@/shared/types/platform';
import { GeminiPlatformSettings } from './platform/GeminiPlatformSettings';
import { AIStudioPlatformSettings } from './platform/AIStudioPlatformSettings';

/**
 * Platform-specific settings tab.
 * Renders different content based on the current platform.
 * Extensible: add new platform components as needed.
 */
export const PlatformSettings = () => {
  const platform = detectPlatform();

  switch (platform) {
    case Platform.GEMINI:
      return <GeminiPlatformSettings />;
    case Platform.AI_STUDIO:
      return <AIStudioPlatformSettings />;
    default:
      return null;
  }
};
