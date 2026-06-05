import React from 'react';
import { Copy, FileCode } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { toast } from '@/shared/lib/toast';
import { stripMarkdown } from '@/shared/lib/utils/utils';

interface ContentToolbarProps {
  /** Raw markdown content to operate on */
  content: string;
  /** Optional extra actions to render after the built-in ones */
  extra?: React.ReactNode;
}

/**
 * A compact toolbar rendered below content blocks (messages, context, etc.)
 * providing copy-as-text, copy-as-markdown, and extensible action slots.
 */
export const ContentToolbar = ({ content, extra }: ContentToolbarProps) => {
  const { t } = useI18n();

  const handleCopyAsText = async () => {
    const plain = stripMarkdown(content);
    await navigator.clipboard.writeText(plain);
    toast.success(t('toast.copiedToClipboard'), 1500);
  };

  const handleCopyAsMarkdown = async () => {
    await navigator.clipboard.writeText(content);
    toast.success(t('toast.copiedToClipboard'), 1500);
  };

  return (
    <div className="flex items-center gap-0.5 pt-2 mt-2 border-t border-border/40">
      <SimpleTooltip content={t('search.copyAsText')}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleCopyAsText}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </SimpleTooltip>
      <SimpleTooltip content={t('search.copyAsMarkdown')}>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={handleCopyAsMarkdown}
        >
          <FileCode className="h-3.5 w-3.5" />
        </Button>
      </SimpleTooltip>
      {extra}
    </div>
  );
};
