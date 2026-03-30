import React, { useState } from 'react';
import { List, PanelRightOpen } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { SimpleTooltip } from '@/shared/components/ui/tooltip';
import { useI18n } from '@/shared/hooks/useI18n';

interface Props {
  nodeCount: number;
  onRestore: () => void;
}

/**
 * Minimized state: a small icon tab on the right edge.
 * Hover expands into a single header bar with title + restore button.
 * Mouse-leave collapses back to the icon.
 */
export const SmartScrollbarMinimizedView: React.FC<Props> = ({
  nodeCount,
  onRestore,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { t } = useI18n();

  return (
    <div
      className={cn(
        'fixed right-0 top-1/2 -translate-y-1/2 z-[999998]',
        'flex flex-col items-end',
        'transition-all duration-300 ease-out',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2.5',
          'rounded-tl-xl rounded-bl-xl rounded-tr-none',
          'border border-r-0 border-border/30',
          'bg-background/80 backdrop-blur-xl',
          'text-muted-foreground',
          'shadow-lg shadow-black/5',
          'transition-all duration-300 ease-out',
          isHovered ? 'w-[200px]' : 'w-[40px]',
        )}
      >
        <List className="h-4 w-4 shrink-0" />

        {isHovered && (
          <>
            <span
              className={cn(
                'text-sm font-medium truncate flex-1 text-left',
                'animate-in fade-in duration-200',
              )}
            >
              {nodeCount} messages
            </span>
            <SimpleTooltip content={t('smartScrollbar.restoreOutline')}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
                className={cn(
                  'p-1 rounded-md shrink-0',
                  'hover:bg-accent/60 hover:text-foreground',
                  'transition-colors duration-150',
                )}
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
              </button>
            </SimpleTooltip>
          </>
        )}
      </div>
    </div>
  );
};
