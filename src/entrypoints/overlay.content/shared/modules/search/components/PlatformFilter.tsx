import React, { useEffect } from 'react';
import { useAppStore } from '@/shared/lib/store';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/components/ui/dropdown-menu';
import { Filter } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { Platform, PLATFORM_CONFIG } from '@/shared/types/platform';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';

export const PlatformFilter = () => {
  const { t } = useI18n();
  const { options } = useAppStore((state) => state.ui.search);
  const { currentPlatform } = useAppStore((state) => state.ui.overlay);
  const { setSearchOptions, performGlobalSearch } = useAppStore();

  useEffect(() => {
    // If no platforms selected, select current platform by default
    if (!options.platforms || options.platforms.length === 0) {
       setSearchOptions({ platforms: [currentPlatform] });
    }
  }, []);

  const handlePlatformChange = (platform: string, checked: boolean) => {
    // Prevent unchecking current platform
    if (!checked && platform === currentPlatform) {
      return;
    }

    const currentPlatforms = options.platforms || [];
    let newPlatforms: string[];

    if (checked) {
      newPlatforms = [...currentPlatforms, platform];
    } else {
      newPlatforms = currentPlatforms.filter((p) => p !== platform);
    }

    setSearchOptions({ platforms: newPlatforms });
    performGlobalSearch();
  };

  const platforms = [
    {...PLATFORM_CONFIG[Platform.GEMINI]},
    {...PLATFORM_CONFIG[Platform.AI_STUDIO]},
    // {...PLATFORM_CONFIG[Platform.CHATGPT]},
    // {...PLATFORM_CONFIG[Platform.CLAUDE]},
  ];

  // Calculate active count for badge/indicator if needed
  const activeCount = options.platforms?.length || 0;

  return (
    <DropdownMenu modal={false}>
      <SimpleTooltip content={t('search.filterPlatform')}>
        <DropdownMenuTrigger asChild>
          <Button variant={activeCount > 1 ? "secondary" : "ghost"} size="icon" className="h-7 w-7">
            <Filter className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('search.filterPlatform')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {platforms.map((platform) => (
          <DropdownMenuCheckboxItem
            key={platform.id}
            checked={options.platforms?.includes(platform.id) ?? false}
            onCheckedChange={(checked) => handlePlatformChange(platform.id, checked)}
            disabled={platform.id === currentPlatform}
          >
            <div className="flex items-center gap-2">
              <img src={platform.icon} alt={platform.name} className="h-4 w-4" />
              <span>{platform.name}</span>
            </div>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
