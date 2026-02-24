import type {
  ExtensionMessage,
  ExtensionResponse,
} from '@/shared/types/messages';
import type { MessageSender } from '../types';
import { Platform } from '@/shared/types/platform';
import { switchDB } from '@/shared/db';
import {
  getActiveProfile,
  getAllProfiles,
  createProfile,
  deleteProfile,
  renameProfile,
  bindAccount,
  setActiveProfile,
  findProfileByAccount,
  setDisabledPlatform,
  getDisabledPlatforms,
  getRegistry,
} from '@/shared/lib/profile-registry';
import { notifyDataUpdated } from '../notify';
import { setTabDb, setCurrentDbName } from '../tab-profile-map';

export async function handleProfile(
  message: ExtensionMessage,
  sender: MessageSender,
): Promise<ExtensionResponse | null> {
  switch (message.type) {
    case 'DETECT_ACCOUNT': {
      try {
        const { platform, username } = message.payload;
        const platformEnum = platform as Platform;
        const tabId = sender.tab?.id;

        // Check if this account is already bound in the active profile
        const activeProfile = await getActiveProfile();
        const activeAccount = activeProfile.accounts[platformEnum];

        if (activeAccount === username) {
          // Account matches active profile — register tab→db mapping
          if (tabId != null) setTabDb(tabId, activeProfile.dbName);
          return {
            success: true,
            data: { action: 'ok', profileId: activeProfile.id },
          };
        }

        // Check if this account exists in any other profile
        const existingProfile = await findProfileByAccount(
          platformEnum,
          username,
        );
        if (existingProfile) {
          // Auto-switch to the profile that has this account
          await setActiveProfile(existingProfile.id);
          await switchDB(existingProfile.dbName);
          setCurrentDbName(existingProfile.dbName);
          if (tabId != null) setTabDb(tabId, existingProfile.dbName);
          await notifyDataUpdated('PROFILE_SWITCHED', {
            profileId: existingProfile.id,
            profileName: existingProfile.name,
          });
          return {
            success: true,
            data: {
              action: 'switched',
              profileId: existingProfile.id,
              profileName: existingProfile.name,
            },
          };
        }

        // Account not in any profile — if the active profile has no account for this platform,
        // auto-bind it (first-time setup convenience)
        if (!activeAccount) {
          await bindAccount(activeProfile.id, platformEnum, username);
          if (tabId != null) setTabDb(tabId, activeProfile.dbName);
          return {
            success: true,
            data: { action: 'bound', profileId: activeProfile.id },
          };
        }

        // Active profile has a DIFFERENT account for this platform,
        // and no other profile has this account — user needs to choose
        const profiles = await getAllProfiles();
        return {
          success: true,
          data: {
            action: 'unbound',
            platform,
            username,
            profiles: profiles.map((p) => ({
              id: p.id,
              name: p.name,
              accounts: p.accounts,
              canBind: !p.accounts[platformEnum], // true if platform slot is free
            })),
          },
        };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GET_ACTIVE_PROFILE': {
      try {
        const profile = await getActiveProfile();
        return { success: true, data: profile };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GET_ALL_PROFILES': {
      try {
        const profiles = await getAllProfiles();
        return { success: true, data: profiles };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'CREATE_PROFILE': {
      try {
        const { name } = message.payload;
        const profile = await createProfile(name);
        return { success: true, data: profile };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'BIND_ACCOUNT': {
      try {
        const { profileId, platform, username } = message.payload;
        await bindAccount(profileId, platform as Platform, username);

        // Switch to the bound profile
        const registry = await getRegistry();
        const profile = registry.profiles[profileId];
        await setActiveProfile(profileId);
        await switchDB(profile.dbName);
        setCurrentDbName(profile.dbName);
        if (sender.tab?.id != null) setTabDb(sender.tab.id, profile.dbName);
        await notifyDataUpdated('PROFILE_SWITCHED', {
          profileId,
          profileName: profile.name,
        });
        return { success: true, data: { profileId } };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'SWITCH_PROFILE': {
      try {
        const { profileId } = message.payload;
        const registry = await getRegistry();
        const profile = registry.profiles[profileId];
        if (!profile) {
          return { success: false, error: `Profile ${profileId} not found` };
        }
        await setActiveProfile(profileId);
        await switchDB(profile.dbName);
        setCurrentDbName(profile.dbName);
        if (sender.tab?.id != null) setTabDb(sender.tab.id, profile.dbName);
        await notifyDataUpdated('PROFILE_SWITCHED', {
          profileId,
          profileName: profile.name,
        });
        return {
          success: true,
          data: { profileId, profileName: profile.name },
        };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'DISABLE_PLATFORM': {
      try {
        const { platform, disabled } = message.payload;
        await setDisabledPlatform(platform as Platform, disabled);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'GET_PROFILE_STATUS': {
      try {
        const profile = await getActiveProfile();
        const disabled = await getDisabledPlatforms();
        const profiles = await getAllProfiles();
        return {
          success: true,
          data: {
            activeProfile: profile,
            disabledPlatforms: disabled,
            totalProfiles: profiles.length,
          },
        };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'DELETE_PROFILE': {
      try {
        const { profileId } = message.payload;
        await deleteProfile(profileId);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    case 'RENAME_PROFILE': {
      try {
        const { profileId, name } = message.payload;
        await renameProfile(profileId, name);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    }

    default:
      return null;
  }
}
