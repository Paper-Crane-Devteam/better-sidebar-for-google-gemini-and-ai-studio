import { ChevronRight, Copy, MapPin } from 'lucide-react';
import { cn } from '@/shared/lib/utils/utils';
import { useI18n } from '@/shared/hooks/useI18n';
import { OverflowTooltip } from '@/shared/components/ui/overflow-tooltip';
import { toast } from '@/shared/lib/toast';
import { NodeActionBar } from '@/entrypoints/overlay.content/shared/components/node-action-bar';
import type { OutlineSection } from '../types';
import { OutlineNodeItem } from './OutlineNodeItem';

export function OutlineSectionItem({
  section,
  isActive,
  isCollapsed,
  onToggle,
  onNavigate,
  activeRef,
  dimmed = false,
}: {
  section: OutlineSection;
  isActive: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onNavigate: (messageId: string, headingLabel?: string, headingLevel?: string) => void;
  activeRef?: React.RefObject<HTMLDivElement>;
  /** Floating outline faded out: only the active row stays legible. */
  dimmed?: boolean;
}) {
  const { t } = useI18n();
  const hasChildren = section.children.length > 0;

  const handleCopyQuery = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Copy the full section content: user query + model response
    const parts: string[] = [];
    const userContent = section.userQueryFull || section.userQuery;
    parts.push(userContent);
    if (section.modelContent) {
      parts.push(section.modelContent);
    }
    navigator.clipboard.writeText(parts.join('\n\n'));
    toast.success(t('toast.copiedToClipboard'), 1000);
  };

  return (
    <div
      ref={activeRef}
      className={cn(
        'mx-1 rounded-md transition-opacity ease-out motion-reduce:transition-none',
        dimmed ? 'duration-300' : 'duration-150',
        dimmed && !isActive && 'opacity-[0.12]',
      )}
    >
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1 rounded-md relative min-w-0',
          hasChildren && 'cursor-pointer',
          'hover:bg-accent/50',
          // Its own opaque pill so it reads over page text; also opts back
          // into the pointer so hovering it wakes the panel.
          dimmed && isActive && 'pointer-events-auto bg-popover/95 shadow-sm',
        )}
        onClick={() => hasChildren && onToggle()}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent/80"
          >
            <ChevronRight
              className={cn(
                'h-3 w-3 transition-transform duration-150',
                !isCollapsed && 'rotate-90',
                isActive ? 'text-foreground' : 'text-muted-foreground/50',
              )}
            />
          </button>
        ) : (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center">
            <div
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                isActive ? 'bg-foreground' : 'bg-muted-foreground/30',
              )}
            />
          </div>
        )}

        <div className="flex-1 min-w-0 flex items-center overflow-hidden node-text-content">
          <OverflowTooltip
            content={section.userQueryFull || section.userQuery}
            placement="right"
            interactive
            className={cn(
              'text-sm leading-snug truncate flex-1',
              isActive ? 'text-foreground font-medium' : 'text-foreground',
            )}
          >
            {section.userQuery}
          </OverflowTooltip>
        </div>

        <NodeActionBar
          actions={[
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              tooltip: t('outline.copyQuery'),
              onClick: handleCopyQuery,
            },
            ...(section.userInDom
              ? [
                  {
                    icon: <MapPin className="h-3.5 w-3.5" />,
                    tooltip: t('outline.navigate'),
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      onNavigate(section.userMessageId);
                    },
                  },
                ]
              : []),
          ]}
        />
      </div>

      {hasChildren && !isCollapsed && (
        <div
          className={cn(
            'ml-4 border-l border-border/25 pl-2 mb-1 transition-opacity ease-out motion-reduce:transition-none',
            dimmed ? 'duration-300' : 'duration-150',
            dimmed && isActive && 'opacity-[0.12]',
          )}
        >
          {section.children.map((node) => (
            <OutlineNodeItem
              key={node.id}
              node={node}
              onNavigate={onNavigate}
              messageId={section.modelMessageId || section.userMessageId}
              modelContent={section.modelContent}
            />
          ))}
        </div>
      )}
    </div>
  );
}
