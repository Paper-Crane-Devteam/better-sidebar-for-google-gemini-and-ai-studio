import React, { useEffect } from 'react';
import { useWhatsNew } from './useWhatsNew';
import { CHANGELOG, CURRENT_VERSION } from './changelog';
import { Sparkles, CheckCircle2, Wrench, Github, Star } from 'lucide-react';
import { useModalStore } from '@/shared/lib/modal';

export const WhatsNewDialog = () => {
  const { isOpen, markAsSeen } = useWhatsNew();
  const open = useModalStore((state) => state.open);
  const close = useModalStore((state) => state.close);

  useEffect(() => {
    if (isOpen) {
      const latestUpdate =
        CHANGELOG.find((item) => item.version === CURRENT_VERSION) ||
        CHANGELOG[0];

      open({
        id: 'whats-new-modal',
        title: (
          <div className="flex items-center gap-2 text-xl">
            <Sparkles className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            What's New in v{CURRENT_VERSION}
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
                      <Sparkles className="w-4 h-4" /> New Features
                    </h4>
                    <ul className="space-y-3">
                      {latestUpdate.features.map((feature, idx) => (
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
                      ))}
                    </ul>
                  </div>
                )}

                {/* Fixes Section */}
                {latestUpdate.fixes && latestUpdate.fixes.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-primary flex items-center gap-2">
                      <Wrench className="w-4 h-4" /> Improvements & Fixes
                    </h4>
                    <ul className="space-y-2">
                      {latestUpdate.fixes.map((fix, idx) => (
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

                {/* Open Source Section */}
                {/* <div className="bg-muted/30 p-4 rounded-lg border border-border/50">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
                    <Github className="w-4 h-4" /> Open Source
                  </h4>
                  <p className="text-sm text-foreground/90 mb-3">
                    This project is now open source! If you find it useful,
                    please consider giving us a star on GitHub. It helps a lot!
                  </p>
                  <a
                    href="https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 rounded-md w-full transition-colors"
                  >
                    <Star className="w-4 h-4 fill-current" />
                    Star on GitHub
                  </a>
                </div> */}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Welcome to the latest version! Enjoy the updates.
              </p>
            )}
          </div>
        ),
        confirmText: 'Awesome!',
        onConfirm: () => {
          markAsSeen();
          close();
        },
        modalClassName: 'sm:max-w-[600px]',
      });
    }
  }, [isOpen, open, close, markAsSeen]);

  return null;
};
