import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { useModalStore } from '@/shared/lib/modal';
import { openMessageSyncModal } from '../../message-sync/MessageSyncModal';
import {
  ChevronRight,
  ChevronDown,
  Info,
  ExternalLink,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import dayjs from 'dayjs';
import { browser } from 'wxt/browser';
import { MarkdownRenderer } from '@/shared/components/MarkdownRenderer';
import { ContentToolbar } from '@/shared/components/ContentToolbar';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import type { Message } from '@/shared/types/db';
import AIStudioIcon from '@/assets/icons/aistudio.png';
import GeminiIcon from '@/assets/icons/gemini.svg';
import { PLATFORM_CONFIG, Platform } from '@/shared/types/platform';

export interface SearchResultItem {
  id: string;
  content: string;
  role: 'user' | 'model';
  conversation_id: string;
  conversation_title: string;
  folder_id: string | null;
  folder_name: string | null;
  timestamp: number;
  external_url?: string;
  platform?: string;
  scroll_index?: number;
}

// Component for the message preview modal content with context
interface MessagePreviewContentProps {
  match: SearchResultItem;
  activeQuery: string;
  activeOptions: { caseSensitive?: boolean; wholeWord?: boolean };
}

const MessagePreviewContent = ({
  match,
  activeQuery,
  activeOptions,
}: MessagePreviewContentProps) => {
  const { t } = useI18n();
  const [adjacentMessage, setAdjacentMessage] = useState<Message | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const fetchAdjacentMessage = async () => {
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_ADJACENT_MESSAGE',
          payload: {
            messageId: match.id,
            conversationId: match.conversation_id,
            currentRole: match.role,
          },
        });
        if (response && response.success) {
          setAdjacentMessage(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch adjacent message', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdjacentMessage();
  }, [match.id, match.conversation_id, match.role]);

  const contextLabel =
    match.role === 'user' ? t('search.modelResponse') : t('search.userPrompt');

  return (
    <div className="flex flex-col gap-6">
      {/* Main message content */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {match.role === 'user'
              ? t('export.roleUser')
              : t('export.roleModel')}
          </span>
          <span>{dayjs(match.timestamp * 1000).format('lll')}</span>
        </div>
        <MarkdownRenderer
          highlight={activeQuery}
          highlightOptions={activeOptions}
        >
          {match.content}
        </MarkdownRenderer>
        <ContentToolbar content={match.content} />
      </div>

      {/* Context section - Adjacent message */}
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 -ml-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span>{t('search.context')}</span>
        </button>

        {isExpanded && (
          <div className="mt-2">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('search.loadingContext')}</span>
              </div>
            ) : adjacentMessage ? (
              <div className="rounded-lg bg-muted/40 p-4">
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {contextLabel}
                  </span>
                  {adjacentMessage.timestamp && (
                    <span>
                      {dayjs(adjacentMessage.timestamp * 1000).format('lll')}
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <MarkdownRenderer>
                    {adjacentMessage.content || ''}
                  </MarkdownRenderer>
                </div>
                <ContentToolbar content={adjacentMessage.content || ''} />
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-2 italic">
                {t('search.noContextFound')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const ResultGroup = ({
  conversationId,
  data,
  expanded,
  onToggle,
  untitledLabel,
  onNavigate,
}: {
  conversationId: string;
  data: { conversation: any; matches: SearchResultItem[] };
  expanded: boolean;
  onToggle: () => void;
  untitledLabel: string;
  onNavigate?: (match: SearchResultItem) => void;
}) => {
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center gap-1 p-1 hover:bg-accent/50 cursor-pointer text-sm"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <span className="font-medium truncate flex-1">
          {data.conversation.title || untitledLabel}
        </span>
        {data.conversation.folderName && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md truncate max-w-[100px]">
            {data.conversation.folderName}
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-1 bg-muted rounded-full px-2">
          {data.matches.length}
        </span>
      </div>

      {expanded && (
        <div className="flex flex-col ml-4 pl-2">
          {data.matches.map((match) => (
            <MatchItem
              key={match.id}
              match={match}
              onNavigate={onNavigate}
              platform={data.conversation.platform}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MatchItem = ({
  match,
  onNavigate,
  platform,
}: {
  match: SearchResultItem;
  onNavigate?: (match: SearchResultItem) => void;
  platform?: string;
}) => {
  const { t } = useI18n();
  const { activeQuery, activeOptions } = useAppStore(
    (state) => state.ui.search,
  );

  const getHighlightedText = (text: string, highlight: string) => {
    // Helper to render the container structure
    const userLabel = t('export.roleUser');
    const modelLabel = t('export.roleModel');
    const showPlatformIcon =
      activeOptions.platforms && activeOptions.platforms.length > 1;

    const renderWrapper = (content: React.ReactNode) => (
      <div className="text-xs text-muted-foreground py-1 px-2 hover:bg-accent/30 cursor-pointer rounded">
        <div className="font-sans text-[11px] mb-1 text-muted-foreground flex items-center gap-1">
          {showPlatformIcon && platform && (
            <img
              src={PLATFORM_CONFIG[platform as Platform].icon}
              className="w-3 h-3 object-contain"
              alt={PLATFORM_CONFIG[platform as Platform].name}
            />
          )}
          {match.role === 'user' ? userLabel : modelLabel} •{' '}
          {dayjs(match.timestamp * 1000).format('ll')}
        </div>
        <div className="line-clamp-4 break-words whitespace-pre-wrap font-sans text-[13px] text-foreground leading-relaxed">
          {content}
        </div>
      </div>
    );

    if (!highlight.trim()) {
      return renderWrapper(
        text.substring(0, 150) + (text.length > 150 ? '...' : ''),
      );
    }

    const escapeRegExp = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const escapedHighlight = escapeRegExp(highlight);
    let pattern = escapedHighlight;
    let flags = 'g';

    if (!activeOptions.caseSensitive) {
      flags += 'i';
    }

    if (activeOptions.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    const regex = new RegExp(`(${pattern})`, flags);
    const searchRegex = new RegExp(pattern, flags.replace('g', ''));
    const matchResult = searchRegex.exec(text);

    if (!matchResult) {
      return renderWrapper(
        text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      );
    }

    const index = matchResult.index;
    const matchLength = matchResult[0].length;
    let start = Math.max(0, index - 40);
    let end = Math.min(text.length, index + matchLength + 60);

    // Adjust start to previous word boundary to avoid cutting words in half
    if (start > 0) {
      const spaceIndex = text.indexOf(' ', start);
      if (spaceIndex !== -1 && spaceIndex < index) {
        start = spaceIndex + 1;
      }
    }

    // Adjust end to next word boundary to avoid cutting words in half
    if (end < text.length) {
      const spaceIndex = text.lastIndexOf(' ', end);
      if (spaceIndex !== -1 && spaceIndex > index + matchLength) {
        end = spaceIndex;
      }
    }

    const snippet =
      (start > 0 ? '...' : '') +
      text.substring(start, end) +
      (end < text.length ? '...' : '');

    const parts = snippet.split(regex);
    const highlightedContent = parts.map((part, i) =>
      i % 2 === 1 ? (
        <span
          key={i}
          className="bg-highlight/65 text-foreground rounded-[2px]"
        >
          {part}
        </span>
      ) : (
        part
      ),
    );

    return renderWrapper(highlightedContent);
  };

  const handleNavigation = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate?.(match);
  };

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    useModalStore.getState().open({
      title: t('search.messagePreview'),
      content: (
        <MessagePreviewContent
          match={match}
          activeQuery={activeQuery}
          activeOptions={activeOptions}
        />
      ),
      headerActions: (
        <SimpleTooltip content={t('common.close')}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => useModalStore.getState().close()}
          >
            <X className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
      ),
      modalClassName: 'max-w-4xl',
      type: 'confirm',
      confirmText: t('common.close'),
      cancelText: t('search.jumpToConversation'),
      onCancel: () => {
        useModalStore.getState().close();

        // Wait for modal to close
        setTimeout(() => {
          handleNavigation({
            preventDefault: () => {},
            stopPropagation: () => {},
          } as any);
        }, 100);
      },
      onConfirm: () => {
        useModalStore.getState().close();
      },
    });
  };

  return (
    <div className="relative group" onClick={handlePreview}>
      {getHighlightedText(match.content, activeQuery)}
      <SimpleTooltip content={t('search.jumpToConversation')}>
        <button
          onClick={handleNavigation}
          className="absolute top-2 right-2 p-1 bg-muted text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent z-10"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </SimpleTooltip>
    </div>
  );
};

export interface SearchResultsProps {
  grouped: Record<string, { conversation: any; matches: SearchResultItem[] }>;
  expandedIds: Set<string>;
  onToggleGroup: (id: string) => void;
  onNavigate?: (match: SearchResultItem) => void;
}

export const SearchResults = ({
  grouped,
  expandedIds,
  onToggleGroup,
  onNavigate,
}: SearchResultsProps) => {
  const { t } = useI18n();
  const { results, isSearching, activeQuery } = useAppStore(
    (state) => state.ui.search,
  );

  if (results.length === 0 && !isSearching) {
    if (!activeQuery?.trim()) {
      return null;
    }

    return (
      <div className="flex flex-col items-center justify-center pt-8 p-4 text-center animate-in fade-in-0 slide-in-from-bottom-2">
        <div className="text-sm text-muted-foreground mb-2">
          {t('search.noResults', { query: activeQuery })}
        </div>
        {/* The old version of this explained, in prose, that only visited chats are
            indexed — true, and no help. The status dialog says the same thing and
            then lets the user fix it, which is what someone staring at an empty
            result actually wants. */}
        <button
          onClick={openMessageSyncModal}
          className="text-xs text-blue-500 hover:text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
        >
          <Info className="w-3 h-3" />
          {t('search.whyNoOlder')}
        </button>
      </div>
    );
  }

  if (results.length === 0 && isSearching) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        {t('search.searching')}
      </div>
    );
  }

  const fileCount = Object.keys(grouped).length;
  const resultCount = results.length;

  return (
    <div
      className={cn(
        'flex flex-col h-full overflow-hidden',
        isSearching && 'opacity-60',
      )}
    >
      <div className="px-3 py-2 text-xs text-muted-foreground/70 font-medium">
        {t('search.resultsSummary', { count: resultCount, files: fileCount })}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {Object.entries(grouped).map(([id, data]) => (
          <ResultGroup
            key={id}
            conversationId={id}
            data={data}
            expanded={expandedIds.has(id)}
            onToggle={() => onToggleGroup(id)}
            untitledLabel={t('common.untitled')}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
};
