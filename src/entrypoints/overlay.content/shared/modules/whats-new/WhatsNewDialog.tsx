import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useWhatsNew } from './useWhatsNew';
import { getChangelog, CURRENT_VERSION, getEntryMarkdown, isMajorVersion } from './changelog';
import type { ChangeLogEntry } from './changelog';
import { X, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { useI18n } from '@/shared/hooks/useI18n';
// Served from `public/` instead of imported — see the note in
// ImportHistoryDialog.tsx: assets imported into a content script are inlined as
// base64 and count against addons-linter's 5 MB per-file limit.
const snippetDemoGif = browser.runtime.getURL('/images/snippet-demo.gif');
import { Z_INDEX } from '@/shared/lib/z-index';
import { WhatsNewToast } from './WhatsNewToast';

export const WhatsNewDialog = () => {
  const { t } = useTranslation();
  const { currentLanguage } = useI18n();
  const { isOpen, closeWhatsNew, showAll, setShowAll } = useWhatsNew();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeWhatsNew();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeWhatsNew]);

  // Scroll to top on open
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  const changelog = getChangelog();
  const filteredChangelog = showAll
    ? changelog
    : changelog.filter((item) => isMajorVersion(item.version));
  const hasPatchVersions = changelog.some((item) => !isMajorVersion(item.version));

  return (
    <>
      <WhatsNewToast />
      {isOpen && (
    // The entire overlay is scrollable — like browsing a web page
    <div
      ref={scrollRef}
      className="fixed inset-0 overflow-y-auto animate-in fade-in-0 duration-200"
      style={{
        zIndex: Z_INDEX.MODAL,
        backgroundColor: 'var(--overlay-bg)',
        backdropFilter: 'var(--overlay-blur)',
        WebkitBackdropFilter: 'var(--overlay-blur)',
      }}
    >
      <div className="min-h-full flex justify-center py-12 px-4">
        {/* The "page" — no fixed height, flows naturally */}
        <div
          className="relative w-full max-w-3xl rounded-xl shadow-[shadow:var(--shadow-panel)] animate-in slide-in-from-bottom-6 duration-300"
        >
          {/* Sticky close button — h-0 so it doesn't push content down */}
          <div className="sticky top-3 z-10 h-0 flex justify-end pr-3 pointer-events-none">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full shadow-lg pointer-events-auto opacity-80 hover:opacity-100 transition-opacity translate-y-3"
              onClick={closeWhatsNew}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Header */}
          <div
            className="rounded-t-xl px-10 pt-10 pb-8"
            style={{ backgroundColor: 'var(--panel-bg)' }}
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-yellow-500/10">
                <Sparkles className="w-6 h-6 text-yellow-500 fill-yellow-500" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold tracking-tight">
                  {t('whatsNew.title', { version: CURRENT_VERSION })}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('whatsNew.changelogSubtitle')}
                </p>
              </div>
              {hasPatchVersions && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground gap-1"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? (
                    <>
                      {t('whatsNew.hidePatchVersions')}
                      <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      {t('whatsNew.showAllVersions')}
                      <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Content — flows like a document */}
          <div
            className="rounded-b-xl px-10 py-8 space-y-12"
            style={{ backgroundColor: 'var(--panel-bg)' }}
          >
            {filteredChangelog.map((item: ChangeLogEntry, index: number) => {
              const markdown = getEntryMarkdown(item);
              const isLatest = index === 0;
              const isPatch = !isMajorVersion(item.version);

              return (
                <article key={item.version}>
                  {/* Version header */}
                  <div className="flex items-baseline gap-3 mb-5">
                    <h2 className={`font-semibold ${
                      isPatch
                        ? 'text-sm text-muted-foreground'
                        : `text-base ${isLatest ? 'text-primary' : 'text-foreground'}`
                    }`}>
                      v{item.version}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {item.date}
                    </span>
                    {isLatest && (
                      <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        Latest
                      </span>
                    )}
                    {isPatch && (
                      <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {t('whatsNew.patch')}
                      </span>
                    )}
                  </div>

                  {/* Markdown body */}
                  <MarkdownRenderer className={isPatch ? 'text-xs' : 'text-sm'}>
                    {markdown}
                  </MarkdownRenderer>

                  {/* Inline media for specific versions */}
                  {item.version === '2.8.0' && (
                    <img
                      src={snippetDemoGif}
                      alt="Snippet Demo"
                      className="rounded-md shadow-sm w-full h-auto object-contain mt-4"
                      loading="lazy"
                    />
                  )}

                  {isLatest && (
                    <div className="mt-8 pt-5 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t('whatsNew.enjoyingIt')}
                      </span>
                      <div className="flex flex-wrap items-center gap-1">
                        <a
                          href="https://chromewebstore.google.com/detail/cjeoaidogoaekodkbhijgljhenknkenj"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-muted/50"
                        >
                          {t('whatsNew.rateUs')}
                        </a>
                        <a
                          href="https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-muted/50"
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
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-muted/50"
                        >
                          {t('whatsNew.buyMeACoffee')}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  {index < filteredChangelog.length - 1 && (
                    <div className={`border-b border-border/40 ${isPatch ? 'mt-6' : 'mt-10'}`} />
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </div>
      )}
    </>
  );
};
