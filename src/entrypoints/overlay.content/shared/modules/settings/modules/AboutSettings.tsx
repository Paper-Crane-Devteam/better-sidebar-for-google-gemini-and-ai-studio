import React from 'react';
import { Separator } from '../../../components/ui/separator';
import { useI18n } from '@/shared/hooks/useI18n';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { useWhatsNewStore } from '../../whats-new/whats-new-store';
import { UpdateAction, UpdateStatus, useUpdateCheck } from './UpdateCheck';

// Served from public/images (web-accessible), same as the other overlay images.
const appIcon = browser.runtime.getURL('/images/icon.png');
const betterPlaylistsIcon = browser.runtime.getURL('/images/better-playlists.png');

// The Chrome Web Store dashboard reads utm_source / utm_medium / utm_campaign
// and reports them under Analytics → Sources.
const withUtm = (url: string) => {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'better-sidebar');
  u.searchParams.set('utm_medium', 'extension');
  u.searchParams.set('utm_campaign', 'about-tab');
  return u.toString();
};

const OTHER_EXTENSIONS = [
  {
    id: 'better-playlists',
    name: 'Better Playlists',
    descKey: 'about.betterPlaylistsDesc',
    icon: betterPlaylistsIcon,
    url: withUtm(
      'https://chromewebstore.google.com/detail/better-playlists-youtube/dbkjpepjgmodcoanoaokohenmkdldffa',
    ),
  },
] as const;

export const AboutSettings = () => {
    const { t } = useI18n();
    const openWhatsNew = useWhatsNewStore((s) => s.open);
    const update = useUpdateCheck();

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">{t('about.title')}</h3>
          <Separator />
          <div className="space-y-4 py-4">
            {/* Version card: status sits with the version, the action on the right. */}
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <img
                src={appIcon}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 shrink-0 rounded-lg"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium leading-tight">{t('about.appName')}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                      <span>v{browser.runtime.getManifest().version}</span>
                      <UpdateStatus state={update.state} />
                    </div>
                  </div>
                  <UpdateAction
                    state={update.state}
                    onCheck={update.check}
                    onApply={update.apply}
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 rounded-sm pt-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => openWhatsNew()}
                >
                  {t('about.changelog')}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {t('about.developer')} {t('about.developerName')}
            </p>

            <Separator className="my-2" />

            <div className="grid gap-2">
              <a
                href="https://papercranedev.com/better-sidebar/guide/getting-started"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
              >
                {t('about.userGuide')}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>

              <a
                href="https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
              >
                {t('about.githubRepository')}
                <ExternalLink className="h-3 w-3" />
              </a>

              <a
                href="https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio/blob/main/PRIVACY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
              >
                {t('settings.privacyPolicy')}
                <ExternalLink className="h-3 w-3" />
              </a>

              <a
                href="https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio/blob/main/TERMS.md"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
              >
                {t('settings.termsOfService')}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Cross-promotion: other extensions by the same developer */}
        <div className="space-y-2">
          <h3 className="text-lg font-medium">{t('about.moreExtensions')}</h3>
          <Separator />
          <div className="grid gap-2 py-4">
            {OTHER_EXTENSIONS.map((ext) => (
              <a
                key={ext.id}
                href={ext.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <img
                  src={ext.icon}
                  alt=""
                  aria-hidden="true"
                  className="h-10 w-10 shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {ext.name}
                    <ExternalLink
                      className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {t(ext.descKey)}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
};
