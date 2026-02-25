import React from 'react';
import { Separator } from '../../../components/ui/separator';
import { useI18n } from '@/shared/hooks/useI18n';
import { ExternalLink } from 'lucide-react';

export const AboutSettings = () => {
    const { t } = useI18n();
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-medium">{t('about.title')}</h3>
          <Separator />
          <div className="space-y-4 py-4">
            <div className="grid gap-1">
              <h3 className="font-medium">{t('about.appName')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('about.version')} {browser.runtime.getManifest().version}
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="font-medium">{t('about.developer')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('about.developerName')}
              </p>
            </div>

            <Separator className="my-2" />

            <div className="grid gap-2">
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
      </div>
    );
};
