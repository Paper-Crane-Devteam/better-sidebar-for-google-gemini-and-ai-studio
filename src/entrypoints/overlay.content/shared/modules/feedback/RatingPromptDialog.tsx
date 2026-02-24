import React, { useEffect, useState } from 'react';
import { useRatingStore } from '@/shared/lib/rating-store';
import { useI18n } from '@/shared/hooks/useI18n';
import { Button } from '@/entrypoints/overlay.content/shared/components/ui/button';
import {
  Star,
  MessageSquare,
  Github,
  FileText,
  ThumbsUp,
  ThumbsDown,
  X,
} from 'lucide-react';
import { useAppStore } from '@/shared/lib/store';

export const RatingPromptDialog = () => {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'initial' | 'like' | 'dislike'>('initial');

  const hasPrompted = useRatingStore((state) => state.hasPrompted);
  const openCount = useRatingStore((state) => state.openCount);
  const installedAt = useRatingStore((state) => state.installedAt);
  const setHasPrompted = useRatingStore((state) => state.setHasPrompted);
  const incrementOpenCount = useRatingStore(
    (state) => state.incrementOpenCount,
  );
  const setInstalledAt = useRatingStore((state) => state.setInstalledAt);

  const { setActiveTab } = useAppStore();

  useEffect(() => {
    // Initialize installedAt if not set
    if (!installedAt) {
      setInstalledAt(Date.now());
    }

    // Increment open count when component mounts
    incrementOpenCount();
  }, []);

  useEffect(() => {
    if (hasPrompted) return;

    // Trigger conditions: e.g., opened more than 5 times or installed > 2 days ago
    const OPEN_THRESHOLD = 15;
    const TIME_THRESHOLD = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

    const hasEnoughUsage = openCount >= OPEN_THRESHOLD;
    const hasEnoughTime =
      installedAt && Date.now() - installedAt > TIME_THRESHOLD;

    if (hasEnoughUsage && hasEnoughTime) {
      // Small delay before showing the prompt
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 15000); // 15 seconds
      return () => clearTimeout(timer);
    }
  }, [hasPrompted, openCount, installedAt]);

  const handleClose = () => {
    setIsOpen(false);
    // Even if closed without action, we mark as prompted so we don't nag too often
    // Or we could delay it and prompt again later, but for now mark as prompted.
    setHasPrompted(true);
  };

  const handleRate = () => {
    // Generate Chrome Web Store link
    const storeLink = `https://chromewebstore.google.com/detail/cjeoaidogoaekodkbhijgljhenknkenj`;
    window.open(storeLink, '_blank');
    setHasPrompted(true);
    setIsOpen(false);
  };

  const handleOpenFeedbackTab = () => {
    setActiveTab('feedback');
    setHasPrompted(true);
    setIsOpen(false);
  };

  const handleOpenGithub = () => {
    window.open(
      'https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio/issues',
      '_blank',
    );
    setHasPrompted(true);
    setIsOpen(false);
  };

  const handleOpenForm = async () => {
    try {
      const manifest = browser.runtime.getManifest();
      const version = manifest.version;
      const platformInfo = await browser.runtime.getPlatformInfo();
      const os = platformInfo.os;
      const uninstallUrl = `https://docs.google.com/forms/d/e/1FAIpQLScsdAGOY7EccBP-RRyE-x-8kZWYMHMaL4dgREPLeuvJRnLtlA/viewform?usp=pp_url&entry.576566957=${version}&entry.1274489181=${os}`;
      window.open(uninstallUrl, '_blank');
    } catch (e) {
      window.open(
        'https://docs.google.com/forms/d/e/1FAIpQLScsdAGOY7EccBP-RRyE-x-8kZWYMHMaL4dgREPLeuvJRnLtlA/viewform',
        '_blank',
      );
    }
    setHasPrompted(true);
    setIsOpen(false);
  };

  // English fallbacks for texts if translation is missing
  const getInitialContent = () => {
    return (
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary">
          <Star className="w-8 h-8" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">{t('rating.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('rating.description')}
          </p>
        </div>
        <div className="flex w-full gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => setStep('dislike')}
          >
            <ThumbsDown className="w-4 h-4" />
            {t('rating.notReally')}
          </Button>
          <Button className="flex-1 gap-2" onClick={() => setStep('like')}>
            <ThumbsUp className="w-4 h-4" />
            {t('rating.yes')}
          </Button>
        </div>
      </div>
    );
  };

  const getLikeContent = () => {
    return (
      <div className="flex flex-col items-center gap-6 py-4">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 text-yellow-500">
          <Star className="w-8 h-8" fill="currentColor" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">{t('rating.awesome')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('rating.rateDescription')}
          </p>
        </div>
        <div className="flex w-full gap-3">
          <Button variant="ghost" onClick={handleClose}>
            {t('rating.maybeLater')}
          </Button>
          <Button onClick={handleRate} className="flex-1 gap-2">
            <Star className="w-4 h-4" fill="currentColor" />
            {t('rating.rateUs')}
          </Button>
        </div>
      </div>
    );
  };

  const getDislikeContent = () => {
    return (
      <div className="flex flex-col gap-4 py-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">{t('rating.sorry')}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('rating.sorryDescription')}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={handleOpenFeedbackTab}
          >
            <MessageSquare className="w-4 h-4 text-primary" />
            {t('rating.inAppFeedback')}
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3"
            onClick={handleOpenGithub}
          >
            <Github className="w-4 h-4 text-foreground" />
            {t('rating.githubIssue')}
          </Button>
        </div>

        <div className="flex justify-center mt-2">
          <Button variant="ghost" onClick={handleClose}>
            {t('rating.skip')}
          </Button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-8 fade-in-0"
      style={{ zIndex: 99999 }}
    >
      <div className="relative w-full max-w-sm bg-background border rounded-xl shadow-2xl flex flex-col p-6">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10 rounded-full w-8 h-8"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </Button>
        {step === 'initial' && getInitialContent()}
        {step === 'like' && getLikeContent()}
        {step === 'dislike' && getDislikeContent()}
      </div>
    </div>
  );
};
