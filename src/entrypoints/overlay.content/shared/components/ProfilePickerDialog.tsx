/**
 * ProfilePickerDialog - appears when a detected account is not bound to any profile.
 *
 * Shows all profiles with availability status, allows selecting or creating a new profile,
 * or cancelling (which disables the platform for the session).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useProfileStore } from '@/shared/lib/store/profile-store';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { PLATFORM_CONFIG, Platform } from '@/shared/types/platform';

export const ProfilePickerDialog: React.FC = () => {
  const { pickerOpen, pickerData, closePicker, setLoading, loading } =
    useProfileStore();
  const [creatingNew, setCreatingNew] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  // Listen for PROFILE_ACCOUNT_UNBOUND events from content scripts
  useEffect(() => {
    const consume = (data: any) => {
      if (data?.action === 'unbound') {
        useProfileStore.getState().openPicker({
          platform: data.platform,
          username: data.username,
          profiles: data.profiles,
        });
      }
    };

    // Check for pending data that arrived before this component mounted
    const pending = (window as any).__PROFILE_UNBOUND_PENDING;
    if (pending) {
      consume(pending);
      delete (window as any).__PROFILE_UNBOUND_PENDING;
    }

    // Listen for future events (e.g. account switch without page reload)
    const handler = (event: Event) => {
      consume((event as CustomEvent).detail);
    };
    window.addEventListener('PROFILE_ACCOUNT_UNBOUND', handler);
    return () => window.removeEventListener('PROFILE_ACCOUNT_UNBOUND', handler);
  }, []);

  const handleSelectProfile = useCallback(
    async (profileId: string) => {
      if (!pickerData || loading) return;
      setLoading(true);
      try {
        await browser.runtime.sendMessage({
          type: 'BIND_ACCOUNT',
          payload: {
            profileId,
            platform: pickerData.platform,
            username: pickerData.username,
          },
        });
        closePicker();
        // Reload to apply the new profile
        window.location.reload();
      } catch (e) {
        console.error('Failed to bind account:', e);
      } finally {
        setLoading(false);
      }
    },
    [pickerData, loading, closePicker, setLoading],
  );

  const handleCreateProfile = useCallback(async () => {
    if (!pickerData || !newProfileName.trim() || loading) return;
    setLoading(true);
    try {
      // Step 1: Create the profile
      const createResponse = await browser.runtime.sendMessage({
        type: 'CREATE_PROFILE',
        payload: { name: newProfileName.trim() },
      });
      if (!createResponse?.success || !createResponse?.data?.id) {
        throw new Error('Failed to create profile');
      }

      // Step 2: Bind account to the new profile
      await browser.runtime.sendMessage({
        type: 'BIND_ACCOUNT',
        payload: {
          profileId: createResponse.data.id,
          platform: pickerData.platform,
          username: pickerData.username,
        },
      });

      closePicker();
      setNewProfileName('');
      setCreatingNew(false);
      // Reload to apply the new profile
      window.location.reload();
    } catch (e) {
      console.error('Failed to create profile:', e);
    } finally {
      setLoading(false);
    }
  }, [pickerData, newProfileName, loading, closePicker, setLoading]);

  const handleCancel = useCallback(async () => {
    if (!pickerData) return;
    try {
      await browser.runtime.sendMessage({
        type: 'DISABLE_PLATFORM',
        payload: { platform: pickerData.platform, disabled: true },
      });
    } catch (e) {
      console.error('Failed to disable platform:', e);
    }
    closePicker();
  }, [pickerData, closePicker]);

  if (!pickerOpen || !pickerData) return null;

  const platformConfig =
    PLATFORM_CONFIG[pickerData.platform as Platform] || null;
  const platformName = platformConfig?.name || pickerData.platform;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0"
      style={{ zIndex: 200 }}
    >
      <div
        className="fixed left-[50%] top-[50%] flex w-full max-w-md max-h-[80vh] translate-x-[-50%] translate-y-[-50%] flex-col border bg-background shadow-lg duration-200 sm:rounded-lg animate-in fade-in-0 zoom-in-95 overflow-hidden"
        style={{ zIndex: 201 }}
      >
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-semibold leading-tight tracking-tight">
            Select Profile
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            New account detected on <strong>{platformName}</strong>:{' '}
            <span className="font-mono text-foreground">
              {pickerData.username}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Choose a profile to bind this account to, or create a new one.
          </p>
        </div>

        {/* Profile list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-3 space-y-2">
            {pickerData.profiles.map((profile) => {
              const disabled = !profile.canBind;
              const accountList = Object.entries(profile.accounts || {});

              return (
                <button
                  key={profile.id}
                  disabled={disabled || loading}
                  onClick={() => handleSelectProfile(profile.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    disabled
                      ? 'opacity-50 cursor-not-allowed bg-muted'
                      : 'hover:bg-accent hover:border-accent-foreground/20 cursor-pointer'
                  }`}
                >
                  <div className="font-medium text-sm">{profile.name}</div>
                  {accountList.length > 0 ? (
                    <div className="mt-1 space-y-0.5">
                      {accountList.map(([platform, username]) => {
                        const pConfig =
                          PLATFORM_CONFIG[platform as Platform] || null;
                        return (
                          <div
                            key={platform}
                            className="text-xs text-muted-foreground flex items-center gap-1"
                          >
                            <span className="font-medium">
                              {pConfig?.name || platform}:
                            </span>
                            <span className="font-mono">{username}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-1">
                      No accounts bound yet
                    </div>
                  )}
                  {disabled && (
                    <div className="text-xs text-destructive mt-1">
                      Already has a different {platformName} account
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Create new profile */}
        <div className="shrink-0 px-6 py-3 border-t">
          {!creatingNew ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setCreatingNew(true)}
              disabled={loading}
            >
              + Create New Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Profile name..."
                className="flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProfile();
                  if (e.key === 'Escape') {
                    setCreatingNew(false);
                    setNewProfileName('');
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={handleCreateProfile}
                disabled={!newProfileName.trim() || loading}
              >
                Create
              </Button>
            </div>
          )}
        </div>

        {/* Cancel */}
        <div className="shrink-0 px-6 pb-6 pt-2">
          <Button
            variant="ghost"
            className="w-full"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel (Disable {platformName} for this session)
          </Button>
        </div>
      </div>
    </div>
  );
};
