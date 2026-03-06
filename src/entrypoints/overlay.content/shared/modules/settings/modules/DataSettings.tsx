import React, { useEffect, useRef, useState } from 'react';
import { Separator } from '../../../components/ui/separator';
import { Button } from '../../../components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Trash2,
  Download,
  Upload,
  Loader2,
  RefreshCw,
  FileUp,
  Plus,
  User,
  Pencil,
  Check,
  X,
  CheckCircle2,
  UploadCloud,
  DownloadCloud,
  Link,
  Unlink,
  AlertTriangle,
} from 'lucide-react';
import { useDataManagement } from '../hooks/useDataManagement';
import { useI18n } from '@/shared/hooks/useI18n';
import { ImportHistoryDialog } from '@/entrypoints/overlay.content/aistudio/modules/search/components/ImportHistoryDialog';
import { PLATFORM_CONFIG, Platform } from '@/shared/types/platform';
import type { Profile } from '@/shared/lib/profile-registry';
import { modal } from '@/shared/lib/modal';
import { toast } from '@/shared/lib/toast';
import dayjs from 'dayjs';

export const DataSettings = () => {
  const { t } = useI18n();
  const [isImportHistoryOpen, setIsImportHistoryOpen] = useState(false);
  const { exportData, importData, resetData, scanLibrary, isLoading } =
    useDataManagement();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive sync state
  const [gdriveSupported, setGdriveSupported] = useState(false);
  const [gdriveStatus, setGdriveStatus] = useState<{
    isAuthenticated: boolean;
    userEmail?: string;
    lastSyncTime?: number | null;
  }>({ isAuthenticated: false });
  const [gdriveSyncing, setGdriveSyncing] = useState<'up' | 'down' | null>(
    null,
  );
  const [gdriveConnecting, setGdriveConnecting] = useState(false);

  // Profile management state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fetchProfiles = async () => {
    try {
      const [statusRes, allRes] = await Promise.all([
        browser.runtime.sendMessage({ type: 'GET_PROFILE_STATUS' }),
        browser.runtime.sendMessage({ type: 'GET_ALL_PROFILES' }),
      ]);
      if (statusRes?.success && statusRes?.data?.activeProfile) {
        setActiveProfileId(statusRes.data.activeProfile.id);
      }
      if (allRes?.success && Array.isArray(allRes?.data)) {
        setProfiles(allRes.data);
      }
    } catch (e) {
      console.error('Failed to fetch profiles:', e);
    }
  };

  const fetchGdriveStatus = async () => {
    try {
      const supportRes = await browser.runtime.sendMessage({
        type: 'GDRIVE_CHECK_SUPPORT',
      });
      if (supportRes?.success) {
        setGdriveSupported(supportRes.data);
        if (!supportRes.data) return;
      }

      const res = await browser.runtime.sendMessage({
        type: 'GDRIVE_GET_STATUS',
      });
      if (res?.success) {
        setGdriveStatus(res.data);
      }
    } catch (e) {
      console.error('Failed to fetch GDrive status:', e);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchGdriveStatus();
  }, []);

  const handleGdriveConnect = async () => {
    setGdriveConnecting(true);
    try {
      const res = await browser.runtime.sendMessage({ type: 'GDRIVE_AUTH' });
      if (res?.success) {
        await fetchGdriveStatus();
        toast.success(
          t('data.gdriveConnectedAs', { email: res.data?.userEmail || '' }),
        );
      } else {
        toast.error(res?.error || 'Connection failed');
      }
    } catch (e) {
      console.error('GDrive connect error:', e);
    } finally {
      setGdriveConnecting(false);
    }
  };

  const handleGdriveDisconnect = async () => {
    setGdriveConnecting(true);
    try {
      await browser.runtime.sendMessage({ type: 'GDRIVE_DISCONNECT' });
      setGdriveStatus({ isAuthenticated: false });
    } catch (e) {
      console.error('GDrive disconnect error:', e);
    } finally {
      setGdriveConnecting(false);
    }
  };

  const handleGdriveBackup = async () => {
    setGdriveSyncing('up');
    try {
      const res = await browser.runtime.sendMessage({ type: 'GDRIVE_SYNC_UP' });
      if (res?.success) {
        toast.success(t('data.gdriveBackupSuccess'));
        await fetchGdriveStatus();
      } else {
        toast.error(res?.error || t('data.gdriveBackupFailed'));
      }
    } catch (e) {
      toast.error(t('data.gdriveBackupFailed'));
    } finally {
      setGdriveSyncing(null);
    }
  };

  const handleGdriveRestore = async () => {
    const confirmed = await modal.confirm({
      title: t('data.gdriveRestore'),
      content: t('data.gdriveRestoreConfirm'),
      confirmText: t('data.gdriveRestore'),
      cancelText: t('common.cancel'),
    });
    if (!confirmed) return;

    setGdriveSyncing('down');
    try {
      const res = await browser.runtime.sendMessage({
        type: 'GDRIVE_SYNC_DOWN',
      });
      if (res?.success) {
        toast.success(t('data.gdriveRestoreSuccess'));
        await fetchGdriveStatus();
      } else {
        toast.error(res?.error || t('data.gdriveRestoreFailed'));
      }
    } catch (e) {
      toast.error(t('data.gdriveRestoreFailed'));
    } finally {
      setGdriveSyncing(null);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importData(file);
    }
    e.target.value = '';
  };

  const handleCreateProfile = async () => {
    const name = newProfileName.trim();
    if (!name) return;
    setProfileLoading(true);
    try {
      const res = await browser.runtime.sendMessage({
        type: 'CREATE_PROFILE',
        payload: { name },
      });
      if (res?.success) {
        toast.success(`Profile "${name}" created`);
        setNewProfileName('');
        setCreatingProfile(false);
        await fetchProfiles();
      }
    } catch (e) {
      console.error('Failed to create profile:', e);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (profileId === activeProfileId) return;
    setProfileLoading(true);
    try {
      const res = await browser.runtime.sendMessage({
        type: 'SWITCH_PROFILE',
        payload: { profileId },
      });
      if (res?.success) {
        toast.success(`Switched to "${res.data.profileName}"`);
        await fetchProfiles();
      }
    } catch (e) {
      console.error('Failed to switch profile:', e);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleDeleteProfile = async (profile: Profile) => {
    if (profile.id === activeProfileId) return;

    const confirmed = await modal.confirm({
      title: `Delete "${profile.name}"?`,
      content: `This will remove the profile and its database (${profile.dbName}). This cannot be undone.`,
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (!confirmed) return;

    setProfileLoading(true);
    try {
      const res = await browser.runtime.sendMessage({
        type: 'DELETE_PROFILE',
        payload: { profileId: profile.id },
      });
      if (res?.success) {
        toast.success(`Profile "${profile.name}" deleted`);
        await fetchProfiles();
      } else {
        toast.error(res?.error || 'Delete failed');
      }
    } catch (e) {
      console.error('Failed to delete profile:', e);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleRename = async (profileId: string) => {
    const name = renameValue.trim();
    if (!name) return;
    setProfileLoading(true);
    try {
      const res = await browser.runtime.sendMessage({
        type: 'RENAME_PROFILE',
        payload: { profileId, name },
      });
      if (res?.success) {
        setRenamingId(null);
        setRenameValue('');
        await fetchProfiles();
      }
    } catch (e) {
      console.error('Failed to rename profile:', e);
    } finally {
      setProfileLoading(false);
    }
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const platformBadge = (platform: string, username: string) => {
    const config = PLATFORM_CONFIG[platform as Platform];
    return (
      <span
        key={platform}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted text-xs"
      >
        {config?.icon && <img src={config.icon} alt="" className="w-3 h-3" />}
        <span className="text-muted-foreground">
          {config?.name || platform}:
        </span>
        <span className="font-mono">{username}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Data Sync ── */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('data.librarySync')}</h3>
        <Separator />
        <div className="grid gap-4 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                {t('data.scanLibrary')}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('data.scanLibraryDescription')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={scanLibrary}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('data.scanLibrary')}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium">
                {t('data.importConversationData')}
              </span>
              <p className="text-xs text-muted-foreground">
                {t('data.importConversationDataDescription')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setIsImportHistoryOpen(true)}
              disabled={isLoading}
            >
              <FileUp className="h-4 w-4" />
              {t('data.importConversationData')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Google Drive Sync ── */}
      {gdriveSupported && (
        <div className="space-y-2">
          <h3 className="text-lg font-medium">{t('data.gdriveSync')}</h3>
          <Separator />
          <div className="mt-3 p-4 border rounded-lg bg-muted/10 space-y-3">
            {/* Status */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-sm font-medium">
                  {gdriveStatus.isAuthenticated
                    ? t('data.gdriveConnectedAs', {
                        email: gdriveStatus.userEmail || '',
                      })
                    : t('data.gdriveNotConnected')}
                </span>
                {gdriveStatus.lastSyncTime && (
                  <p className="text-xs text-muted-foreground">
                    {t('data.gdriveLastSync')}:{' '}
                    {dayjs
                      .unix(gdriveStatus.lastSyncTime)
                      .format('YYYY-MM-DD HH:mm')}
                  </p>
                )}
              </div>
              {gdriveStatus.isAuthenticated ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleGdriveDisconnect}
                  disabled={gdriveConnecting || gdriveSyncing !== null}
                >
                  {gdriveConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unlink className="h-4 w-4" />
                  )}
                  {t('data.gdriveDisconnect')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleGdriveConnect}
                  disabled={gdriveConnecting}
                >
                  {gdriveConnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link className="h-4 w-4" />
                  )}
                  {t('data.gdriveConnect')}
                </Button>
              )}
            </div>

            {/* Sync buttons */}
            {gdriveStatus.isAuthenticated && (
              <>
                <Separator />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={handleGdriveBackup}
                    disabled={gdriveSyncing !== null}
                  >
                    {gdriveSyncing === 'up' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    {t('data.gdriveBackup')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={handleGdriveRestore}
                    disabled={gdriveSyncing !== null}
                  >
                    {gdriveSyncing === 'down' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <DownloadCloud className="h-4 w-4" />
                    )}
                    {t('data.gdriveRestore')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-500" />
                  {t('data.gdriveRestoreWarning')}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Profiles & Storage ── */}
      <div className="space-y-2">
        <h3 className="text-lg font-medium">{t('data.storageManagement')}</h3>
        <Separator />

        {/* Active profile card */}
        {activeProfile && (
          <div className="mt-3 p-4 border rounded-lg bg-muted/10 space-y-3">
            {/* Header row */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <span className="text-sm font-semibold">
                {activeProfile.name}
              </span>
            </div>

            {/* Accounts */}
            {Object.keys(activeProfile.accounts).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(activeProfile.accounts).map(([p, u]) =>
                  platformBadge(p, u as string),
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No accounts bound yet
              </p>
            )}

            {/* Actions for active profile: export, import, reset */}
            <Separator />
            <div className="grid gap-2">
              {/* Export */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    {t('data.exportData')}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t('data.exportDataDescription')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={exportData}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {t('data.export')}
                </Button>
              </div>

              {/* Import */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    {t('data.importData')}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t('data.importDataDescription')}
                  </p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".db,.sqlite,.sql"
                  onChange={handleFileChange}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleImportClick}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {t('data.import')}
                </Button>
              </div>

              {/* Reset */}
              <div className="flex items-center justify-between mt-1 p-3 border rounded-md bg-destructive/5">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium text-destructive">
                    {t('data.resetDatabase')}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t('data.resetDatabaseDescription')}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  onClick={resetData}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {t('data.resetData')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Other profiles list */}
        {profiles.filter((p) => p.id !== activeProfileId).length > 0 && (
          <div className="space-y-2 mt-3">
            {profiles
              .filter((p) => p.id !== activeProfileId)
              .map((profile) => {
                const accounts = Object.entries(profile.accounts || {});
                const isRenaming = renamingId === profile.id;

                return (
                  <div
                    key={profile.id}
                    className="group relative flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      {isRenaming ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(profile.id);
                              if (e.key === 'Escape') {
                                setRenamingId(null);
                                setRenameValue('');
                              }
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleRename(profile.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setRenamingId(null);
                              setRenameValue('');
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-medium">
                            {profile.name}
                          </span>
                          {accounts.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {accounts.map(([p, u]) => platformBadge(p, u))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {!isRenaming && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-accent/90 backdrop-blur-sm rounded-md px-1 py-0.5 shadow-sm">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => handleSwitchProfile(profile.id)}
                          disabled={profileLoading}
                        >
                          Switch
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            setRenamingId(profile.id);
                            setRenameValue(profile.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteProfile(profile)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {/* Create new profile */}
        <div className="mt-2">
          {!creatingProfile ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setCreatingProfile(true)}
              disabled={profileLoading}
            >
              <Plus className="h-4 w-4" />
              New Profile
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Profile name..."
                className="flex-1 h-8"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateProfile();
                  if (e.key === 'Escape') {
                    setCreatingProfile(false);
                    setNewProfileName('');
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateProfile}
                disabled={!newProfileName.trim() || profileLoading}
              >
                {t('common.create')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreatingProfile(false);
                  setNewProfileName('');
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </div>
      </div>

      <ImportHistoryDialog
        isOpen={isImportHistoryOpen}
        onClose={() => setIsImportHistoryOpen(false)}
      />
    </div>
  );
};
