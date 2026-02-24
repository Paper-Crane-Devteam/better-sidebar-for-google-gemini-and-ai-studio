/**
 * Profile Registry - manages multi-profile data isolation
 *
 * Stored in browser.storage.local as a lightweight JSON registry.
 * Each profile maps to its own SQLite database file.
 */

import type { Platform } from '../types/platform';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProfileAccount {
  /** Platform identifier */
  platform: Platform;
  /** Username / email on that platform */
  username: string;
}

export interface Profile {
  id: string;
  name: string;
  /** SQLite database filename for this profile */
  dbName: string;
  /** Map of platform → username bound to this profile */
  accounts: Partial<Record<Platform, string>>;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileRegistry {
  /** Currently active profile ID */
  activeProfileId: string;
  /** All profiles keyed by ID */
  profiles: Record<string, Profile>;
  /**
   * Platforms temporarily disabled for the current session.
   * Key = platform, value = true if disabled.
   * This is session-only and cleared on extension restart.
   */
  disabledPlatforms: Partial<Record<Platform, boolean>>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REGISTRY_KEY = 'profile-registry';
const LEGACY_DB_NAME = 'prompt-manager-for-google-ai-studio.db';

// ─── Registry Access ─────────────────────────────────────────────────────────

/**
 * Get the full profile registry. Creates a default one if none exists.
 */
export async function getRegistry(): Promise<ProfileRegistry> {
  try {
    const result = await browser.storage.local.get(REGISTRY_KEY);
    const raw = result[REGISTRY_KEY];
    if (raw) {
      const registry: ProfileRegistry =
        typeof raw === 'string' ? JSON.parse(raw) : raw;
      // Ensure disabledPlatforms always exists (session-level, may be missing)
      if (!registry.disabledPlatforms) {
        registry.disabledPlatforms = {};
      }
      return registry;
    }
  } catch (e) {
    console.error('[ProfileRegistry] Error reading registry:', e);
  }

  // First run: create default profile pointing to legacy DB name
  const defaultProfile = createDefaultProfile();
  const registry: ProfileRegistry = {
    activeProfileId: defaultProfile.id,
    profiles: { [defaultProfile.id]: defaultProfile },
    disabledPlatforms: {},
  };
  await saveRegistry(registry);
  return registry;
}

/**
 * Persist the registry to storage.
 */
export async function saveRegistry(registry: ProfileRegistry): Promise<void> {
  try {
    await browser.storage.local.set({
      [REGISTRY_KEY]: JSON.stringify(registry),
    });
  } catch (e) {
    console.error('[ProfileRegistry] Error saving registry:', e);
    throw e;
  }
}

// ─── Profile CRUD ────────────────────────────────────────────────────────────

/**
 * Get the currently active profile.
 */
export async function getActiveProfile(): Promise<Profile> {
  const registry = await getRegistry();
  const profile = registry.profiles[registry.activeProfileId];
  if (!profile) {
    // Fallback: pick the first profile
    const first = Object.values(registry.profiles)[0];
    if (first) {
      registry.activeProfileId = first.id;
      await saveRegistry(registry);
      return first;
    }
    throw new Error('No profiles found in registry');
  }
  return profile;
}

/**
 * Get all profiles as an array.
 */
export async function getAllProfiles(): Promise<Profile[]> {
  const registry = await getRegistry();
  return Object.values(registry.profiles);
}

/**
 * Create a new profile (no account binding yet).
 * Returns the new profile.
 */
export async function createProfile(name: string): Promise<Profile> {
  const registry = await getRegistry();

  const id = crypto.randomUUID();
  const dbName = `profile-${id}.db`;
  const now = Math.floor(Date.now() / 1000);

  const profile: Profile = {
    id,
    name,
    dbName,
    accounts: {},
    createdAt: now,
    updatedAt: now,
  };

  registry.profiles[id] = profile;
  await saveRegistry(registry);

  console.log(`[ProfileRegistry] Created profile "${name}" (${id})`);
  return profile;
}

/**
 * Set the active profile.
 */
export async function setActiveProfile(profileId: string): Promise<void> {
  const registry = await getRegistry();
  if (!registry.profiles[profileId]) {
    throw new Error(`Profile ${profileId} not found`);
  }
  registry.activeProfileId = profileId;
  await saveRegistry(registry);
  console.log(`[ProfileRegistry] Active profile set to ${profileId}`);
}

// ─── Account Binding ─────────────────────────────────────────────────────────

/**
 * Delete a profile by ID. Cannot delete the currently active profile.
 */
export async function deleteProfile(profileId: string): Promise<void> {
  const registry = await getRegistry();
  if (registry.activeProfileId === profileId) {
    throw new Error('Cannot delete the currently active profile');
  }
  if (!registry.profiles[profileId]) {
    throw new Error(`Profile ${profileId} not found`);
  }
  const name = registry.profiles[profileId].name;
  delete registry.profiles[profileId];
  await saveRegistry(registry);
  console.log(`[ProfileRegistry] Deleted profile "${name}" (${profileId})`);
}

/**
 * Rename a profile.
 */
export async function renameProfile(
  profileId: string,
  newName: string,
): Promise<void> {
  const registry = await getRegistry();
  const profile = registry.profiles[profileId];
  if (!profile) {
    throw new Error(`Profile ${profileId} not found`);
  }
  profile.name = newName;
  profile.updatedAt = Math.floor(Date.now() / 1000);
  await saveRegistry(registry);
  console.log(`[ProfileRegistry] Renamed profile ${profileId} to "${newName}"`);
}

/**
 * Bind a platform account to a profile.
 * Throws if the profile already has a different account on this platform.
 */
export async function bindAccount(
  profileId: string,
  platform: Platform,
  username: string,
): Promise<void> {
  const registry = await getRegistry();
  const profile = registry.profiles[profileId];
  if (!profile) {
    throw new Error(`Profile ${profileId} not found`);
  }

  const existing = profile.accounts[platform];
  if (existing && existing !== username) {
    throw new Error(
      `Profile "${profile.name}" already has a different account (${existing}) for ${platform}`,
    );
  }

  profile.accounts[platform] = username;
  profile.updatedAt = Math.floor(Date.now() / 1000);
  await saveRegistry(registry);

  console.log(
    `[ProfileRegistry] Bound ${platform}:${username} to profile "${profile.name}"`,
  );
}

/**
 * Find the profile that has a specific platform+username combo.
 * Returns the profile or null if none found.
 */
export async function findProfileByAccount(
  platform: Platform,
  username: string,
): Promise<Profile | null> {
  const registry = await getRegistry();
  for (const profile of Object.values(registry.profiles)) {
    if (profile.accounts[platform] === username) {
      return profile;
    }
  }
  return null;
}

/**
 * Check if a profile can accept a new account on the given platform.
 * Returns true if the platform slot is free (no account bound yet).
 */
export async function canBindToProfile(
  profileId: string,
  platform: Platform,
): Promise<boolean> {
  const registry = await getRegistry();
  const profile = registry.profiles[profileId];
  if (!profile) return false;
  return !profile.accounts[platform];
}

// ─── DB Name Helpers ─────────────────────────────────────────────────────────

/**
 * Get the database filename for the currently active profile.
 */
export async function getDbNameForActiveProfile(): Promise<string> {
  const profile = await getActiveProfile();
  return profile.dbName;
}

// ─── Platform Disable (Session-level) ────────────────────────────────────────

/**
 * Temporarily disable/enable a platform for the current session.
 */
export async function setDisabledPlatform(
  platform: Platform,
  disabled: boolean,
): Promise<void> {
  const registry = await getRegistry();
  if (disabled) {
    registry.disabledPlatforms[platform] = true;
  } else {
    delete registry.disabledPlatforms[platform];
  }
  await saveRegistry(registry);
}

/**
 * Get all currently disabled platforms.
 */
export async function getDisabledPlatforms(): Promise<
  Partial<Record<Platform, boolean>>
> {
  const registry = await getRegistry();
  return registry.disabledPlatforms || {};
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Create the default profile that points to the legacy database.
 */
function createDefaultProfile(): Profile {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 'default',
    name: 'Default Profile',
    dbName: LEGACY_DB_NAME,
    accounts: {},
    createdAt: now,
    updatedAt: now,
  };
}
