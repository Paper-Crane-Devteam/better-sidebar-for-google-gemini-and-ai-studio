import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWhatsNew } from './useWhatsNew';
import { getChangelog, CURRENT_VERSION, type ChangeLogItem } from './changelog';
import {
  Sparkles,
  CheckCircle2,
  Wrench,
  Heart,
} from 'lucide-react';
import { useModalStore } from '@/shared/lib/modal';
import { useI18n } from '@/shared/hooks/useI18n';

export const WhatsNewDialog = () => {
  const { t, i18n } = useTranslation();
  const { currentLanguage } = useI18n();
  const { isOpen, markAsSeen } = useWhatsNew();
  const open = useModalStore((state) => state.open);
  const close = useModalStore((state) => state.close);

  useEffect(() => {
    if (isOpen) {
      const changelog = getChangelog();
      const latestUpdate =
        changelog.find(
          (item: ChangeLogItem) => item.version === CURRENT_VERSION,
        ) || changelog[0];

      open({
        id: 'whats-new-modal',
        title: (
          <div className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            {t('whatsNew.title', { version: CURRENT_VERSION })}
          </div>
        ),
        content: (
          <div className="space-y-6 py-2">
            {latestUpdate ? (
              <div className="space-y-6">
                {/* Features Section */}
                {latestUpdate.features && latestUpdate.features.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> {t('whatsNew.features')}
                    </h4>
                    <ul className="space-y-3">
                      {latestUpdate.features.map(
                        (feature: string, idx: number) => (
                          <li
                            key={idx}
                            className="text-sm text-muted-foreground flex items-start gap-2"
                          >
                            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                            <span
                              dangerouslySetInnerHTML={{
                                __html: feature.replace(
                                  /\*\*(.*?)\*\*/g,
                                  '<strong>$1</strong>',
                                ),
                              }}
                            />
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

                {/* Fixes Section */}
                {latestUpdate.fixes && latestUpdate.fixes.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                      <Wrench className="w-4 h-4" /> {t('whatsNew.fixes')}
                    </h4>
                    <ul className="space-y-2">
                      {latestUpdate.fixes.map((fix: string, idx: number) => (
                        <li
                          key={idx}
                          className="text-sm text-muted-foreground flex items-start gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-1.5 ml-1 shrink-0" />
                          <span>{fix}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Announcement Section */}
                {latestUpdate.announcement && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                      <Heart className="w-4 h-4 text-pink-500" /> {latestUpdate.announcement.title}
                    </h4>
                    <ul className="space-y-2">
                      {latestUpdate.announcement.content.map((line: string, idx: number) => (
                        <li
                          key={idx}
                          className="text-sm text-muted-foreground flex items-start gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-pink-400 mt-1.5 ml-1 shrink-0" />
                          <span
                            dangerouslySetInnerHTML={{
                              __html: line.replace(
                                /\*\*(.*?)\*\*/g,
                                '<strong>$1</strong>',
                              ),
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Support Buttons */}
                <div className="flex flex-col items-center gap-2 pt-2 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    {t('whatsNew.enjoyingIt')}
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://chromewebstore.google.com/detail/cjeoaidogoaekodkbhijgljhenknkenj"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                    >
                      {t('whatsNew.rateUs')}
                    </a>
                    <a
                      href="https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                    >
                      {t('whatsNew.starOnGithub')}
                    </a>
                    <a
                      href={
                        currentLanguage === 'zh-CN'
                          ? 'https://afdian.com/a/papercranedev'
                          : 'https://ko-fi.com/papercranedev57397'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted/50"
                    >
                      {t('whatsNew.buyMeACoffee')}
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('whatsNew.welcome')}
              </p>
            )}
          </div>
        ),
        confirmText: t('whatsNew.awesome'),
        onConfirm: () => {
          markAsSeen();
        },
        modalClassName: 'sm:max-w-[600px]',
      });
    }
  }, [isOpen, open, close, markAsSeen, t, i18n.language]);

  return null;
};
