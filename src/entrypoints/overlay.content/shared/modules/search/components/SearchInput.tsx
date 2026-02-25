import React, { useMemo, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { useAppStore } from '@/shared/lib/store';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { CaseSensitive, Type, MoreHorizontal, HelpCircle } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useCurrentConversationId } from '../../../hooks/useCurrentConversationId';

const SEARCH_DEBOUNCE_MS = 500;

export const SearchInput = () => {
  const { t } = useI18n();
  const { query, options, isSearching } = useAppStore(
    (state) => state.ui.search,
  );

  const { setSearchQuery, setSearchOptions, performGlobalSearch } =
    useAppStore();

  const currentConversationId = useCurrentConversationId();

  const debouncedSearch = useMemo(
    () => debounce(() => performGlobalSearch(), SEARCH_DEBOUNCE_MS),
    [performGlobalSearch],
  );

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  // When leaving a conversation page, auto-reset scope to "all"
  useEffect(() => {
    if (!currentConversationId && options.conversationId) {
      setSearchOptions({ conversationId: undefined });
      debouncedSearch();
    }
  }, [currentConversationId]);

  const handleQueryChange = (value: string) => {
    setSearchQuery(value);
    debouncedSearch();
  };

  const isCurrentConvScope = !!options.conversationId;

  return (
    <div className="flex flex-col gap-2 p-4 border-b">
      <div className="relative flex items-center">
        <Input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className="pr-24"
          autoFocus
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7',
              options.caseSensitive && 'bg-accent text-accent-foreground',
            )}
            onClick={() => {
              setSearchOptions({ caseSensitive: !options.caseSensitive });
              debouncedSearch();
            }}
            title={t('search.matchCase')}
          >
            <CaseSensitive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7',
              options.wholeWord && 'bg-accent text-accent-foreground',
            )}
            onClick={() => {
              setSearchOptions({ wholeWord: !options.wholeWord });
              debouncedSearch();
            }}
            title={t('search.wholeWord')}
          >
            <Type className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-muted-foreground hover:text-foreground select-none">
        <div
          className={cn(
            'flex items-center gap-1',
            !options.showOptions && 'invisible',
          )}
        >
          <span className="text-xs">{t('search.foldersToInclude')}</span>
          <SimpleTooltip content={t('search.foldersIncludeTooltip')}>
            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
          </SimpleTooltip>
        </div>
        <MoreHorizontal
          className="h-4 w-4 cursor-pointer"
          onClick={() =>
            setSearchOptions({ showOptions: !options.showOptions })
          }
        />
      </div>

      {options.showOptions && (
        <div className="flex flex-col gap-2 animate-in slide-in-from-top-2 fade-in duration-200">
          <Input
            value={options.include}
            onChange={(e) => {
              setSearchOptions({ include: e.target.value });
              debouncedSearch();
            }}
            placeholder={t('search.folderPlaceholder')}
            className="h-8 text-sm"
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted-foreground">
                {t('search.foldersToExclude')}
              </label>
              <SimpleTooltip content={t('search.foldersExcludeTooltip')}>
                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
              </SimpleTooltip>
            </div>
            <Input
              value={options.exclude}
              onChange={(e) => {
                setSearchOptions({ exclude: e.target.value });
                debouncedSearch();
              }}
              placeholder={t('search.folderPlaceholder')}
              className="h-8 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1 pt-1">
            <label className="text-xs text-muted-foreground">
              {t('search.searchScope')}
            </label>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
                <input
                  type="radio"
                  name="searchScope"
                  value="all"
                  checked={!isCurrentConvScope}
                  onChange={() => {
                    setSearchOptions({ conversationId: undefined });
                    debouncedSearch();
                  }}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span className="text-xs">{t('search.allConversations')}</span>
              </label>
              <SimpleTooltip
                content={
                  !currentConversationId
                    ? t('search.notInConversation')
                    : undefined
                }
              >
                <label
                  className={cn(
                    'flex items-center gap-1.5 transition-colors',
                    currentConversationId
                      ? 'cursor-pointer hover:text-foreground text-muted-foreground'
                      : 'cursor-not-allowed text-muted-foreground/40',
                  )}
                >
                  <input
                    type="radio"
                    name="searchScope"
                    value="current"
                    checked={isCurrentConvScope}
                    disabled={!currentConversationId}
                    onChange={() => {
                      if (currentConversationId) {
                        setSearchOptions({
                          conversationId: currentConversationId,
                        });
                        debouncedSearch();
                      }
                    }}
                    className="accent-primary h-3.5 w-3.5"
                  />
                  <span className="text-xs">
                    {t('search.currentConversationOnly')}
                  </span>
                </label>
              </SimpleTooltip>
            </div>
          </div>

          <div className="flex flex-col gap-1 pt-1">
            <label className="text-xs text-muted-foreground">
              {t('search.filterByRole')}
            </label>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
                <input
                  type="radio"
                  name="roleFilter"
                  value="all"
                  checked={options.roleFilter === 'all'}
                  onChange={() => {
                    setSearchOptions({ roleFilter: 'all' });
                    debouncedSearch();
                  }}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span className="text-xs">{t('search.all')}</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
                <input
                  type="radio"
                  name="roleFilter"
                  value="user"
                  checked={options.roleFilter === 'user'}
                  onChange={() => {
                    setSearchOptions({ roleFilter: 'user' });
                    debouncedSearch();
                  }}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span className="text-xs">{t('search.userOnly')}</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground text-muted-foreground transition-colors">
                <input
                  type="radio"
                  name="roleFilter"
                  value="model"
                  checked={options.roleFilter === 'model'}
                  onChange={() => {
                    setSearchOptions({ roleFilter: 'model' });
                    debouncedSearch();
                  }}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span className="text-xs">{t('search.modelOnly')}</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};;
