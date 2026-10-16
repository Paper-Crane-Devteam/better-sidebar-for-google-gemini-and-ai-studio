import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Github, MessageCircle, Mail, ExternalLink, Heart } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';

const GITHUB_ISSUES_URL = 'https://github.com/Paper-Crane-Devteam/better-sidebar-for-google-ai-studio/issues';
const DISCORD_URL = 'https://discord.gg/FRzesxaGAx';
const EMAIL = 'contact@papercranedev.com';

interface ChannelCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}

const ChannelCard = ({ icon, title, description, buttonLabel, onClick }: ChannelCardProps) => (
  <div className="group rounded-lg border border-border/60 bg-card/50 p-4 transition-colors hover:bg-accent/50">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </div>
    <div className="mt-3 pl-12">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={onClick}
      >
        {buttonLabel}
        <ExternalLink className="h-3 w-3" />
      </Button>
    </div>
  </div>
);

export const FeedbackTab = () => {
  const { t } = useI18n();

  const handleOpenGithub = () => {
    window.open(GITHUB_ISSUES_URL, '_blank');
  };

  const handleOpenDiscord = () => {
    window.open(DISCORD_URL, '_blank');
  };

  const handleOpenEmail = () => {
    window.open(`mailto:${EMAIL}`, '_blank');
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="tab-header p-3 flex items-center justify-between h-12 shrink-0">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('tabs.feedback')}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto space-y-5">
          {/* Title & Description */}
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">{t('feedback.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('feedback.description')}
            </p>
          </div>

          {/* Channel Cards */}
          <div className="space-y-3">
            <ChannelCard
              icon={<Github className="h-4.5 w-4.5" />}
              title={t('feedback.githubTitle')}
              description={t('feedback.githubDescription')}
              buttonLabel={t('feedback.githubButton')}
              onClick={handleOpenGithub}
            />

            <ChannelCard
              icon={<MessageCircle className="h-4.5 w-4.5" />}
              title={t('feedback.discordTitle')}
              description={t('feedback.discordDescription')}
              buttonLabel={t('feedback.discordButton')}
              onClick={handleOpenDiscord}
            />

            <ChannelCard
              icon={<Mail className="h-4.5 w-4.5" />}
              title={t('feedback.emailTitle')}
              description={EMAIL}
              buttonLabel={t('feedback.emailButton')}
              onClick={handleOpenEmail}
            />
          </div>

          {/* Thank you note */}
          <div className="flex items-center gap-2 pt-2 justify-center text-xs text-muted-foreground">
            <Heart className="h-3.5 w-3.5 text-pink-500/70" />
            <span>{t('feedback.thankYou')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
