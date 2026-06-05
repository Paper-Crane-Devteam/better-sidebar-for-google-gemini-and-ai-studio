import { useEffect } from 'react';
import { detectPlatform } from '@/shared/types/platform';
import { useAppStore } from '@/shared/lib/store';
import { useTheme } from '../modules/settings/hooks/useTheme';
import { useBadgeStore } from '@/shared/lib/badge-store';

export const useAppInit = () => {
  const setCurrentPlatform = useAppStore((s) => s.setCurrentPlatform);

  useEffect(() => {
    const platform = detectPlatform();
    setCurrentPlatform(platform);
  }, [setCurrentPlatform]);

  // Initialize badge (red dot) store from storage
  useEffect(() => {
    useBadgeStore.getState().init();
  }, []);

  useTheme();
};

