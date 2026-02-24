/**
 * Profile store for overlay UI.
 * Manages profile picker dialog state and communicates with background.
 */

import { create } from 'zustand';
import type { Profile } from '@/shared/lib/profile-registry';

interface ProfilePickerData {
  platform: string;
  username: string;
  profiles: Array<{
    id: string;
    name: string;
    accounts: Partial<Record<string, string>>;
    canBind: boolean;
  }>;
}

interface ProfileStoreState {
  /** Whether the profile picker dialog is open */
  pickerOpen: boolean;
  /** Data for the picker dialog */
  pickerData: ProfilePickerData | null;
  /** Loading state */
  loading: boolean;
  /** Active profile info */
  activeProfile: Profile | null;

  // Actions
  openPicker: (data: ProfilePickerData) => void;
  closePicker: () => void;
  setLoading: (loading: boolean) => void;
  setActiveProfile: (profile: Profile | null) => void;
}

export const useProfileStore = create<ProfileStoreState>((set) => ({
  pickerOpen: false,
  pickerData: null,
  loading: false,
  activeProfile: null,

  openPicker: (data) => set({ pickerOpen: true, pickerData: data }),
  closePicker: () => set({ pickerOpen: false, pickerData: null }),
  setLoading: (loading) => set({ loading }),
  setActiveProfile: (activeProfile) => set({ activeProfile }),
}));
