import React, { useState } from 'react';
import { SearchInput } from './components/SearchInput';
import { SearchResults, SearchResultItem } from './components/SearchResults';
import { SidePanelMenu } from '../../components/menu/SidePanelMenu';
import { CopyMinus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';
import { useAppStore } from '@/shared/lib/store';
import { PlatformFilter } from './components/PlatformFilter';

export const SearchTab = ({
  extraHeaderButtons,
  menuActions,
  onNavigate,
}: {
  extraHeaderButtons?: React.ReactNode[];
  menuActions?: {
    onViewHistory?: () => void;
    onSwitchToOriginalUI?: () => void;
    onImportAiStudioSystem?: () => void;
  };
  onNavigate?: (match: any) => void;
}) => {
  const { results } = useAppStore((state) => state.ui.search);
  const { t } = useI18n();

  // Group results
  const grouped = React.useMemo(() => {
    const groups: Record<
      string,
      { conversation: any; matches: SearchResultItem[] }
    > = {};
    results.forEach((item: SearchResultItem) => {
      if (!groups[item.conversation_id]) {
        groups[item.conversation_id] = {
          conversation: {
            id: item.conversation_id,
            title: item.conversation_title,
            folderName: item.folder_name,
            platform: item.platform,
          },
          matches: [],
        };
      }
      groups[item.conversation_id].matches.push(item);
    });
    return groups;
  }, [results]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Auto-expand all when results change
  React.useEffect(() => {
    setExpandedIds(new Set(Object.keys(grouped)));
  }, [grouped]);

  const toggleGroup = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between h-12 shrink-0">
        <h1 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground/70">
          {t('search.title')}
        </h1>
        <div className="flex gap-1 items-center">
          <PlatformFilter />
          <SimpleTooltip content={t('menu.collapseAll')}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCollapseAll}
            >
              <CopyMinus className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          {extraHeaderButtons &&
            extraHeaderButtons.map((btn, i) => (
              <React.Fragment key={i}>{btn}</React.Fragment>
            ))}

          <SidePanelMenu menuActions={menuActions} />
        </div>
      </div>
      <SearchInput />
      <div className="flex-1 overflow-hidden">
        <SearchResults
          grouped={grouped}
          expandedIds={expandedIds}
          onToggleGroup={toggleGroup}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
};
